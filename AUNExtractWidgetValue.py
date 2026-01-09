import os
import json
import re
from typing import Any, Dict


class AUNExtractWidgetValue:
    """
    Extract a widget/input value from a specific node by numeric ID and widget name.

    Looks in both the live graph (prompt) and the embedded workflow JSON (extra_pnginfo["workflow"]).
    Returns a single STRING output. Non-string values are converted to a compact JSON/text form.
    """

    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "Extract a widget/input value from a specific node by numeric ID and widget name."
    RETURN_TYPES = ("STRING", "FLOAT", "INT")
    RETURN_NAMES = ("value", "value_float", "value_int")
    FUNCTION = "extract"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "node_identifier": ("STRING", {"default": "0", "tooltip": "Numeric ID or Title of the node to inspect."}),
                "widget_name": ("STRING", {"default": "model", "tooltip": "Input/widget name to read from the node (case-insensitive)."}),
            },
            "optional": {
                "fallback": ("STRING", {"default": "", "tooltip": "Value to return if the widget isn't found."}),
                "basename_if_path": ("BOOLEAN", {"default": True, "tooltip": "If the value looks like a path, return only the basename."}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Re-evaluate on each run so live widget changes are reflected
        return float("nan")

    @staticmethod
    def _as_string(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        if isinstance(value, (int, float, bool)):
            return str(value)
        try:
            return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        except Exception:
            return str(value)

    @staticmethod
    def _maybe_basename(s: str, enable: bool) -> str:
        if not enable or not isinstance(s, str):
            return s
        norm = s.replace("\\", "/")
        # Basic heuristic: looks like a path or has typical model extensions
        if "/" in norm or re.search(r"\.(safetensors|ckpt|pt|bin|gguf)$", norm, re.I):
            return os.path.basename(norm)
        return s

    @staticmethod
    def _parse_numeric(val: Any) -> tuple[float, int]:
        # Returns (float_value, int_value) with reasonable defaults when not numeric
        if isinstance(val, bool):
            return (1.0 if val else 0.0, 1 if val else 0)
        if isinstance(val, int):
            return (float(val), int(val))
        if isinstance(val, float):
            # int conversion truncates toward zero (Python behavior)
            return (float(val), int(val))
        if isinstance(val, str):
            s = val.strip()
            # Try int, then float
            try:
                i = int(s)
                return (float(i), i)
            except Exception:
                pass
            try:
                f = float(s)
                return (f, int(f))
            except Exception:
                return (0.0, 0)
        return (0.0, 0)

    @staticmethod
    def _find_in_inputs(inputs: Dict[str, Any], widget_name: str) -> Any:
        if not isinstance(inputs, dict):
            return None
        # Exact match
        if widget_name in inputs:
            return inputs.get(widget_name)
        # Case-insensitive fallback
        lname = widget_name.lower()
        for k, v in inputs.items():
            try:
                if isinstance(k, str) and k.lower() == lname:
                    return v
            except Exception:
                pass
        return None

    @staticmethod
    def _get_node_from_prompt(prompt, identifier: str):
        if not isinstance(prompt, dict):
            return None
        
        # Try as ID first (exact)
        node = prompt.get(identifier)
        if node:
            return node
            
        # Try searching by title or partial ID (for namespaced IDs in subgraphs)
        for nid, ninfo in prompt.items():
            # Check for namespaced ID (e.g. "10.5" if identifier is "5")
            if nid == identifier or (isinstance(nid, str) and nid.endswith("." + identifier)):
                return ninfo
                
            # Check title in _meta
            meta = ninfo.get("_meta", {})
            if meta.get("title") == identifier:
                return ninfo
        return None

    @staticmethod
    def _get_node_from_workflow(extra_pnginfo, identifier: str):
        try:
            wf = None
            if isinstance(extra_pnginfo, dict):
                wf = extra_pnginfo.get('workflow')
            
            if not wf or not isinstance(wf, dict):
                return None

            def search_nodes(nodes_list):
                if not isinstance(nodes_list, list):
                    return None
                for n in nodes_list:
                    if not isinstance(n, dict):
                        continue
                    # Check ID
                    if str(n.get('id')) == identifier:
                        return n
                    # Check Title
                    if n.get('title') == identifier:
                        return n
                    # Check localized_name
                    if n.get('localized_name') == identifier:
                        return n
                    # Recursive search for nested nodes (UI groups or some extensions)
                    if "nodes" in n and isinstance(n["nodes"], list):
                        found = search_nodes(n["nodes"])
                        if found:
                            return found
                return None

            # 1. Search top-level nodes
            if isinstance(wf.get('nodes'), list):
                found = search_nodes(wf['nodes'])
                if found:
                    return found

            # 2. Search in definitions (for native ComfyUI Components/Subgraphs)
            definitions = wf.get('definitions', {})
            if isinstance(definitions, dict):
                subgraphs = definitions.get('subgraphs', [])
                if isinstance(subgraphs, list):
                    for sg in subgraphs:
                        if isinstance(sg, dict):
                            found = search_nodes(sg.get('nodes'))
                            if found:
                                return found
        except Exception:
            pass
        return None

    def _resolve_value(self, val, prompt, extra_pnginfo, depth=0):
        if depth > 3:
            return val
        if isinstance(val, list) and len(val) >= 2:
            # It's a link: [node_id, output_index]
            target_id = str(val[0])
            node = self._get_node_from_prompt(prompt, target_id)
            if not node:
                node = self._get_node_from_workflow(extra_pnginfo, target_id)
            
            if node:
                inputs = node.get('inputs', {})
                # Try common names for value-providing nodes
                for k in ['value', 'float', 'int', 'number', 'string', 'text', 'boolean']:
                    found = self._find_in_inputs(inputs, k)
                    if found is not None:
                        return self._resolve_value(found, prompt, extra_pnginfo, depth + 1)
        return val

    def extract(self, node_identifier: str, widget_name: str, fallback: str = "", basename_if_path: bool = True, prompt=None, extra_pnginfo=None):
        chosen = None
        ident = str(node_identifier).strip()

        # 1) Check current graph (Prompt)
        try:
            node = self._get_node_from_prompt(prompt, ident)
            if isinstance(node, dict):
                # In prompt, widgets are in 'inputs'
                val = self._find_in_inputs(node.get('inputs', {}), widget_name)
                if val is not None:
                    chosen = self._resolve_value(val, prompt, extra_pnginfo)
        except Exception:
            pass

        # 2) Check workflow JSON (UI State)
        if chosen is None:
            try:
                node = self._get_node_from_workflow(extra_pnginfo, ident)
                if isinstance(node, dict):
                    # In workflow, values can be in 'widgets_values' or 'inputs'
                    val = self._find_in_inputs(node.get('inputs', {}), widget_name)
                    if val is not None:
                        chosen = self._resolve_value(val, prompt, extra_pnginfo)
            except Exception:
                pass

        final_val = chosen if chosen is not None else fallback
        out = self._as_string(final_val)
        out = self._maybe_basename(out, basename_if_path)
        fval, ival = self._parse_numeric(final_val)
        return (out, float(fval), int(ival))


NODE_CLASS_MAPPINGS = {
    "AUNExtractWidgetValue": AUNExtractWidgetValue,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNExtractWidgetValue": "AUN Extract Widget Value",
}
