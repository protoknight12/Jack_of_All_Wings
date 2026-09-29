# MIM-104 Patriot launcher (M901-style launcher + tractor)

- Model: `model/mim-104.obj`. The download had no .mtl, so materials are created in code (`MODELS` in `src/core/assets.js`):
  `01___Default` -> `textures/MIM-104_D.png`, `02___Default` -> `textures/MIM-104_TRACTOR_D.png`.
- Units are arbitrary; `scale: 0.45` was tuned by eye (about 10 m long). Adjust in `MODELS` if needed.
- `source/` holds the original download, untouched. The launcher and truck are one mesh, so the launcher can't be aimed separately yet.
