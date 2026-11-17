# Skills in this folder

## Written for this project

- `add-auditorium/` — turning a seat-map screenshot or compact text into a valid auditorium JSON.
- `seat-metrics/` — metric formulas, rating bands and verdict keys.

## Vendored from other repositories

Copied unmodified so that every Claude Code session on this repo (local or cloud) loads them without an
install step. Each was read before it was added.

| Skill folder(s)                                                                                                                                                                         | Source                                                                    | Commit    | License                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------- | -------------------------------------------- |
| `threejs-fundamentals`, `threejs-geometry`, `threejs-materials`, `threejs-lighting`, `threejs-textures`, `threejs-animation`, `threejs-interaction`, `threejs-performance` (8 of 13)   | https://github.com/cloudai-x/threejs-skills                               | `0e18186` | MIT — see `LICENSE-threejs-skills.txt`       |
| `frontend-design`                                                                                                                                                                       | https://github.com/anthropics/skills (`skills/frontend-design`)           | `e4bb5d9` | Apache-2.0 — see `frontend-design/LICENSE.txt` |

Not vendored on purpose:

- `threejs-loaders`, `threejs-shaders`, `threejs-postprocessing`, `threejs-react-three-fiber`,
  `threejs-asset-pipeline` — this app has no model files, no custom shaders, no post-processing and no React.
- `webapp-testing` (anthropics/skills) — it drives Python Playwright. This repo ships a Node Playwright smoke
  test instead (`scripts/smoke.cjs`), which needs no Python.

To update a vendored skill, copy the folder again from its source and change the commit above.
