# Frontend ≥ v1.53.4 sent STRING widget values as `{}` — investigation summary

Date: 2026-09-04. Update 2026-09-05: **root cause was our code after all —
fixed in `web/AUN_fix_prompt_missing_inputs.js`** (see below). No upstream
change needed.

## Symptom

`AUNMultiUniversal` `Labels` output shows one `{}` per active slot on frontend
v1.54.3 (downstream nodes receive e.g. `"{} {}"`). Same workflow on frontend
v1.51.9 produces the correct labels. Bypass/mute/collapse control and `Switch`
outputs are unaffected (they are applied by the frontend instant-execution JS
path, independent of the backend run).

## Confirmed cause (our shim, not core)

Prompt JSON comparison, same workflow:

- v1.51.9 `inputs`: `label_1: "FaceID"`, `label_2: "RescaleCFG"`, … (correct)
- v1.54.3 `inputs`: `label_1: {}`, `label_2: {}`, … (all 20 labels destroyed)

Upstream's harness (ComfyUI_frontend #17007) exonerated core `graphToPrompt`
for plain hidden STRING widgets, and pointed at our hidden-widget
compatibility shim. Console proof: `[AUN] Injected 79 hidden input(s) for
AUNMultiUniversal #1` — our shim re-injects hidden widgets after core
`graphToPrompt`, and on v1.54.3 `w.serializeValue()` / `w.value` for detached
widgets come back as Proxy/`{}` objects. The old guard (`!== undefined &&
!== null`) let them straight into the prompt.

Fix: `getWidgetValue()` now accepts only primitives (with one-level `{value}`
unwrap), falls back to the still-correct `properties._aun_values` snapshot,
and otherwise skips injection (a missing input fails loudly at validation; a
`{}` input corrupts silently). `captureAunWidgetValues()` additionally refuses
to overwrite the snapshot with a freshly-collapsed `{}`.

Related upstream context:
[ComfyUI_frontend #16461](https://github.com/Comfy-Org/ComfyUI_frontend/issues/16461)
(`1.53.4+` `Proxy`/`widgets_values` serialization) and our report
[ComfyUI_frontend #17007](https://github.com/Comfy-Org/ComfyUI_frontend/issues/17007).

## Status: fixed on our side

`getWidgetValue()` + capture guard landed (see Fix above). The remaining
backend exposure below is now second-line defense only — kept documented in
case a future frontend regression sends `{}` again despite the shim.

## Known repo-wide exposure (backend, still valid)

- Crash class — bare `kwargs.get(...).strip()` on a dict raises `AttributeError`
  and the blanket `except` nukes all outputs:
  `AUNMultiUniversal.py:178` (`label_`), `AUNMultiGroupUniversal.py:224`
  (`group_name_`), `AUNSaveImage.py:1436` (`selected_lora`).
- Silent-corruption class — `str(... or "").strip()` doesn't crash but yields the
  literal string `"{}"`, which leaks into prompts/filenames: e.g.
  `AUNAddToPromptMulti.py:69-71`, `AUNLoraStackWithTriggers.py:183-186`,
  `AUNRandomModelBundleSwitch.py:386-390`, plus LoRA/trigger inputs across
  several nodes.

## Verification

- Queue on frontend @latest → `/prompt` payload shows `"FaceID"` strings;
  downstream `Labels` correct.
- Sanity re-check on v1.51.9 (unchanged path).
- `node --check` on both touched JS files; all three repo audits green.

## Related work (same session)

Trailing-backtick hiding for `Labels` (`FaceID`` controls nodes but is excluded
from `Labels`): implemented in `AUNMultiUniversal.py` + tooltips/`DESCRIPTION` +
`docs/AUNMultiUniversal_README.md`.
