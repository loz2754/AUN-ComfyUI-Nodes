import fnmatch
import json
import re
from typing import Any

from .AUNPresetManager import resolve_preset_selection


def _is_link(value):
    return isinstance(value, list) and len(value) == 2


def _filter_values(values: dict, pattern_text: Any) -> dict:
    """
    Restrict the applied values to the widget names matching only_widgets
    (comma/newline separated names). Supports wildcards (* and ?) and plain
    substring matching. Empty pattern keeps everything.
    """
    if not isinstance(values, dict) or not values:
        return values
    text = str(pattern_text or "").strip()
    if not text:
        return values
    patterns = [p.strip().lower() for p in re.split(r"[,\n;]+", text) if p.strip()]
    if not patterns:
        return values
    out = {}
    for name, value in values.items():
        ln = str(name).lower()
        for p in patterns:
            has_wildcard = "*" in p or "?" in p or "[" in p
            if fnmatch.fnmatch(ln, p) or (not has_wildcard and p in ln):
                out[name] = value
                break
    return out


def _apply_aliases(values: dict, alias_text: Any) -> dict:
    """
    Rename value keys according to aliases: comma/newline separated
    "source=target" (or "source->target") pairs. E.g. "seed=seed_value"
    lets a preset value scanned from one node feed a differently-named
    widget on the target node.
    """
    if not isinstance(values, dict) or not values:
        return values
    text = str(alias_text or "").strip()
    if not text:
        return values
    out = dict(values)
    for pair in re.split(r"[,\n;]+", text):
        pair = pair.strip()
        if not pair:
            continue
        if "=" in pair:
            sep = "="
        elif "->" in pair:
            sep = "->"
        else:
            continue
        src, _, tgt = pair.partition(sep)
        src = src.strip()
        tgt = tgt.strip()
        if not src or not tgt or src == tgt:
            continue
        if src in out:
            out[tgt] = out.pop(src)
    return out


def _id_matches(candidate_id: Any, identifier: str) -> bool:
    cid = str(candidate_id) if candidate_id is not None else ""
    ident = str(identifier or "")
    if not cid or not ident:
        return False
    if cid == ident:
        return True
    return (
        cid.endswith("." + ident)
        or cid.endswith(":" + ident)
        or cid.endswith("/" + ident)
    )


def _find_target(prompt, identifier: str):
    if not isinstance(prompt, dict):
        return None, None
    node = prompt.get(identifier)
    if node is not None:
        return node, identifier
    for nid, ninfo in prompt.items():
        if _id_matches(nid, identifier):
            return ninfo, nid
        meta = ninfo.get("_meta", {})
        if meta.get("title") == identifier:
            return ninfo, nid
    return None, None


def _coerce(name: str, value: Any, class_type: str, note_list: list):
    if not class_type:
        return value
    try:
        from nodes import NODE_CLASS_MAPPINGS  # type: ignore[import-not-found]

        cls = NODE_CLASS_MAPPINGS.get(class_type)
        if cls is None:
            return value
        spec = cls.INPUT_TYPES()
        for section in ("required", "optional", "hidden"):
            entry = spec.get(section, {}).get(name)
            if entry is None:
                continue
            input_type = entry[0]
            extra = entry[1] if len(entry) > 1 else {}

            combo_options = None
            if isinstance(input_type, list):
                combo_options = list(input_type)
            elif input_type == "COMBO":
                combo_options = extra.get("options")

            if combo_options is not None:
                if value not in combo_options:
                    note_list.append("skip %s: %r not in combo options" % (name, value))
                    return None
                return value
            if input_type == "INT":
                try:
                    return int(value)
                except Exception:
                    note_list.append("skip %s: not an int" % name)
                    return None
            if input_type == "FLOAT":
                try:
                    return float(value)
                except Exception:
                    note_list.append("skip %s: not a float" % name)
                    return None
            if input_type == "BOOLEAN":
                if isinstance(value, str):
                    return value.lower() in ("true", "yes", "1", "on")
                return bool(value)
            break
    except Exception:
        pass
    return value


