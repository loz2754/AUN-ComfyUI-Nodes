import json
from typing import Any

from server import PromptServer


class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True
    def __ne__(self, _):
        return False

any_type = AlwaysEqualProxy("*")


MAX_ROWS = 20
MAX_WIDGETS_PER_ROW = 25


class AUNAutoPopulatePresets:
    """
    Scan a target node to discover its widget definitions, then provide a
    row-based keyword selector whose per-row slot widgets are renamed and
    re-typed by the frontend to match the target.  Outputs the selected
    row's values for manual wiring to the target node.
    """

    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = (
        "Scan a target node and discover its widget definitions (combo options, "
        "INT, FLOAT, BOOLEAN, STRING). The frontend renames and re-types generic "
        "slot widgets to match the target's widgets. Configure keyword-triggered "
        "preset rows, then wire the outputs into the target's inputs manually."
    )
    RETURN_TYPES = tuple(any_type for _ in range(MAX_WIDGETS_PER_ROW))
    RETURN_NAMES = tuple("value_%d" % (i + 1) for i in range(MAX_WIDGETS_PER_ROW))
    FUNCTION = "scan"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        required = {
            "node_identifier": ("STRING", {
                "default": "",
                "tooltip": "Numeric ID or Title of the node to scan.",
            }),
        }

        optional = {
            "visible_rows": ("INT", {
                "default": 5,
                "min": 1,
                "max": MAX_ROWS,
                "step": 1,
                "tooltip": "How many preset rows are active (1-%d)." % MAX_ROWS,
            }),
            "case_sensitive": ("BOOLEAN", {
                "default": False,
                "tooltip": "If enabled, keyword matching is case-sensitive.",
            }),
            "match_keywords": (["Yes", "No"], {
                "default": "Yes",
                "tooltip": "Yes: keywords are matched against reference_phrase. No: use manual_preset to select a row.",
            }),
            "manual_preset": (["%d" % i for i in range(1, MAX_ROWS + 1)], {
                "default": "1",
                "tooltip": "Which preset row (1-%d) to use as the active bundle. Clamped to visible_rows. With match_keywords=No, this is always used. With match_keywords=Yes, keywords can override it when they match." % MAX_ROWS,
            }),
            "reference_phrase": ("STRING", {
                "default": "",
                "forceInput": True,
                "multiline": True,
                "tooltip": "Text to scan for keywords. Keywords are matched as substrings.",
            }),
            "active_widgets": ("STRING", {
                "default": "",
                "tooltip": "Internal: JSON list of widget names exposed as outputs, in order. Managed by the Widgets dialog.",
            }),
        }

        for i in range(1, MAX_ROWS + 1):
            optional["keyword%d" % i] = ("STRING", {
                "default": "",
                "tooltip": "Keyword %d to match against reference_phrase. Comma-separated for multiple synonyms." % i,
            })
            for s in range(1, MAX_WIDGETS_PER_ROW + 1):
                optional["slot%d_%d" % (i, s)] = ("STRING", {
                    "default": "",
                    "tooltip": "Slot %d for row %d. JS renames and re-types this to match the target's widget." % (s, i),
                })

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

    # ------------------------------------------------------------------
    # Node lookup helpers
    # ------------------------------------------------------------------

    @staticmethod
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

    @staticmethod
    def _get_node_from_prompt(prompt, identifier: str):
        if not isinstance(prompt, dict):
            return None
        node = prompt.get(identifier)
        if node:
            return node
        for nid, ninfo in prompt.items():
            if AUNAutoPopulatePresets._id_matches(nid, identifier):
                return ninfo
            meta = ninfo.get("_meta", {})
            if meta.get("title") == identifier:
                return ninfo
        return None

    @staticmethod
    def _get_node_from_workflow(extra_pnginfo, identifier: str):
        try:
            wf = None
            if isinstance(extra_pnginfo, dict):
                wf = extra_pnginfo.get("workflow")
            if not wf or not isinstance(wf, dict):
                return None

            def search_nodes(nodes_list):
                if not isinstance(nodes_list, list):
                    return None
                for n in nodes_list:
                    if not isinstance(n, dict):
                        continue
                    if AUNAutoPopulatePresets._id_matches(n.get("id"), identifier):
                        return n
                    if n.get("title") == identifier:
                        return n
                    if n.get("localized_name") == identifier:
                        return n
                    if "nodes" in n and isinstance(n["nodes"], list):
                        found = search_nodes(n["nodes"])
                        if found:
                            return found
                return None

            if isinstance(wf.get("nodes"), list):
                found = search_nodes(wf["nodes"])
                if found:
                    return found

            definitions = wf.get("definitions", {})
            if isinstance(definitions, dict):
                subgraphs = definitions.get("subgraphs", [])
                if isinstance(subgraphs, list):
                    for sg in subgraphs:
                        if isinstance(sg, dict):
                            found = search_nodes(sg.get("nodes"))
                            if found:
                                return found
        except Exception:
            pass
        return None

    # ------------------------------------------------------------------
    # Widget collection
    # ------------------------------------------------------------------

    @staticmethod
    def _collect_widgets_with_meta(node: dict) -> list[dict]:
        """Collect all widget name/value/type/options from a node, in order."""
        widgets = []
        seen = set()

        if not isinstance(node, dict):
            return widgets

        inputs = node.get("inputs", {})
        if isinstance(inputs, dict):
            for k, v in inputs.items():
                if isinstance(k, str) and k not in seen:
                    if isinstance(v, list) and len(v) >= 2:
                        continue
                    widgets.append({"name": k, "value": v, "type": "STRING", "options": None})
                    seen.add(k)

        widgets_values = node.get("widgets_values")
        widgets_meta = node.get("widgets")

        meta_type_map = {}
        if isinstance(widgets_meta, list):
            for meta in widgets_meta:
                if not isinstance(meta, dict):
                    continue
                nm = meta.get("name") or meta.get("label") or meta.get("title")
                if not isinstance(nm, str):
                    continue
                wtype = meta.get("type", "")
                woptions = None
                wconfig = meta.get("options") or meta.get("config") or {}
                if isinstance(wconfig, dict):
                    woptions = wconfig.get("values") or wconfig.get("choices")
                if wtype == "combo" and isinstance(woptions, list):
                    meta_type_map[nm] = ("COMBO", woptions)
                elif wtype in ("number", "slider"):
                    step = wconfig.get("step") if isinstance(wconfig, dict) else None
                    precision = wconfig.get("precision") if isinstance(wconfig, dict) else None
                    is_int = (isinstance(step, (int, float)) and step >= 1
                              and (precision is None or (isinstance(precision, (int, float)) and precision == 0)))
                    meta_type_map[nm] = ("INT" if is_int else "FLOAT", None)
                elif wtype in ("toggle", "checkbox"):
                    meta_type_map[nm] = ("BOOLEAN", None)
                elif wtype in ("text", "string"):
                    meta_type_map[nm] = ("STRING", None)
                else:
                    meta_type_map[nm] = (wtype.upper() if wtype else "STRING", None)

        if isinstance(widgets_values, dict):
            for k, v in widgets_values.items():
                if isinstance(k, str) and k not in seen:
                    wtype, wopts = meta_type_map.get(k, ("STRING", None))
                    widgets.append({"name": k, "value": v, "type": wtype, "options": wopts})
                    seen.add(k)
        elif isinstance(widgets_values, list):
            if isinstance(widgets_meta, list):
                for i, meta in enumerate(widgets_meta):
                    if not isinstance(meta, dict):
                        continue
                    nm = meta.get("name") or meta.get("label") or meta.get("title")
                    if isinstance(nm, str) and nm not in seen and i < len(widgets_values):
                        wtype, wopts = meta_type_map.get(nm, ("STRING", None))
                        widgets.append({"name": nm, "value": widgets_values[i], "type": wtype, "options": wopts})
                        seen.add(nm)
            else:
                for i, v in enumerate(widgets_values):
                    nm = "widget_%d" % i
                    if nm not in seen:
                        widgets.append({"name": nm, "value": v, "type": "STRING", "options": None})
                        seen.add(nm)

        for w in widgets:
            if w["type"] == "STRING" and w["options"] is None:
                val = w["value"]
                if isinstance(val, bool):
                    w["type"] = "BOOLEAN"
                elif isinstance(val, int):
                    w["type"] = "INT"
                elif isinstance(val, float):
                    w["type"] = "FLOAT"

        return widgets

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    def scan(self, node_identifier: str, visible_rows: int = 5,
             case_sensitive: bool = False, match_keywords: str = "Yes",
             manual_preset: int = 1, reference_phrase: str = "",
             active_widgets: str = "",
             prompt=None, extra_pnginfo=None, unique_id=None, **kwargs):

        visible_rows = max(1, min(int(visible_rows or 5), MAX_ROWS))
        manual_preset = max(1, min(int(manual_preset or 1), visible_rows))
        keywords_on = match_keywords == "Yes"

        # --- Phase 1: Scan target and send widget data to frontend ---
        ident = str(node_identifier).strip()
        node = self._get_node_from_prompt(prompt, ident)
        if node is None:
            node = self._get_node_from_workflow(extra_pnginfo, ident)

        widgets = []
        target_title = None
        if node is not None:
            widgets = self._collect_widgets_with_meta(node)
            meta = node.get("_meta", {})
            target_title = meta.get("title") or node.get("title") or node.get("localized_name")

        combo_options = {}
        widget_data = []
        for w in widgets[:MAX_WIDGETS_PER_ROW]:
            entry = {"name": w["name"], "type": w["type"], "value": w["value"]}
            if w["options"] is not None:
                entry["options"] = w["options"]
                combo_options[w["name"]] = w["options"]
            widget_data.append(entry)

        if unique_id is not None:
            try:
                PromptServer.instance.send_sync(
                    "AUN_auto_populate_presets_scanned",
                    {
                        "node_id": str(unique_id),
                        "target_title": target_title or "",
                        "widget_data": json.dumps(widget_data, default=str, ensure_ascii=False),
                        "combo_options": json.dumps(combo_options, default=str, ensure_ascii=False),
                    },
                )
            except Exception:
                pass

        # --- Phase 2: Keyword matching using generic slot values ---
        search = reference_phrase if case_sensitive else reference_phrase.lower()

        matched_index = 0
        matched_keyword = ""

        if keywords_on:
            for i in range(1, visible_rows + 1):
                raw_kw = kwargs.get("keyword%d" % i, "")
                sub_keywords = [k.strip() for k in str(raw_kw).split(",") if k.strip()]
                for sub in sub_keywords:
                    match_kw = sub if case_sensitive else sub.lower()
                    if match_kw in search:
                        matched_index = i
                        matched_keyword = sub
                        break
                if matched_index:
                    break

        if not matched_index:
            matched_index = manual_preset

        if unique_id is not None:
            try:
                PromptServer.instance.send_sync(
                    "AUN_auto_populate_presets_executed",
                    {
                        "node_id": str(unique_id),
                        "matched_keyword": matched_keyword,
                        "matched_index": int(matched_index),
                    },
                )
            except Exception:
                pass

        # Read the matched row's slot values, auto-cast to native types
        # Parse active_widgets as [name, slot] pairs (explicit mapping from JS)
        pairs = []
        try:
            parsed = json.loads(active_widgets or "")
            if isinstance(parsed, list):
                for item in parsed:
                    if isinstance(item, (list, tuple)) and len(item) >= 2:
                        name = str(item[0])
                        slot = int(item[1])
                        if 1 <= slot <= MAX_WIDGETS_PER_ROW:
                            pairs.append((name, slot))
        except Exception:
            pass

        if pairs:
            result = []
            for name, s in pairs:
                val = kwargs.get("slot%d_%d" % (matched_index, s), "")
                if val is None:
                    val = ""
                result.append(self._auto_cast(val))
        else:
            result = []
            for s in range(1, MAX_WIDGETS_PER_ROW + 1):
                val = kwargs.get("slot%d_%d" % (matched_index, s), "")
                if val is None:
                    val = ""
                result.append(self._auto_cast(val))

        # Pad to MAX_WIDGETS_PER_ROW (needed because RETURN_TYPES is fixed)
        while len(result) < MAX_WIDGETS_PER_ROW:
            result.append(None)

        return {"result": tuple(result)}

    @staticmethod
    def _auto_cast(val):
        if not isinstance(val, str):
            return val
        s = val.strip()
        if not s:
            return s
        if s.lower() in ("true", "yes", "on"):
            return True
        if s.lower() in ("false", "no", "off"):
            return False
        try:
            f = float(s)
            if f == int(f) and "." not in s:
                return int(f)
            return f
        except ValueError:
            return s


NODE_CLASS_MAPPINGS = {
    "AUNAutoPopulatePresets": AUNAutoPopulatePresets,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNAutoPopulatePresets": "Auto-Populate Presets",
}
