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


def _cycle_index(mode, key, visible_rows, queue_time=False, reset_token=None, runs_per_row=1):
    runs = max(1, int(runs_per_row or 1))
    st = _CYCLE_STATE.setdefault(
        str(key),
        {"last": 0, "run_in_row": 0, "pending": None, "pending_run": 1, "token": None},
    )
    # The Reset button bumps reset_token; the first prompt that sees the new
    # value starts over at row 1 / run 1, the rest of the batch continues.
    if reset_token is not None:
        token = str(reset_token)
        if st.get("token") != token:
            st["last"] = 0
            st["run_in_row"] = 0
            st["pending"] = None
            st["pending_run"] = 1
            st["token"] = token

    def advance_sequential():
        row = int(st.get("last") or 0)
        run = max(1, int(st.get("run_in_row") or 0))
        if row <= 0:
            row, run = 1, 1
        elif run < runs:
            run += 1
        else:
            row = (row % visible_rows) + 1
            run = 1
        st["last"] = row
        st["run_in_row"] = run
        return row, run

    if queue_time:
        if mode == "Sequential":
            row, run = advance_sequential()
        elif mode == "Random":
            row = int(st.get("last") or 0)
            run = max(1, int(st.get("run_in_row") or 0))
            if row <= 0 or run >= runs:
                import random
                row = random.randint(1, visible_rows)
                run = 1
            else:
                run += 1
            st["last"] = row
            st["run_in_row"] = run
        else:
            row = max(1, min(int(st.get("last") or 1), visible_rows))
            run = 1
            st["last"] = row
            st["run_in_row"] = run
        st["pending"] = row
        st["pending_run"] = run
        return row, run

    # execution time
    if st.get("pending") is not None:
        row = int(st["pending"])
        run = max(1, int(st.get("pending_run") or 1))
        st["pending"] = None
        st["pending_run"] = 1
        return row, run
    if mode == "Sequential":
        row, run = advance_sequential()
    elif mode == "Random":
        import random
        row = random.randint(1, visible_rows)
        run = 1
        st["last"] = row
        st["run_in_row"] = run
    else:
        row = max(1, min(int(st.get("last") or 1), visible_rows))
        run = 1
        st["last"] = row
        st["run_in_row"] = run
    st["pending"] = None
    st["pending_run"] = 1
    return row, run


def resolve_preset_selection(inputs, prompt=None, queue_time=False):
    """
    Statically evaluate a preset selection from a manager node's raw input
    dict (as found in the queued prompt). Shared by the node's own execution
    and by AUNApplyPresetToNode's queue-time prompt handler.

    Returns (values_dict, matched_keyword, matched_index, run_in_row) or None
    when the inputs cannot be resolved statically (e.g. reference_phrase is a
    link that cannot be resolved, or manual_index is linked to a
    Random/Increment/Range source whose value only exists at execution time).
    run_in_row is the 1..runs_per_row position inside the current row.
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
    run_in_row = 1
    try:
        mi = int(manual_index)
    except (ValueError, TypeError):
        mi = 0
    if cycle_mode != "Off":
        key = inputs.get("unique_id") or inputs.get("node_identifier") or "global"
        manual_n, run_in_row = _cycle_index(
            cycle_mode,
            key,
            visible_rows,
            queue_time=queue_time,
            reset_token=inputs.get("reset_token"),
            runs_per_row=inputs.get("runs_per_row", 1),
        )
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

    return values, matched_keyword, int(matched_index), int(run_in_row)


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
        "filename fields. Sequential/Random cycling continues across runs; "
        "click the Reset button in the title bar (or the node menu) to start "
        "the next run at row 1. Set runs_per_row > 1 to hold a row for several "
        "runs, and counter_target/counter_widget to drive a 1..runs_per_row "
        "index on another node (e.g. a text index switch in Select mode) so "
        "every prompt runs before the checkpoint changes. Warning: applying a "
        "preset overwrites the target node's widget values (linked inputs are "
        "never overwritten)."
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
            "reset_token": ("INT", {
                "default": 0,
                "min": 0,
                "max": 0xffffffffffffffff,
                "step": 1,
                "tooltip": "Internal: incremented by the Reset title-bar button. A changed value restarts the sequential/random cycle at row 1 on the next run. Hidden from the UI.",
            }),
            "runs_per_row": ("INT", {
                "default": 1,
                "min": 1,
                "max": 10000,
                "step": 1,
                "tooltip": "How many queued runs stay on each preset row before the cycle advances to the next row. Pair with counter_target to sweep an index (e.g. a text index switch) through all prompts for each row.",
            }),
            "counter_target": ("STRING", {
                "default": "",
                "tooltip": "Optional node ID or title whose widget is set to the current run-in-row index (1..runs_per_row) on every queued run. Use a text index switch in Select mode; comma-separated for multiple targets.",
            }),
            "counter_widget": ("STRING", {
                "default": "index",
                "tooltip": "Widget name on counter_target that receives the run-in-row index (default: index).",
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
                      preset_data="", manual_index=0, reset_token=0,
                      runs_per_row=1, counter_target="", counter_widget="index",
                      prompt=None, unique_id=None, **kwargs):
        # The on-prompt handler stores the row resolved at queue time on the
        # manager's prompt node. Use it here so the node's outputs match the
        # values that were actually applied, without advancing the cycle again.
        plan = None
        if isinstance(prompt, dict) and unique_id is not None:
            plan_node = prompt.get(str(unique_id))
            if isinstance(plan_node, dict):
                plan = plan_node.get("_aun_pm_plan")

        if isinstance(plan, dict) and isinstance(plan.get("values"), dict):
            values = plan.get("values") or {}
            matched_keyword = str(plan.get("keyword") or "")
            matched_index = int(plan.get("index") or 0)
            run_in_row = int(plan.get("run_in_row") or 1)
        else:
            values, matched_keyword, matched_index, run_in_row = resolve_preset_selection({
                "visible_rows": visible_rows,
                "manual_preset": manual_preset,
                "manual_index": manual_index,
                "match_keywords": match_keywords,
                "case_sensitive": case_sensitive,
                "reference_phrase": reference_phrase,
                "preset_data": preset_data,
                "reset_token": reset_token,
                "runs_per_row": runs_per_row,
                "unique_id": unique_id,
            }, queue_time=False)
            if values is None:
                values, matched_keyword, matched_index, run_in_row = {}, "", 0, 1

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
                        "run_in_row": int(run_in_row),
                        "runs_per_row": int(runs_per_row or 1),
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