def _write_values_into_node(target: dict, values: dict, note_list: list) -> dict:
    """
    Write preset values into a target node's prompt dict in place.
    Linked inputs are never overwritten. Returns the applied dict.
    """
    applied = {}
    inputs = target.get("inputs")
    if not isinstance(inputs, dict):
        note_list.append("target has no inputs")
        return applied
    class_type = target.get("class_type", "")
    for name, value in values.items():
        if name not in inputs:
            note_list.append("skip %s: no such input" % name)
            continue
        current = inputs[name]
        if _is_link(current):
            note_list.append("skip %s: input is linked" % name)
            continue
        coerced = _coerce(name, value, class_type, note_list)
        if coerced is None:
            continue
        inputs[name] = coerced
        applied[name] = coerced

    # Keep widgets_values in sync for the workflow round-trip.
    widgets_values = target.get("widgets_values")
    widgets_meta = target.get("widgets")
    if isinstance(widgets_values, list) and isinstance(widgets_meta, list):
        for i, meta in enumerate(widgets_meta):
            if not isinstance(meta, dict) or i >= len(widgets_values):
                continue
            nm = meta.get("name") or meta.get("label") or meta.get("title")
            if nm in applied:
                widgets_values[i] = applied[nm]
    return applied


def _resolve_preset_values(prompt: dict, apply_node: dict):
    """
    Resolve the values an Apply node should write, statically, at queue time.

    Returns (values_dict, source_notes_list, applied_target_title_hint) or
    None when the values cannot be resolved statically (e.g. preset_values
    is linked to something that is not an AUNPresetManager with static
    inputs). In that case the node's own execution-time pass takes over.
    """
    inputs = apply_node.get("inputs") or {}
    raw = inputs.get("preset_values")

    values = None
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                values = parsed
        except Exception:
            values = None

    if values is None and _is_link(raw):
        src = prompt.get(str(raw[0]))
        if isinstance(src, dict) and src.get("class_type") == "AUNPresetManager":
            selection = resolve_preset_selection(src.get("inputs") or {})
            if selection is not None:
                values = selection[0]

    if not isinstance(values, dict):
        return None
    return values


# ──────────────────────────────────────────────────────────────────────
# Queue-time application (before validation and caching)
#
# ComfyUI calls every registered on-prompt handler with the raw prompt JSON
# right after it hits the /prompt endpoint, before validate_prompt. Applying
# preset values here guarantees the target node executes with the preset
# values even when its results are cached, and removes any dependence on
# execution order.
# ──────────────────────────────────────────────────────────────────────

_ON_PROMPT_HANDLER_ATTR = "__AUN_apply_preset_handler_registered"


def _aun_apply_presets_on_prompt(json_data):
    prompt = json_data.get("prompt") if isinstance(json_data, dict) else None
    if not isinstance(prompt, dict):
        return json_data

    for nid, node in prompt.items():
        if not isinstance(node, dict) or node.get("class_type") != "AUNApplyPresetToNode":
            continue
        inputs = node.get("inputs") or {}
        ident = str(inputs.get("node_identifier") or "").strip()
        if not ident:
            continue
        values = _resolve_preset_values(prompt, node)
        if values is None:
            continue
        values = _apply_aliases(values, inputs.get("aliases"))
        values = _filter_values(values, inputs.get("only_widgets"))
        target, target_id = _find_target(prompt, ident)
        if target is None:
            continue
        notes = []
        _write_values_into_node(target, values, notes)

    return json_data


def _register_prompt_handler():
    try:
        from server import PromptServer  # type: ignore[import-not-found]

        instance = getattr(PromptServer, "instance", None)
        if instance is None:
            return
        if getattr(instance, _ON_PROMPT_HANDLER_ATTR, False):
            return
        if not hasattr(instance, "on_prompt_handlers"):
            return
        instance.add_on_prompt_handler(_aun_apply_presets_on_prompt)
        setattr(instance, _ON_PROMPT_HANDLER_ATTR, True)
    except Exception:
        pass


_register_prompt_handler()


