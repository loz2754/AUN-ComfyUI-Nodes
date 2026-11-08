import json

from server import PromptServer


class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False


any_type = AlwaysEqualProxy("*")


def _resolve_linked_value(prompt, value, depth=0):
    """Best-effort static resolution of a linked prompt input to a string.

    Used when reference_phrase is connected to another node instead of being
    an inlined primitive value. Only nodes whose output can be determined
    from their own inputs (e.g. primitive/string nodes) resolve here.
    """
    if not isinstance(value, list) or len(value) != 2:
        return value
    if depth > 5 or not isinstance(prompt, dict):
        return None
    src = prompt.get(str(value[0]))
    if not isinstance(src, dict):
        return None
    inputs = src.get("inputs")
    if not isinstance(inputs, dict):
        return None

    # 1. Direct literal string fields (primitive/string nodes).
    for key in ("value", "text", "string", "input", "prompt", "content"):
        v = inputs.get(key)
        if isinstance(v, str):
            return v
        if isinstance(v, list):
            r = _resolve_linked_value(prompt, v, depth + 1)
            if isinstance(r, str):
                return r
    str_values = [v for v in inputs.values() if isinstance(v, str)]
    if len(str_values) == 1:
        return str_values[0]

    # 2. Execute our own (AUN*) nodes whose inputs are all statically
    #    resolvable, so dynamic switch nodes can feed reference_phrase.
    class_type = str(src.get("class_type") or "")
    if class_type.startswith("AUN") and depth < 3:
        try:
            import inspect
            from nodes import NODE_CLASS_MAPPINGS  # type: ignore[import-not-found]

            cls = NODE_CLASS_MAPPINGS.get(class_type)
            if cls is not None and hasattr(cls, "FUNCTION"):
                resolved_inputs = {}
                ok = True
                for k, v in inputs.items():
                    if isinstance(v, list):
                        r = _resolve_linked_value(prompt, v, depth + 1)
                        if r is None:
                            ok = False
                            break
                        resolved_inputs[k] = r
                    else:
                        resolved_inputs[k] = v
                if ok:
                    fn = getattr(cls(), cls.FUNCTION)
                    sig = inspect.signature(fn)
                    call_args = {}
                    var_kw = None
                    for name, param in sig.parameters.items():
                        if name in ("self", "cls"):
                            continue
                        if param.kind == inspect.Parameter.VAR_KEYWORD:
                            var_kw = name
                            continue
                        if param.kind == inspect.Parameter.VAR_POSITIONAL:
                            continue
                        if name in resolved_inputs:
                            call_args[name] = resolved_inputs[name]
                        elif name == "unique_id":
                            call_args[name] = str(value[0])
                        elif param.default is not inspect.Parameter.empty:
                            call_args[name] = param.default
                        else:
                            ok = False
                            break
                    extra_kwargs = {
                        k: v for k, v in resolved_inputs.items()
                        if k not in call_args
                    }
                    if ok:
                        result = fn(**call_args, **extra_kwargs)
                        if isinstance(result, tuple):
                            slot = value[1] if isinstance(value[1], int) else 0
                            if 0 <= slot < len(result):
                                val = result[slot]
                                if isinstance(val, (str, int, float, bool)):
                                    return val
                        elif isinstance(result, (str, int, float, bool)):
                            return result
        except Exception:
            pass

    return None


def _coerce_index(value):
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


# Nodes that expose a deterministic integer index output. When the manager's
# manual_index is linked to one of these in "Select" mode, the output is just
# a widget value, so it can be resolved at queue time without executing any
# node (executing Random/Increment/Range sources at queue time would consume
# their state and diverge from the real run).
# class name -> (output slot, widget name holding the index, clamp mode)
_INDEX_LINK_SOURCES = {
    "AUNTextIndexSwitch3": (2, "index", "slot_count"),
    "AUNTextIndexSwitch4": (2, "index", "slot_count"),
    "AUNTextIndexSwitch5": (2, "index", "slot_count"),
    "AUNTextIndexSwitch5Diffusers": (2, "index", "slot_count"),
    "AUNRandomIndexSwitch": (0, "select", None),
    "AUNRandomTextIndexSwitch": (2, "select", None),
    "AUNRandomTextIndexSwitchV2": (2, "select", "max_inputs"),
}


def _clamp_source_index(idx, inputs, clamp):
    """Mirror the source node's own clamping so the resolved row matches."""
    try:
        if clamp == "slot_count":
            limit = max(1, min(int(inputs.get("slot_count") or 2), 20))
            return max(1, min(idx, limit))
        if clamp == "max_inputs":
            return max(1, min(idx, 20))
    except (TypeError, ValueError):
        pass
    return idx


