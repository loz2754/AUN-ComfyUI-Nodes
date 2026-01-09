import os
import re
from typing import Dict, List, Tuple
from .model_utils import (
    sanitize_for_filename, 
    get_short_name, 
    extract_from_node
)

class AUNModelNamePass:
    """
    Pass-through node for a MODEL that also extracts its name (full and shortened).
    It traces back from the connected 'model' input in the graph to find the original loader.
    """

    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "Pass-through node for a MODEL that also extracts its name (full and shortened). Traces back to find the loader node."
    RETURN_TYPES = ("MODEL", "STRING", "STRING")
    RETURN_NAMES = ("model", "full_model_name", "short/manual name")
    FUNCTION = "process"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL", {"tooltip": "The model to pass through and extract from."}),
            },
            "optional": {
                "manual_name": ("STRING", {"default": "", "multiline": False, "tooltip": "Manual model name (optional). When 'use manual name' is on, this value (sanitized) becomes the short/manual output."}),
                "use_manual_name": ("BOOLEAN", {"default": False, "tooltip": "When true and manual_name is not empty, outputs will use the manual name (sanitized)."}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

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
                    if str(n.get('id')) == identifier:
                        return n
                    if n.get('title') == identifier:
                        return n
                    if n.get('localized_name') == identifier:
                        return n
                    if "nodes" in n and isinstance(n["nodes"], list):
                        found = search_nodes(n["nodes"])
                        if found:
                            return found
                return None

            if isinstance(wf.get('nodes'), list):
                found = search_nodes(wf['nodes'])
                if found:
                    return found

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

    def _trace_back(self, prompt, extra_pnginfo, start_node_id):
        ident = str(start_node_id)
        # 1. Try from prompt
        node_prompt = prompt.get(ident)
        if node_prompt:
            cand = extract_from_node(node_prompt)
            if cand:
                return cand
        
        # 2. Try from workflow
        node_wf = self._get_node_from_workflow(extra_pnginfo, ident)
        if node_wf:
            cand = extract_from_node(node_wf)
            if cand:
                return cand

        # 3. Recursive trace
        if node_prompt:
            inputs = node_prompt.get("inputs", {})
            # Common model parent inputs
            for inp_name in ["model", "unet", "diffusion_model", "clip", "vae"]:
                conn = inputs.get(inp_name)
                # In prompt, connections are [node_id, output_index]
                if isinstance(conn, list) and len(conn) >= 1:
                    parent_id = conn[0]
                    res = self._trace_back(prompt, extra_pnginfo, parent_id)
                    if res:
                        return res
        return None

    def process(self, model, unique_id, manual_name="", use_manual_name=False, prompt=None, extra_pnginfo=None):
        chosen = None
        
        # Find which node is connected to our 'model' input
        if prompt and unique_id in prompt:
            my_node = prompt[unique_id]
            my_inputs = my_node.get("inputs", {})
            model_conn = my_inputs.get("model")
            if isinstance(model_conn, list) and len(model_conn) >= 1:
                source_id = model_conn[0]
                chosen = self._trace_back(prompt, extra_pnginfo, source_id)

        chosen = chosen or ""
        if chosen:
            base = os.path.basename(chosen.replace("\\", "/"))
            full_model_name = os.path.splitext(base)[0]
        else:
            full_model_name = "UnknownModel"

        _manual = str(manual_name) if manual_name is not None else ""
        if use_manual_name and _manual.strip():
            model_short = sanitize_for_filename(_manual)
        else:
            model_short = get_short_name(chosen) if chosen else ""

        return (model, full_model_name, model_short)

NODE_CLASS_MAPPINGS = {
    "AUNModelNamePass": AUNModelNamePass,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNModelNamePass": "AUN Model Name Pass",
}
