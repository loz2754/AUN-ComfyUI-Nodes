import os
import re
from typing import Any

from server import PromptServer


class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True
    def __ne__(self, _):
        return False

any_type = AlwaysEqualProxy("*")


MAX_SLOTS = 350


class AUNScanAndShowWidgets:
    """
    Scan a target node by ID/title and display all its widget values
    as overlay cards, with dynamic output slots for wiring.
    """

    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "Scan a target node, display widget values as cards, and pass them through."
    RETURN_TYPES = tuple(any_type for _ in range(MAX_SLOTS))
    RETURN_NAMES = tuple(f"value_{i}" for i in range(1, MAX_SLOTS + 1))
    FUNCTION = "scan"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "node_identifier": ("STRING", {"default": "0", "tooltip": "Numeric ID or Title of the node to scan."}),
            },
            "optional": {
                "basename_if_path": ("BOOLEAN", {"default": True, "tooltip": "If a value looks like a path, return only the basename."}),
                "concat_widget_name": ("BOOLEAN", {"default": False, "tooltip": "If true, prefix each string value with its widget name and a dash."}),
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
            if AUNScanAndShowWidgets._id_matches(nid, identifier):
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
                    if AUNScanAndShowWidgets._id_matches(n.get("id"), identifier):
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

    @staticmethod
    def _collect_widgets(node: dict) -> list[tuple[str, Any]]:
        """Collect all widget name/value pairs from a node, in order."""
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
                    widgets.append((k, v))
                    seen.add(k)

        widgets_values = node.get("widgets_values")
        widgets_meta = node.get("widgets")

        if isinstance(widgets_values, dict):
            for k, v in widgets_values.items():
                if isinstance(k, str) and k not in seen:
                    widgets.append((k, v))
                    seen.add(k)
        elif isinstance(widgets_values, list):
            if isinstance(widgets_meta, list):
                for i, meta in enumerate(widgets_meta):
                    if not isinstance(meta, dict):
                        continue
                    nm = meta.get("name") or meta.get("label") or meta.get("title")
                    if isinstance(nm, str) and nm not in seen and i < len(widgets_values):
                        widgets.append((nm, widgets_values[i]))
                        seen.add(nm)
            else:
                for i, v in enumerate(widgets_values):
                    nm = f"widget_{i}"
                    if nm not in seen:
                        widgets.append((nm, v))
                        seen.add(nm)

        return widgets

    @staticmethod
    def _maybe_basename(s: str, enable: bool) -> str:
        if not enable or not isinstance(s, str):
            return s
        stripped = s.strip()
        if stripped.startswith("{"):
            try:
                import json
                obj = json.loads(stripped)
                if isinstance(obj, dict):
                    for key in ("lora", "model", "checkpoint", "ckpt", "path", "name", "value"):
                        val = obj.get(key)
                        if isinstance(val, str) and ("/" in val or "\\" in val or re.search(r"\.(safetensors|ckpt|pt|bin|gguf)$", val, re.I)):
                            return os.path.basename(val.replace("\\", "/"))
            except (json.JSONDecodeError, AttributeError):
                pass
            return s
        norm = s.replace("\\", "/")
        if "/" in norm or re.search(r"\.(safetensors|ckpt|pt|bin|gguf)$", norm, re.I):
            return os.path.basename(norm)
        return s

    @staticmethod
    def _as_string(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        if isinstance(value, (int, float, bool)):
            return str(value)
        try:
            import json
            return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        except Exception:
            return str(value)

    @staticmethod
    def _infer_type(value: Any) -> str:
        if isinstance(value, bool):
            return "BOOLEAN"
        if isinstance(value, int):
            return "INT"
        if isinstance(value, float):
            return "FLOAT"
        if isinstance(value, str):
            return "STRING"
        if isinstance(value, dict):
            return "DICT"
        if isinstance(value, list):
            return "LIST"
        return "STRING"

    def scan(self, node_identifier: str, basename_if_path: bool = True, concat_widget_name: bool = False,
             prompt=None, extra_pnginfo=None, unique_id=None, **kwargs):
        ident = str(node_identifier).strip()

        node = self._get_node_from_prompt(prompt, ident)
        if node is None:
            node = self._get_node_from_workflow(extra_pnginfo, ident)

        widgets = []
        target_title = None
        if node is not None:
            widgets = self._collect_widgets(node)
            meta = node.get("_meta", {})
            target_title = meta.get("title") or node.get("title") or node.get("localized_name")

        if unique_id is not None and target_title:
            PromptServer.instance.send_sync(
                "AUN.set_node_title",
                {"node_id": unique_id, "title": f"Widget Scan: {target_title}"},
            )

        values = []
        names = []
        entries = []

        for i in range(MAX_SLOTS):
            if i < len(widgets):
                wname, wval = widgets[i]
                names.append(wname)

                display_val = wval
                if isinstance(wval, (dict, list)):
                    import json
                    display_val = json.dumps(wval, ensure_ascii=False, separators=(",", ":"))

                if isinstance(display_val, str):
                    out = self._maybe_basename(display_val, basename_if_path)
                    if concat_widget_name:
                        out = f"{wname} - {out}"
                    values.append(out)
                else:
                    out = display_val
                    values.append(out)

                entries.append({
                    "type": self._infer_type(wval),
                    "caption": wname,
                    "value": self._as_string(out),
                })
            else:
                values.append(None)

        return {
            "ui": {"widget_names": names, "entries": entries},
            "result": (*values,),
        }


NODE_CLASS_MAPPINGS = {
    "AUNScanAndShowWidgets": AUNScanAndShowWidgets,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNScanAndShowWidgets": "Scan And Show Widgets",
}