def _resolve_manual_index(prompt, link):
    """Resolve a linked manual_index to an int at queue time.

    Only deterministic sources are resolved: literal/primitive values and the
    fixed "Select" mode of AUN index switches. Random/Increment/Range sources
    are execution-time only and return None (the manager still outputs the
    right values, but targets cannot be pre-applied).
    """
    if not isinstance(prompt, dict) or not isinstance(link, list) or len(link) != 2:
        return None
    src = prompt.get(str(link[0]))
    if not isinstance(src, dict):
        return None
    inputs = src.get("inputs")
    if not isinstance(inputs, dict):
        return None

    cls = str(src.get("class_type") or "")
    source = _INDEX_LINK_SOURCES.get(cls)
    if source is not None:
        out_slot, widget_name, clamp = source
        try:
            slot = int(link[1])
        except (TypeError, ValueError):
            return None
        if slot != out_slot:
            return None
        if str(inputs.get("mode") or "Select") != "Select":
            return None
        idx = _coerce_index(inputs.get(widget_name))
        if idx is None:
            return None
        return _clamp_source_index(idx, inputs, clamp)

    # Unknown AUN nodes may be stateful; never treat their widgets as a
    # literal index and never execute them here.
    if cls.startswith("AUN"):
        return None

    # Literal primitive sources (PrimitiveNode, constant/int nodes).
    for key in ("value", "int", "number", "index", "select"):
        value = inputs.get(key)
        if isinstance(value, list):
            continue
        idx = _coerce_index(value)
        if idx is not None:
            return idx

    return _coerce_index(_resolve_linked_value(prompt, link))


_CYCLE_STATE = {}


def _cycle_index(mode, key, visible_rows, queue_time=False):
    st = _CYCLE_STATE.setdefault(str(key), {"last": 0, "pending": None})
    if queue_time:
        if mode == "Sequential":
            st["last"] = (st["last"] % visible_rows) + 1
        elif mode == "Random":
            import random
            st["last"] = random.randint(1, visible_rows)
        else:
            st["last"] = max(1, min(int(st["last"] or 1), visible_rows))
        st["pending"] = st["last"]
        return st["last"]
    # execution time
    if st.get("pending") is not None:
        val = st["pending"]
        st["pending"] = None
        return val
    if mode == "Sequential":
        st["last"] = (st["last"] % visible_rows) + 1
    elif mode == "Random":
        import random
        st["last"] = random.randint(1, visible_rows)
    else:
        st["last"] = max(1, min(int(st["last"] or 1), visible_rows))
    st["pending"] = None
    return st["last"]


