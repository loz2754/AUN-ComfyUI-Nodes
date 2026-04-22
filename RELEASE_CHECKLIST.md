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

1. Treat `main` as the stable public branch for users who clone directly from GitHub.
2. Do active development on a separate `dev` branch instead of committing unfinished work to `main`.
3. Use short-lived feature branches off `dev` for larger or riskier changes.
4. Merge `dev` into `main` only when the changes are tested and ready for users.
5. If unfinished work must stay private, do not push that branch to the public repo; keep it local-only or use a private fork.

### Example Commands

Create a dev branch:

```powershell
git switch -c dev
git push -u origin dev
```

Start a feature branch from dev:

```powershell
git switch dev
git pull
git switch -c feature/short-description
```

Merge a feature branch back into dev:

```powershell
git switch dev
git merge feature/short-description
git push
```

Promote tested changes from dev to main:

```powershell
git switch main
git pull
git merge dev
git push
```

## Release Day Sequence

1. Confirm `dev` contains the final tested changes.
2. Switch to `main` and pull the latest remote state.
3. Merge `dev` into `main`.
4. Update `pyproject.toml` if this is a user-facing release.
5. Commit the version bump if needed.
6. Push `main` to GitHub.
7. Create and push a tag if you want a stable release point for clone users.
8. Update/publish any registry-facing metadata needed for ComfyUI Manager.
9. In the user portable install, test the update path a user will actually use.
10. Verify both surfaces:

- GitHub shows the expected branch/tag state
- ComfyUI Manager shows the expected version/update behavior

## Release Automation

1. Use `tools/release.ps1` from the dev repo when you want a consistent version bump, changelog update, commit, tag, and push flow.
2. A push to `main` that changes `pyproject.toml` triggers the Comfy registry publish workflow.
3. A push of a `v*` tag triggers the GitHub Release workflow.
4. Keep the script as the local entry point and let GitHub Actions handle the remote publication side.

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
4. Version/registry metadata controls what ComfyUI Manager can detect as a published update.
5. Keep dev and user installs separate.
6. A Git-clone user and a Manager user may legitimately see different update timing unless you release both surfaces together.

## Quick Decision Rule

- If coding, testing, committing, or pushing: use the dev portable folder.
- If verifying the user experience: use the user portable folder.
- If Manager shows no update: check version and registry metadata before assuming Git is wrong.
