import json

from server import PromptServer


class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False


any_type = AlwaysEqualProxy("*")


def resolve_preset_selection(inputs):
    """
    Statically evaluate a preset selection from a manager node's raw input
    dict (as found in the queued prompt). Shared by the node's own execution
    and by AUNApplyPresetToNode's queue-time prompt handler.

    Returns (values_dict, matched_keyword, matched_index) or None when the
    inputs cannot be resolved statically (e.g. reference_phrase is a link).
    """
    if not isinstance(inputs, dict):
        return None
    visible_rows = max(1, min(int(inputs.get("visible_rows") or 5), AUNPresetManager.MAX_ROWS))
    manual_preset = inputs.get("manual_preset", "1")
    manual_n = max(1, min(int(manual_preset or 1), visible_rows))
    match_keywords = inputs.get("match_keywords", "Yes")
    case_sensitive = bool(inputs.get("case_sensitive", False))

    reference_phrase = inputs.get("reference_phrase", "")
    if isinstance(reference_phrase, list):
        return None  # linked — cannot resolve statically at queue time
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
        "(use the Setup button; the dialog scans the target live). Outputs "
        "the selected row's values as a JSON string plus the matched "
        "keyword/index for AUNApplyPresetToNode (automatic application). "
        "Also outputs up to 12 manual value slots (ANY type) labelled with "
        "the widget names, for wiring directly into a target node's "
        "converted inputs or into other nodes such as AUNSaveImageV2 "
        "filename fields."
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
            "manual_preset": (["%d" % i for i in range(1, cls.MAX_ROWS + 1)], {
                "default": "1",
                "tooltip": "Which preset row (1-%d) to use as the active bundle. Clamped to visible_rows. With match_keywords=No, this is always used. With match_keywords=Yes, keywords can override it when they match." % cls.MAX_ROWS,
            }),
            "match_keywords": (["Yes", "No"], {
                "default": "Yes",
                "tooltip": "Yes: keywords are matched against reference_phrase; the first matching row wins, falling back to manual_preset. No: keywords are ignored; manual_preset is always used.",
            }),
        }
        optional = {
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
                      preset_data="", unique_id=None, **kwargs):
        values, matched_keyword, matched_index = resolve_preset_selection({
            "visible_rows": visible_rows,
            "manual_preset": manual_preset,
            "match_keywords": match_keywords,
            "case_sensitive": case_sensitive,
            "reference_phrase": reference_phrase,
            "preset_data": preset_data,
        })
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
