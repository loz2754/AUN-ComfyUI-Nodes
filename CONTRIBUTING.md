# Contributing to AUN Nodes

Thanks for helping improve AUN.

## Scope
- Small, focused PRs are preferred.
- Keep backward compatibility: workflows depend on the string keys in `NODE_CLASS_MAPPINGS`.

## Dev Setup
- Recommended: use the same Python environment ComfyUI uses.
- Restart ComfyUI after changes (node discovery happens at startup).

## Adding or Changing a Node
1. Create/update the node module (typically `AUN*.py`).
2. Ensure the node class defines:
   - `CATEGORY = "AUN Nodes/..."`
   - `FUNCTION`, `RETURN_TYPES`, `RETURN_NAMES`
   - `INPUT_TYPES()` with tooltips on non-trivial inputs
   - `DESCRIPTION` for non-trivial nodes
3. Register it in `__init__.py`:
   - Import the class
   - Add to `NODE_CLASS_MAPPINGS`
   - Add to `NODE_DISPLAY_NAME_MAPPINGS` (friendly UI name)
4. Regenerate the README node list:
   - `python tools/generate_readme_nodes.py`

## Dependencies
- If you add a new third‑party dependency:
  - Add it to `requirements.txt`
  - Prefer optional imports where possible (fail at execution time with a clear message, rather than failing pack import)
  - Avoid listing packages that ComfyUI already bundles (e.g. `torch`, `numpy`, `Pillow`).

## Web / JS
- Keep web assets under `web/`.
- Don’t change the `WEB_DIRECTORY` contract without good reason.

## Docs
- User-facing docs:
  - `README.md` (overview + installation)
  - `docs/` (node-specific guides)
  - `CHANGELOG.md` (user-visible changes)
- Maintainer-only docs:
  - `DOCUMENTATION_STRATEGY.md`
  - `DOCUMENTATION_SUMMARY.md`

When you add a new doc page under `docs/`, also add it to `docs/INDEX.md`.

## Release Checklist (Maintainers)

- Repository hygiene
  - Ensure `README.md` is up to date.
  - Update `CHANGELOG.md`.
  - Confirm `requirements.txt` covers third‑party deps your nodes import.
- Clean install test
  - Fresh clone into `custom_nodes/AUN`.
  - Install deps: `pip install -r custom_nodes/AUN/requirements.txt` (or via ComfyUI-Manager).
  - Restart ComfyUI; confirm nodes load and no import errors appear in console.
- Backward compatibility
  - Avoid renaming/removing keys in `NODE_CLASS_MAPPINGS` unless necessary (breaks existing workflows).
- Tag a release
  - Create a GitHub Release and tag (e.g. `v0.1.0`).

## ComfyUI-Manager Listing (Maintainers)

ComfyUI-Manager shows a curated registry. To appear there, you typically:

1. Publish this folder as its own public GitHub repository (repo root contains `__init__.py`, `README.md`, etc.).
2. Ensure install works from a clean environment (dependencies in `requirements.txt`).
3. Open a PR to the ComfyUI-Manager registry adding your repo URL + a short description.

## Style
- Keep code readable and consistent with adjacent files.
- Prefer descriptive names over one-letter variables.
- Avoid reformat-only changes.
