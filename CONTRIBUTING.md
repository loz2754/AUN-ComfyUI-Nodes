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
  - Bump the version in `pyproject.toml` to match the release.
  - Confirm `requirements.txt` covers third‑party deps your nodes import.
- Clean install test
  - Fresh clone into `custom_nodes/AUN`.
  - Install deps: `pip install -r custom_nodes/AUN/requirements.txt` (or via ComfyUI-Manager).
  - Restart ComfyUI; confirm nodes load and no import errors appear in console.
- Backward compatibility
  - Avoid renaming/removing keys in `NODE_CLASS_MAPPINGS` unless necessary (breaks existing workflows).
- Registry metadata
  - Confirm `[project]` and `[tool.comfy]` in `pyproject.toml` are correct.
  - Keep `PublisherId`, `DisplayName`, repository URL, and version in sync with the intended release.
- Publish the release
  - Create a GitHub Release and tag (for example `v1.1.0`).
  - Publish the new version to the Comfy Registry using the current publisher workflow.

## Comfy Registry Publishing (Maintainers)

ComfyUI-Manager installs nodes from the Comfy Registry. Publishing is driven by the metadata in `pyproject.toml` and a publisher account.

1. Ensure this node pack is in its own public GitHub repository and the repo root contains the package files (`pyproject.toml`, `__init__.py`, `README.md`, etc.).
2. Confirm the release version in `pyproject.toml` is semantic and matches `CHANGELOG.md`.
3. Confirm `[tool.comfy]` includes the correct `PublisherId` and `DisplayName`.
4. Publish using the current Comfy Registry workflow, such as the Comfy CLI (`comfy node publish`) or a GitHub Actions release workflow configured with your publishing API key.
5. After publishing, verify the new version appears through the registry / ComfyUI-Manager flow.

Notes:

- Do not rely on the older manual PR-to-registry process as the primary publishing path.
- If registry publishing requirements change, update this section and keep it aligned with the current Comfy docs.

## Style

- Keep code readable and consistent with adjacent files.
- Prefer descriptive names over one-letter variables.
- Avoid reformat-only changes.

## Randomness Guidelines

- Do not call global seeding inside nodes (`random.seed(...)`). It mutates shared RNG state and can affect unrelated nodes during partial workflow runs.
- For deterministic seeded behavior, create a local generator per call (`rng = random.Random(seed)`) and use that instance.
- For non-deterministic random mode behavior, prefer an instance-local RNG (for example `self._rng = random.SystemRandom()`) and use it instead of module-level `random.*` calls.
- For dynamic random/iterate modes, use a time-based `IS_CHANGED` token (for example `time.time_ns()`) so re-execution stays predictable.