def resolve_preset_selection(inputs, prompt=None, queue_time=False):
    """
    Statically evaluate a preset selection from a manager node's raw input
    dict (as found in the queued prompt). Shared by the node's own execution
    and by AUNApplyPresetToNode's queue-time prompt handler.

    Returns (values_dict, matched_keyword, matched_index) or None when the
    inputs cannot be resolved statically (e.g. reference_phrase is a link that
    cannot be resolved, or manual_index is linked to a Random/Increment/Range
    source whose value only exists at execution time).
    """
    if not isinstance(inputs, dict):
        return None
    visible_rows = max(1, min(int(inputs.get("visible_rows") or 5), AUNPresetManager.MAX_ROWS))

    manual_preset = inputs.get("manual_preset", "1")
    if isinstance(manual_preset, list):
        if prompt is None:
            return None
        resolved = _resolve_linked_value(prompt, manual_preset)
        if resolved is None:
            return None
        manual_preset = resolved

    manual_index = inputs.get("manual_index", 0)
    if isinstance(manual_index, list):
        # Linked manual_index: resolve deterministic sources (literal values,
        # index switches in Select mode) so queue-time application uses the
        # same row the manager will output at execution.
        if prompt is None:
            return None
        resolved_index = _resolve_manual_index(prompt, manual_index)
        if resolved_index is None:
            return None
        manual_index = resolved_index

    cycle_mode = str(inputs.get("cycle_mode") or "Off")
    if cycle_mode == "Off":
        # Allow cycle mode to be encoded in the manual_preset dropdown.
        mp = str(inputs.get("manual_preset") or "").strip().lower()
        if mp == "sequential":
            cycle_mode = "Sequential"
        elif mp == "random":
            cycle_mode = "Random"

    _rows_for_name = []
    try:
        _parsed = json.loads(inputs.get("preset_data") or "[]")
        if isinstance(_parsed, list):
            _rows_for_name = [r for r in _parsed if isinstance(r, dict)][:visible_rows]
        elif isinstance(_parsed, dict):
            _raw = _parsed.get("rows")
            if isinstance(_raw, list):
                _rows_for_name = [r for r in _raw if isinstance(r, dict)][:visible_rows]
    except Exception:
        _rows_for_name = []

    manual_n = 1
    try:
        mi = int(manual_index)
    except (ValueError, TypeError):
        mi = 0
    if cycle_mode != "Off":
        key = inputs.get("unique_id") or inputs.get("node_identifier") or "global"
        manual_n = _cycle_index(cycle_mode, key, visible_rows, queue_time=queue_time)
    elif mi > 0:
        manual_n = mi
    else:
        try:
            manual_n = int(manual_preset)
        except (ValueError, TypeError):
            for i, row in enumerate(_rows_for_name):
                if isinstance(row, dict) and str(row.get("name", "")).strip() == str(manual_preset).strip():
                    manual_n = i + 1
                    break
    manual_n = max(1, min(manual_n, visible_rows))
    match_keywords = inputs.get("match_keywords", "Yes")
    case_sensitive = bool(inputs.get("case_sensitive", False))

    reference_phrase = inputs.get("reference_phrase", "")
    if isinstance(reference_phrase, list):
        if prompt is None:
            return None  # linked — cannot resolve statically without prompt context
        resolved = _resolve_linked_value(prompt, reference_phrase)
        if not isinstance(resolved, str):
            return None
        reference_phrase = resolved
    reference_phrase = str(reference_phrase or "")

    rows = []
    try:
        parsed = json.loads(inputs.get("preset_data") or "[]")
        if isinstance(parsed, list):
            rows = [r for r in parsed if isinstance(r, dict)][:visible_rows]
        elif isinstance(parsed, dict):
            raw_rows = parsed.get("rows")
            if isinstance(raw_rows, list):
                rows = [r for r in raw_rows if isinstance(r, dict)][:visible_rows]
    except Exception:
        rows = []

    matched_index = 0
    matched_keyword = ""
    if match_keywords == "Yes":
        search = reference_phrase if case_sensitive else reference_phrase.lower()
        for i, row in enumerate(rows):
            raw = str(row.get("keyword", "") or "")
            for sub in [k.strip() for k in raw.split(",") if k.strip()]:
                match_kw = sub if case_sensitive else sub.lower()
                if match_kw in search:
                    matched_index = i + 1
                    matched_keyword = sub
                    break
            if matched_index:
                break

    if not matched_index:
        matched_index = manual_n

    values = {}
    if 1 <= matched_index <= len(rows):
        vals = rows[matched_index - 1].get("values")
        if isinstance(vals, dict):
            values = vals

    return values, matched_keyword, int(matched_index)


