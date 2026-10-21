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
    cannot be resolved).
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
        # Linked manual_index (e.g. a cycling node) cannot be resolved
        # statically at queue time; wired execution handles it instead.
        return None

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
                "tooltip": "Preset name or row number (1-%d) to use as the active bundle. Clamped to visible_rows. With match_keywords=No, this is always used. With match_keywords=Yes, keywords can override it when they match." % cls.MAX_ROWS,
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
                      preset_data="", manual_index=0, unique_id=None, **kwargs):
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