class AUNApplyPresetToNode:
    """
    Write a JSON object of widget values into a target node's inputs.

    Application happens at queue time (via an on-prompt handler registered
    when this module loads), so the target executes with the preset values
    even on fully cached re-runs. The node's own execution pass repeats the
    application as a fallback (covers preset_values that could not be
    resolved statically) and emits a WebSocket event that keeps the
    frontend widgets in sync. Linked inputs are never overwritten.
    """

    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = (
        "Write a JSON object of widget values (e.g. from Preset Manager's "
        "selected_values output) into a target node's inputs. Values are "
        "applied at queue time — before validation and caching — so the "
        "target always executes with the preset values, even on cached "
        "re-runs. Target is found by numeric ID or title. Linked inputs "
        "are never overwritten; values are coerced to the target's input "
        "types and invalid combo options are skipped. only_widgets "
        "(comma-separated names, wildcards and substrings supported) "
        "restricts which values this node applies — handy when several "
        "Apply nodes fan out from one Preset Manager to different targets. "
        "aliases (source=target pairs, e.g. seed=seed_value) rename values "
        "before applying, so differently-named widgets on the target are "
        "fed correctly. "
        "After a run the target's widgets update in the canvas and the "
        "node's footer shows what was applied. Double-click toggles a "
        "compact mode where the footer takes over the node."
    )
    RETURN_TYPES = ("STRING", "BOOLEAN", "STRING")
    RETURN_NAMES = ("applied_values", "applied", "notes")
    FUNCTION = "apply"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "node_identifier": ("STRING", {
                    "default": "",
                    "tooltip": "Numeric ID or Title of the node to update.",
                }),
            },
            "optional": {
                "preset_values": ("STRING", {
                    "default": "", "forceInput": True,
                    "multiline": True,
                    "tooltip": "JSON object {widget_name: value} to write into the target's inputs. Optional — when left empty/unconnected, nothing is applied and the footer explains why.",
                }),
                "only_widgets": ("STRING", {
                    "default": "",
                    "tooltip": "Optional filter: comma-separated widget names to apply (everything else is ignored). Supports wildcards (*, ?) and substrings. Leave empty to apply all values.",
                }),
                "aliases": ("STRING", {
                    "default": "",
                    "tooltip": "Optional renames: comma-separated source=target pairs (e.g. 'seed=seed_value, steps=steps') applied before filtering, so a preset value scanned from one node can feed a differently-named widget on the target.",
                }),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            },
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def apply(self, node_identifier, preset_values="", only_widgets="", aliases="", prompt=None,
              extra_pnginfo=None, unique_id=None):
        ident = str(node_identifier or "").strip()

        values = {}
        try:
            parsed = json.loads(preset_values or "{}")
            if isinstance(parsed, dict):
                values = parsed
        except Exception:
            pass
        values = _apply_aliases(values, aliases)
        values = _filter_values(values, only_widgets)

        notes = []
        target, target_id = _find_target(prompt, ident) if ident else (None, None)

        applied = {}
        if target is None or target_id is None:
            notes.append("target not found: %r" % ident)
        elif not values:
            notes.append("no values to apply")
        else:
            applied = _write_values_into_node(target, values, notes)

        applied_json = json.dumps(applied, ensure_ascii=False, separators=(",", ":"))

        if unique_id is not None:
            try:
                from server import PromptServer  # type: ignore[import-not-found]

                meta = target.get("_meta", {}) if isinstance(target, dict) else {}
                target_title = meta.get("title") or (target.get("class_type") if isinstance(target, dict) else "")
                PromptServer.instance.send_sync(
                    "AUN_apply_preset_applied",
                    {
                        "node_id": str(unique_id),
                        "target_id": str(target_id or ""),
                        "target_title": str(target_title or ""),
                        "values": applied,
                        "notes": notes,
                    },
                )
            except Exception:
                pass

        return (applied_json, bool(applied), "; ".join(notes))


NODE_CLASS_MAPPINGS = {
    "AUNApplyPresetToNode": AUNApplyPresetToNode,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNApplyPresetToNode": "Apply Preset To Node",
}
