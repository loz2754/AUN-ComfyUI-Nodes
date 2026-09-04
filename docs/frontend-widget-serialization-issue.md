# Frontend ≥ v1.53.4 sends STRING widget values as `{}` — investigation summary

Date: 2026-09-04. Decision: **leave code untouched** until ComfyUI upstream moves.

## Symptom

`AUNMultiUniversal` `Labels` output shows one `{}` per active slot on frontend
v1.54.3 (downstream nodes receive e.g. `"{} {}"`). Same workflow on frontend
v1.51.9 produces the correct labels. Bypass/mute/collapse control and `Switch`
outputs are unaffected (they are applied by the frontend instant-execution JS
path, independent of the backend run).

## Confirmed cause (not our code)

Prompt JSON comparison, same workflow:

- v1.51.9 `inputs`: `label_1: "FaceID"`, `label_2: "RescaleCFG"`, … (correct)
- v1.54.3 `inputs`: `label_1: {}`, `label_2: {}`, … (all 20 labels destroyed)

The frontend destroys the data at prompt-build time, so no backend coercion can
recover the original text. Matches upstream
[ComfyUI_frontend #16461](https://github.com/Comfy-Org/ComfyUI_frontend/issues/16461)
(`1.53.4+ breaks serialization of complex node widget_values with incorrect Proxy`).
Reported by us as
[ComfyUI_frontend #17007](https://github.com/Comfy-Org/ComfyUI_frontend/issues/17007)
(plain-`STRING` `inputs` corruption: `label_N` sent as `{}` on v1.54.3, correct
on v1.51.9).

## Why deferral is safe

Normal users are pinned to ≤ v1.51.9 by their backend version; only advanced
users on `@latest` are exposed.

## Known repo-wide exposure (audit, no changes made)

- Crash class — bare `kwargs.get(...).strip()` on a dict raises `AttributeError`
  and the blanket `except` nukes all outputs:
  `AUNMultiUniversal.py:178` (`label_`), `AUNMultiGroupUniversal.py:224`
  (`group_name_`), `AUNSaveImage.py:1436` (`selected_lora`).
- Silent-corruption class — `str(... or "").strip()` doesn't crash but yields the
  literal string `"{}"`, which leaks into prompts/filenames: e.g.
  `AUNAddToPromptMulti.py:69-71`, `AUNLoraStackWithTriggers.py:183-186`,
  `AUNRandomModelBundleSwitch.py:386-390`, plus LoRA/trigger inputs across
  several nodes.

## Plan when revisiting

1. Add one safe widget-string helper (unwrap `{value: …}`, drop `{}` artifacts
   to `""`) and apply it starting with the 3 crash sites, then the
   silent-corruption sites.
2. Only if upstream won't fix: `serializeValue` overrides for `label_N` /
   `targets_N` / `group_name_N` in `web/AUN_universal_instant.js` + capture/
   restore guards in `web/aun_persistence_shared.js`.
3. Verify: prompt-JSON check on v1.51.9 vs @latest, backend `{}`/dict-shaped
   input test, `tools/generate_readme_nodes.py`,
   `tools/audit_node_docs.py --fail-on-missing`.

## Related work (same session)

Trailing-backtick hiding for `Labels` (`FaceID`` controls nodes but is excluded
from `Labels`): implemented in `AUNMultiUniversal.py` + tooltips/`DESCRIPTION` +
`docs/AUNMultiUniversal_README.md`.