class AUNPresetManager:
    """
    Preset manager for a target node's widgets.

    The frontend (Setup dialog) reads the target node's widgets live from the
    graph and stores keyword-triggered preset rows as a JSON string in the
    hidden preset_data widget. At execution time this node selects the
    matching row (or manual_preset) and outputs its values as a JSON string.
    AUNApplyPresetToNode writes that JSON into the target node's inputs.
    """

    MAX_ROWS = 20
    MAX_MANUAL_OUTPUTS = 12

    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = (
        "Configure keyword-triggered preset rows for a target node's widgets "
        "(use the Setup button; the dialog scans the target live). Supports "
        "named presets and multiple comma-separated target nodes, with "
        "per-target value sets. Outputs the selected row's values as a JSON "
        "string plus the matched keyword/index for AUNApplyPresetToNode "
        "(automatic application) or direct application by the manager itself. "
        "Also outputs up to 12 manual value slots (ANY type) labelled with "
        "the widget names, for wiring directly into a target node's "
        "converted inputs or into other nodes such as AUNSaveImageV2 "
        "filename fields. Warning: applying a preset overwrites the target "
        "node's widget values (linked inputs are never overwritten)."
    )
    RETURN_TYPES = ("STRING", "STRING", "INT") + tuple(any_type for _ in range(MAX_MANUAL_OUTPUTS))
    RETURN_NAMES = ("selected_values", "matched_keyword", "matched_index") + tuple(
        "value_%d" % i for i in range(1, MAX_MANUAL_OUTPUTS + 1)
    )
    FUNCTION = "select_preset"

    @classmethod
    def INPUT_TYPES(cls):
        required = {
            "node_identifier": ("STRING", {
                "default": "",
                "tooltip": "Numeric ID or Title of the target node. Used by the Setup dialog to discover the target's widgets.",
            }),
            "manual_preset": ("STRING", {
                "default": "1",
                "tooltip": "Preset name or row number (1-%d) to use as the active bundle. Clamped to visible_rows. With match_keywords=No, this is used unless manual_index is connected and >0 (the index wins; this becomes the fallback for index 0). With match_keywords=Yes, keywords can override it when they match." % cls.MAX_ROWS,
            }),
            "match_keywords": (["Yes", "No"], {
                "default": "Yes",
                "tooltip": "Yes: keywords are matched against reference_phrase; the first matching row wins, falling back to manual_preset. No: keywords are ignored; manual_preset is always used.",
            }),
        }
        optional = {
            "manual_index": ("INT", {
                "default": 0,
                "min": 0,
                "max": cls.MAX_ROWS,
                "step": 1,
                "forceInput": True,
                "tooltip": "When >0, selects that preset row (1-%d) directly, overriding manual_preset. Use 0 to fall back to manual_preset/keywords. Connect an integer index output here; leave unconnected to use manual_preset." % cls.MAX_ROWS,
            }),
            "visible_rows": ("INT", {
                "default": 5,
                "min": 1,
                "max": cls.MAX_ROWS,
                "step": 1,
                "tooltip": "How many preset rows are active (1-%d)." % cls.MAX_ROWS,
            }),
            "case_sensitive": ("BOOLEAN", {
                "default": False,
                "tooltip": "If enabled, keyword matching is case-sensitive.",
            }),
            "reference_phrase": ("STRING", {
                "default": "",
                "forceInput": True,
                "multiline": True,
                "tooltip": "Text to scan for keywords. Keywords are matched as substrings.",
            }),
            "preset_data": ("STRING", {
                "default": "",
                "multiline": True,
                "tooltip": "Internal: JSON preset rows edited by the Setup dialog. Hidden from the UI.",
            }),
        }
        return {
            "required": required,
            "optional": optional,
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            },
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def select_preset(self, node_identifier, manual_preset="1", match_keywords="Yes",
                      visible_rows=5, case_sensitive=False, reference_phrase="",
                      preset_data="", manual_index=0, prompt=None, unique_id=None, **kwargs):
        values, matched_keyword, matched_index = resolve_preset_selection({
            "visible_rows": visible_rows,
            "manual_preset": manual_preset,
            "manual_index": manual_index,
            "match_keywords": match_keywords,
            "case_sensitive": case_sensitive,
            "reference_phrase": reference_phrase,
            "preset_data": preset_data,
            "unique_id": unique_id,
        }, queue_time=False)
        if values is None:
            values, matched_keyword, matched_index = {}, "", 0

        # Manual wiring outputs: values for the included widgets, in the
        # order the frontend stores in preset_data.widgets (drives the
        # output slot labels).
        widget_order = []
        try:
            parsed = json.loads(preset_data or "[]")
            if isinstance(parsed, dict):
                wl = parsed.get("widgets")
                if isinstance(wl, list):
                    widget_order = [str(w) for w in wl][:self.MAX_MANUAL_OUTPUTS]
        except Exception:
            pass
        manual_values = [values.get(name) for name in widget_order]
        manual_values += [None] * (self.MAX_MANUAL_OUTPUTS - len(manual_values))

        out_json = json.dumps(values, ensure_ascii=False, separators=(",", ":"))

        # Runtime application: when the linked index (Random/Increment/Range)
        # or reference phrase only resolves during execution, the on-prompt
        # handler has ordered the targets after this node. Writing into their
        # prompt inputs here makes them execute with this run's preset.
        if isinstance(prompt, dict) and isinstance(values, dict) and values:
            try:
                # Imported lazily: AUNApplyPresetToNode imports this module.
                from .AUNApplyPresetToNode import _find_target, _write_values_into_node

                for single in [x.strip() for x in str(node_identifier or "").split(",") if x.strip()]:
                    target, target_id = _find_target(prompt, single)
                    if target is None:
                        continue
                    target_values = values
                    meta = target.get("_meta", {}) if isinstance(target, dict) else {}
                    target_title = meta.get("title") or (target.get("class_type") if isinstance(target, dict) else "")
                    for key in (target_id, target_title, single):
                        if key and isinstance(values.get(key), dict):
                            target_values = values.get(key)
                            break
                    if not isinstance(target_values, dict) or not target_values:
                        continue
                    notes = []
                    applied = _write_values_into_node(target, target_values, notes)
                    if not applied:
                        continue
                    try:
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
            except Exception:
                pass

        if unique_id is not None:
            try:
                PromptServer.instance.send_sync(
                    "AUN_preset_manager_executed",
                    {
                        "node_id": str(unique_id),
                        "matched_keyword": matched_keyword,
                        "matched_index": int(matched_index),
                        "selected_values": out_json,
                    },
                )
            except Exception:
                pass

        return (out_json, matched_keyword, int(matched_index), *manual_values)


NODE_CLASS_MAPPINGS = {
    "AUNPresetManager": AUNPresetManager,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNPresetManager": "Preset Manager",
}
