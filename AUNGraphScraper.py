import os
import json
import re
from typing import Any, Dict

class AUNGraphScraper:
    """
    Scrapes multiple values from across the entire graph using a template.
    Syntax: {NodeTitle.WidgetName} or {NodeID.WidgetName}
    Example: "Model: {1.ckpt_name} | Weight: {FaceID.weight}"
    """

    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "Scrape multiple values from any node in the graph using {Node.Widget} syntax."
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "scrape"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "template": ("STRING", {"multiline": True, "default": "Model: {1.ckpt_name} | Weight: {FaceID.weight}"}),
            },
            "optional": {
                "basename_if_path": ("BOOLEAN", {"default": True}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def _get_value(self, identifier: str, widget_name: str, prompt, extra_pnginfo):
        ident = identifier.strip()
        wname = widget_name.strip().lower()
        
        # Helper to find in inputs
        def find_val(inputs, name):
            if not isinstance(inputs, dict): return None
            if name in inputs: return inputs[name]
            lname = name.lower()
            for k, v in inputs.items():
                if str(k).lower() == lname: return v
            return None

        def resolve_link(val, depth=0):
            if depth > 3: return val
            if isinstance(val, list) and len(val) >= 2:
                target_id = str(val[0])
                # Find the linked node
                target_node = prompt.get(target_id) if prompt else None
                if not target_node and extra_pnginfo:
                    wf = extra_pnginfo.get("workflow", {})
                    def search(nodes):
                        if not isinstance(nodes, list): return None
                        for n in nodes:
                            if not isinstance(n, dict): continue
                            if str(n.get("id")) == target_id: return n
                            if "nodes" in n and isinstance(n["nodes"], list):
                                found = search(n["nodes"])
                                if found: return found
                        return None
                    target_node = search(wf.get("nodes"))
                
                if target_node:
                    t_inputs = target_node.get("inputs", {})
                    for k in ["value", "float", "int", "number", "string", "text", "boolean"]:
                        cand = find_val(t_inputs, k)
                        if cand is not None:
                            return resolve_link(cand, depth + 1)
            return val

        # 1. Find Node
        node = None
        # Check Prompt (Live)
        if prompt:
            node = prompt.get(ident)
            if not node:
                for nid, ninfo in prompt.items():
                    # Check for exact title or namespaced ID (for subgraphs)
                    if ninfo.get("_meta", {}).get("title") == ident or (isinstance(nid, str) and nid.endswith("." + ident)):
                        node = ninfo; break
        
        # Check Workflow (UI/Nested)
        if not node and extra_pnginfo:
            wf = extra_pnginfo.get("workflow", {})
            def search(nodes):
                if not isinstance(nodes, list): return None
                for n in nodes:
                    if not isinstance(n, dict): continue
                    if str(n.get("id")) == ident or n.get("title") == ident or n.get("localized_name") == ident: return n
                    if "nodes" in n and isinstance(n["nodes"], list):
                        found = search(n["nodes"])
                        if found: return found
                return None
            
            # 1. Search top-level nodes
            if "nodes" in wf:
                node = search(wf["nodes"])
            
            # 2. Search definitions (for native subgraphs)
            if not node:
                definitions = wf.get('definitions', {})
                subgraphs = definitions.get('subgraphs', []) if isinstance(definitions, dict) else []
                for sg in subgraphs:
                    if isinstance(sg, dict):
                        node = search(sg.get('nodes'))
                        if node: break

        if not node: return f"[{ident} not found]"

        # 2. Extract Value
        val = find_val(node.get("inputs", {}), widget_name)
        
        # Format
        if val is None: return f"[{wname} not found]"
        
        # Follow links if necessary (crucial for Float nodes connected as inputs)
        val = resolve_link(val)
        
        s_val = str(val)
        if self.basename_if_path and ("/" in s_val or "\\" in s_val):
            s_val = os.path.basename(s_val.replace("\\", "/"))
        
        return s_val

    def scrape(self, template, basename_if_path, prompt=None, extra_pnginfo=None):
        self.basename_if_path = basename_if_path
        
        def replace_placeholder(match):
            content = match.group(1)
            if "." in content:
                node_ident, widget_name = content.split(".", 1)
                return self._get_value(node_ident, widget_name, prompt, extra_pnginfo)
            return match.group(0)

        result = re.sub(r"\{([^}]+)\}", replace_placeholder, template)
        return (result,)

NODE_CLASS_MAPPINGS = {
    "AUNGraphScraper": AUNGraphScraper,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNGraphScraper": "AUN Graph Scraper",
}
