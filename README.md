# omarchy-comfyui-status-plugin

Omarchy bar widget for [ComfyUI](https://github.com/Comfy-Org/ComfyUI). Shows **Idle** when the queue is empty, a sampler progress bar and **it/s** while generating, **Working…** between sampler nodes, and **Offline** if the server is down.

Progress and it/s come from the companion custom node [`comfyui-omarchy-status`](https://github.com/sshbrian/comfyui-omarchy-status). Without that node the widget still reports Offline / Idle / Working… from `GET /prompt`.

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

Left-click opens `http://<host>:<port>/`.

## Remove

```bash
omarchy plugin remove io.github.sshbrian.comfyui-status
```

The companion node is a separate checkout under `ComfyUI/custom_nodes/`; remove that folder if you no longer want the status file.

## Tests

```bash
node --test tests/test_model.js
```
