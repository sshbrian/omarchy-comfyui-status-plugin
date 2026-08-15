# omarchy-comfyui

Omarchy bar widget for [ComfyUI](https://github.com/Comfy-Org/ComfyUI). Shows **Idle** when the queue is empty, a sampler progress bar and **it/s** while generating, and **Offline** if the server is down.

Progress and it/s come from the companion custom node `comfyui-omarchy-status`. Without that node the widget still reports Offline / Idle / Working… from `GET /prompt`.

## Install

From a git remote:

```bash
omarchy plugin add <this-repo-url> --enable --yes
```

Or drop this directory at `~/.config/omarchy/plugins/comfyui.status`, then:

```bash
omarchy-shell shell rescanPlugins
omarchy plugin enable comfyui.status --section right
```

Install `comfyui-omarchy-status` into `ComfyUI/custom_nodes/` and restart ComfyUI so the status file is written.

## Settings

| Key | Default | Meaning |
|---|---|---|
| `host` | `127.0.0.1` | ComfyUI HTTP host |
| `port` | `8188` | ComfyUI HTTP port |

Left-click opens `http://<host>:<port>/`.

## Tests

```bash
node --test tests/test_model.js
```
