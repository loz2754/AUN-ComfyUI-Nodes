# Registry moderation incident (2026-09-05, updated 2026-09-13) — Manager stuck at v2.22.0

Saved troubleshooting session. GitHub/tags/Actions are healthy; the ComfyUI Registry
auto-moderated every version after v2.22.0, so ComfyUI Manager (which only lists
`NodeVersionStatusActive`) pins the pack at v2.22.0.

## Live evidence (2026-09-05)

- `GET https://api.comfy.org/nodes/aun-comfyui-nodes` → `latest_version` = `2.22.0`
  (created `2026-08-21`).
- `GET https://api.comfy.org/nodes/aun-comfyui-nodes/versions` → per-version status:
  - `Active`: everything ≤ `2.22.0`
  - `NodeVersionStatusBanned`: `2.23.0` (`1bbcb160-…`), `2.24.0` (`9b8cd69f-…`),
    `2.25.0` (`9c994617-…`), `2.25.1` (`f845fa3e-…`), `2.26.0` (`40667029-…`)
  - `NodeVersionStatusFlagged`: `2.27.0` (`4fc9eb7f-…`), `2.28.0` (`d7951057-…`),
    `2.29.0` (`19d4f7b1-…`)
  - `NodeVersionStatusBanned`: `2.29.1` (`2a5fd034-…`, created `2026-09-05`)

## Update 2026-09-13

- `v2.29.1` moved `Pending` → `NodeVersionStatusBanned`. This rules out the
  E701/E702 semicolon theory: v2.29.1 changed nothing scannable except that fix
  plus a model short-name string, yet was still banned.
- `v2.30.0` (Sep 5, `dc129cf2-…`) → `NodeVersionStatusBanned`.
- `v2.30.1` (Sep 13, `e821011c-…`) → `NodeVersionStatusFlagged`.
- Pack `latest_version` still `2.22.0` (`Active`); Manager unchanged.
- Takeaway: the Banned/Flagged split looks like scanner-side variance, not signal
  from code diffs. No further new releases until the reviewer responds — each
  banned upload only extends the visible banned list.
- All `Publish to Comfy registry` workflow runs (incl. v2.23–v2.29.1) report
  `success` / `Upload successful`. Upload succeeding does NOT mean the version goes
  `Active` — the async security scan moves it to Flagged/Banned with no notification,
  and `status_reason` / `tags_admin` are not publicly exposed.

## Scanner-trigger scan (repo, `v2.22.0` vs `v2.23.0` vs `main`)

No code-level smoking gun — the flagged patterns are identical in Active and
Banned versions, so the likely cause is a server-side rule change ~Aug 21–27, not
something introduced in v2.23.0:

- No `eval(`, `exec(`, `shell=True`, sockets, or external URLs anywhere.
- Only `fetch()` is same-origin `/aun/loras`; `innerHTML` uses are escaped
  (`escapeHtml`) or static UI markup; `localStorage`/clipboard are benign UI state.
- `subprocess` is ffmpeg assembly only (`AUNSaveVideo.py`, `AUNJoinVideos.py`,
  list-form args, no shell) + pip install in `install.py` — same as Active versions.
- `PromptServer.send_sync` / local `/aun/*` routes unchanged since Active versions.
- The one scanner-emitted warning (`E702` semicolon, `AUNExtractPowerLoras.py:116`)
  existed in `v2.22.0` too — fixed anyway in v2.29.1 (see below).
- `v2.23.0` diff highlights (all benign): new `AUNAutoPopulatePresets.py` +
  `web/AUN_auto_populate_presets.js` (later replaced by Preset Manager in v2.24.0,
  which stayed Banned), bookmark-jump / collapse / `AUN_universal_instant.js` changes,
  new `opencode.json`.

## Fix released: v2.29.1 (2026-09-05)

- `AUNExtractPowerLoras.py`: split `is_bypassed = True; break` and the adjacent
  single-line `if is_bypassed: continue` into separate statements (E701/E702 —
  publish log says these "will be an error soon"). Committed as `36cd269`.
- CHANGELOG `Unreleased` entries added (required by `tools/release.ps1`), incl. the
  `epicrealismXL_vxviLastfameRealism` short name from `b8df460`.
- Released via `tools/release.ps1 -Version 2.29.1`: commit + tag pushed, GitHub
  Release created, registry upload succeeded → version `Pending`, awaiting scan.
- Known remaining hygiene debt (left alone to keep the release minimal): ~20 more
  single-line `if x: return/break/continue` E701s across the tree (e.g.
  `AUNGraphScraper.py`, `AUNMultiUniversal.py`). Fix if the reviewer asks.

## Manual review request (to post on `Comfy-Org/registry-backend`)

Title: *Manual review request: `aun-comfyui-nodes` versions 2.23.0–2.30.1
Flagged/Banned, Manager stuck at 2.22.0*

Body: publisher `loz2754`, node `aun-comfyui-nodes`
(`https://github.com/loz2754/AUN-ComfyUI-Nodes`,
`https://registry.comfy.org/nodes/aun-comfyui-nodes`). Every version since 2.23.0
auto-moderated; Manager pinned at 2.22.0. Banned: 2.23.0 (`1bbcb160-…`), 2.24.0
(`9b8cd69f-…`), 2.25.0 (`9c994617-…`), 2.25.1 (`f845fa3e-…`), 2.26.0
(`40667029-…`), 2.29.1 (`2a5fd034-…`), 2.30.0 (`dc129cf2-…`). Flagged: 2.27.0
(`4fc9eb7f-…`), 2.28.0 (`d7951057-…`), 2.29.0 (`19d4f7b1-…`), 2.30.1
(`e821011c-…`). Believed false positives — subprocess is ffmpeg-only (list args,
no shell, same as Active versions); fetch is same-origin; no external network;
PromptServer messages are local. Notably, v2.29.1 changed nothing scannable
except an E701/E702 cleanup yet was still banned, and near-identical 2.30.0 /
2.30.1 came back Banned / Flagged respectively, suggesting scanner variance.
Request: review latest (2.30.1) → `Active` (older Banned versions may stay
as-is). Offer to change any specific pattern named.

## Follow-ups

- [ ] Post the review issue (draft above covers through 2.30.1); watch
      `…/versions/2.30.1` for `Flagged` → `Active`.
- [ ] Hold off new releases until the reviewer responds.
- [ ] If reviewer names a pattern, fix tree-wide and cut a new patch release.
- [ ] Once a clean version is `Active`, optionally deprecate Banned versions in the
      registry UI to avoid user confusion.
- [ ] Re-check commands: `gh run list --workflow publish_action.yml --limit 5`;
      `git ls-remote --tags origin | Select-String "2\.(22|23|24|25|26|27|28|29)"`.
