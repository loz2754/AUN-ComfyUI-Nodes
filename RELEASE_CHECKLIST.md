# AUN Release Checklist

## Dev Workflow

1. Make code changes only in `N:\ComfyUI_windows_portable_dev\ComfyUI\custom_nodes\aun-comfyui-nodes`.
2. Test changes in the dev portable ComfyUI instance.
3. Commit and push from the dev repo only.
4. Do not use ComfyUI Manager to update or manage the dev copy.

## Release Workflow

1. Decide whether the change is internal/dev-only or a user-facing release.
2. If it is a user-facing release, update the version in `pyproject.toml`.
3. Update any registry-facing metadata only when publishing a release.
4. Push the final release commit and tag from the dev repo.
5. Verify the GitHub repo reflects the expected release state.

## Release Surfaces

1. Treat GitHub and ComfyUI Manager as separate release surfaces.
2. Users who clone from GitHub will get whatever is on the public branch or tag they install.
3. Users who install through ComfyUI Manager depend on published version and registry-facing metadata.
4. Do not assume a Git push alone will create a Manager-visible update.
5. Do not assume a Manager release fully represents what Git clone users will pull.
6. Keep the default public branch stable enough for direct-clone users, or use a separate dev branch for in-progress work.
7. Keep README install steps and dependency declarations current for manual-install users.

## Branch Strategy

1. Use `main` as the only public branch for users who clone directly from GitHub.
2. Test all changes locally in the dev portable ComfyUI instance before pushing.
3. Keep main stable by committing only tested, working changes.
4. Push deliberately when ready for release; do not push WIP (work-in-progress) changes.
5. Use git tags for releases to mark stable points; do not rely on branch names alone.

## Release Day Sequence

1. Confirm all changes are tested and working in the dev portable ComfyUI instance.
2. Commit all tested changes to `main` with descriptive message(s).
3. Push to `main` on GitHub.
4. Update `pyproject.toml` version if this is a user-facing release.
5. Commit the version bump.
6. Push the version bump commit to `main`.
7. Create and push a git tag (e.g., `v2.2.1`) to mark the release point.
8. A push of a `v*` tag triggers the GitHub Release workflow (release notes auto-populated from CHANGELOG).
9. A push to `main` that changes `pyproject.toml` triggers the Comfy registry publish workflow.
10. Verify both surfaces:

- GitHub shows the expected tag/release with notes
- ComfyUI Manager shows the expected version/update behavior

## Release Automation

1. Use `tools/release.ps1` from the repo when you want a consistent version bump, changelog update, commit, tag, and push flow.
2. Alternatively, manually update:
   - `pyproject.toml` version
   - `CHANGELOG.md` (mark version with `## [VERSION] - YYYY-MM-DD` and keep `## [Unreleased]` at the top)
3. A push to `main` that changes `pyproject.toml` triggers the Comfy registry publish workflow.
4. A push of a `v*` tag triggers the GitHub Release workflow (auto-extracts release notes from CHANGELOG).
5. Keep the script/process as your local entry point; let GitHub Actions handle remote publication.

### Example Automation Commands

Preview a release without changing anything:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\release.ps1 -Version 2.1.1 -DryRun
```

Create the release commit and tag, but do not push yet:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\release.ps1 -Version 2.1.1 -NoPush
```

Create and push a full release:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\release.ps1 -Version 2.1.1
```

Skip the tag if you only want the version/changelog commit:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\release.ps1 -Version 2.1.1 -NoTag
```

## User Install Validation

1. Treat `N:\ComfyUI_windows_portable\ComfyUI\custom_nodes\aun-comfyui-nodes` as a consumer install, not a dev repo.
2. Update that copy the same way a user would:
   - via ComfyUI Manager, if this release is Manager-distributed
   - or via fresh clone/download, if this release is Git/manual-install distributed
3. Launch the user portable ComfyUI and confirm the nodes load correctly.
4. Confirm the visible behavior matches the intended release.

## Rules

1. `git` operates on the nearest parent `.git`, not necessarily the current folder.
2. Do not mix dev edits, Manager updates, and Git pulls in the same install folder.
3. Git history controls source changes.
4. Version/registry metadata in `pyproject.toml` controls what ComfyUI Manager detects as a published update.
5. Keep dev and user installs separate.
6. Test all changes locally before pushing to GitHub.

## Quick Decision Rule

- If coding and testing: use the dev portable folder, commit locally when confident.
- If pushing to GitHub: make sure it's tested and you intend to release it.
- If verifying the user experience: use the user portable folder.
- If Manager shows no update: check `pyproject.toml` version and registry metadata before assuming Git is wrong.
