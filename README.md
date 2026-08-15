# omarchy-comfyui-status-plugin

Omarchy bar widget for [ComfyUI](https://github.com/Comfy-Org/ComfyUI). Shows **Idle** when the queue is empty, a sampler progress bar and **it/s** while generating, **Working…** between sampler nodes, and **Offline** if the server is down.

Left-click opens a dashboard with time remaining, the current node, a step-time sparkline, queue / last job / VRAM, checkpoint-size-seed facts, and today's session totals. Middle-click (or the panel stop button) posts `/interrupt`. Right-click still opens the ComfyUI UI.

Progress, it/s, ETA, and the extra dashboard fields come from the companion custom node [`comfyui-omarchy-status`](https://github.com/sshbrian/comfyui-omarchy-status). Without that node the widget still reports Offline / Idle / Working… from `GET /prompt`.

## Status

**Idle**

![Idle](docs/idle.png)

**Sampling**

![Sampling](docs/sampling.png)

**Working**

![Working](docs/working.png)

**Offline**

![Offline](docs/offline.png)

## Install

```bash
omarchy plugin add https://github.com/sshbrian/omarchy-comfyui-status-plugin.git --enable
```

Then install the companion node and restart ComfyUI:

```bash
cd /path/to/ComfyUI/custom_nodes
git clone https://github.com/sshbrian/comfyui-omarchy-status.git
```

Move the widget if you want:

```bash
omarchy bar move io.github.sshbrian.comfyui-status --section right
```

## Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `host` | `127.0.0.1` | ComfyUI HTTP host |
| `port` | `8188` | ComfyUI HTTP port |

| Click | Action |
| --- | --- |
| Left | Toggle the generation dashboard |
| Right | Open `http://<host>:<port>/` |
| Middle | Interrupt the running prompt |

The dashboard ETA is for the current sampler only, not the rest of the graph or queued prompts.

## Remove

```bash
omarchy plugin remove io.github.sshbrian.comfyui-status
```

The companion node is a separate checkout under `ComfyUI/custom_nodes/`. Remove that folder and delete `${XDG_STATE_HOME:-$HOME/.local/state}/omarchy/comfyui-status.json` if you no longer want the snapshot. The bar ignores a snapshot older than 90 seconds and falls back to Offline / Idle / Working… from `GET /prompt`.

## Tests

```bash
node --test tests/test_model.js
```
