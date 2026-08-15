#!/usr/bin/env bash
# Capture bar-strip screenshots for the README and marketplace preview.
# Always restores widget host/port and kills the mock server.
set -euo pipefail

PLUGIN_ID="io.github.sshbrian.comfyui-status"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DOCS="$REPO/docs"
STATUS="${XDG_STATE_HOME:-$HOME/.local/state}/omarchy/comfyui-status.json"
SHELL_JSON="${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/shell.json"
MOCK_PORT=18188
MOCK_PID=""
WAIT_SECS="${WAIT_SECS:-2.6}"
RETURN_WS="$(hyprctl activeworkspace -j 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",2))' 2>/dev/null || echo 2)"

mkdir -p "$DOCS"
mkdir -p "$(dirname "$STATUS")"

# Approved README crop: weather + clock + status, bar height only.
CROP_LEFT=1692
CROP_WIDTH=1092
CROP_HEIGHT=52

bar_geometry() {
  python3 - <<'PY'
import json, subprocess
mons = json.loads(subprocess.check_output(["hyprctl", "monitors", "-j"], text=True))
mon = next((m for m in mons if m.get("focused")), mons[0])
print("%d,%d %dx35" % (int(mon["x"]), int(mon["y"]), int(mon["width"])))
PY
}

crop_bar() {
  magick "$1" -crop "${CROP_WIDTH}x${CROP_HEIGHT}+${CROP_LEFT}+0" +repage "$1"
}

write_status() {
  python3 - "$STATUS" "$@" <<'PY'
import json, sys, time
path = sys.argv[1]
state = sys.argv[2]
payload = {
    "schema": 1,
    "state": "running" if state != "idle" else "idle",
    "value": 0,
    "max": 0,
    "queue_remaining": 0,
    "prompt_id": None,
    "node": None,
    "updated_at": time.time(),
    "last_event": "status",
}
if state == "sampling":
    payload.update(value=float(sys.argv[3]), max=20, queue_remaining=1,
                   prompt_id="readme", node="3", last_event="progress")
elif state == "working":
    payload.update(queue_remaining=1, prompt_id="readme", node="8", last_event="executing")
elif state == "idle":
    pass
open(path, "w", encoding="utf-8").write(json.dumps(payload) + "\n")
PY
}

set_widget_port() {
  local port="$1"
  python3 - "$SHELL_JSON" "$PLUGIN_ID" "$port" <<'PY'
import json, sys
path, plugin_id, port = sys.argv[1], sys.argv[2], sys.argv[3]
cfg = json.loads(open(path, encoding="utf-8").read())
for section in cfg.get("bar", {}).get("layout", {}).values():
    for entry in section:
        if isinstance(entry, dict) and entry.get("id") == plugin_id:
            if port == "default":
                entry.pop("host", None)
                entry.pop("port", None)
            else:
                entry["host"] = "127.0.0.1"
                entry["port"] = int(port)
            open(path, "w", encoding="utf-8").write(json.dumps(cfg, indent=2) + "\n")
            raise SystemExit(0)
raise SystemExit(f"widget {plugin_id} not in shell.json")
PY
  omarchy-shell shell reloadConfig >/dev/null
}

start_mock() {
  python3 - "$MOCK_PORT" <<'PY' &
from http.server import BaseHTTPRequestHandler, HTTPServer
import json, sys
port = int(sys.argv[1])
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/prompt"):
            body = json.dumps({"exec_info": {"queue_remaining": 1}}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()
    def log_message(self, *args):
        pass
HTTPServer(("127.0.0.1", port), H).serve_forever()
PY
  MOCK_PID=$!
}

stop_mock() {
  if [[ -n "${MOCK_PID}" ]] && kill -0 "$MOCK_PID" 2>/dev/null; then
    kill "$MOCK_PID" 2>/dev/null || true
    wait "$MOCK_PID" 2>/dev/null || true
  fi
  MOCK_PID=""
}

restore() {
  stop_mock
  set_widget_port default || true
  write_status idle || true
  hyprctl eval "hl.dispatch(hl.dsp.focus({ workspace = \"${RETURN_WS}\" }))" >/dev/null || true
}

trap restore EXIT

geom="$(bar_geometry)"
echo "bar geometry: $geom"

# Idle against the real ComfyUI instance.
set_widget_port default
write_status idle
sleep "$WAIT_SECS"
grim -g "$geom" "$DOCS/idle.png"
crop_bar "$DOCS/idle.png"
echo "wrote $DOCS/idle.png"

start_mock
set_widget_port "$MOCK_PORT"

write_status sampling 1
sleep 3
write_status sampling 2
sleep 3
grim -g "$geom" "$DOCS/sampling.png"
crop_bar "$DOCS/sampling.png"
echo "wrote $DOCS/sampling.png"

# Marketplace card: full desktop so the bar is not a 34px sliver.
hyprctl eval 'hl.dispatch(hl.dsp.focus({ workspace = "5" }))' >/dev/null || true
sleep 0.6
grim -o HDMI-A-1 "$REPO/preview.png"
echo "wrote $REPO/preview.png"
hyprctl eval "hl.dispatch(hl.dsp.focus({ workspace = \"${RETURN_WS}\" }))" >/dev/null || true

write_status working
sleep "$WAIT_SECS"
grim -g "$geom" "$DOCS/working.png"
crop_bar "$DOCS/working.png"
echo "wrote $DOCS/working.png"

stop_mock
sleep "$WAIT_SECS"
grim -g "$geom" "$DOCS/offline.png"
crop_bar "$DOCS/offline.png"
echo "wrote $DOCS/offline.png"
