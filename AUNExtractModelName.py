import os
import re
from typing import Dict, List, Tuple
from .model_utils import (
    sanitize_for_filename, 
    get_short_name, 
    extract_from_node
)

# Local lightweight shortener so we don't import heavy modules from AUNSaveVideo

class AUNExtractModelName:
    """
    Extract a model name from a specific node (by numeric ID) for use in filenames.

    - Provide the node_id of your video model loader (e.g., UNet loader, Diffusers loader, GGUF loader).
    - The node's inputs are scanned for a model-like string value.

    Outputs:
    - full_model_name: string (always the real extracted model basename)
    - short/manual name: string (auto-shortened or manual when switch enabled; safe for filenames)
    """

    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "Extract a model name from a specific node (by numeric ID) for use in filenames. Provide the node_id of your video model loader (e.g., UNet loader, Diffusers loader, GGUF loader). The node's inputs are scanned for a model-like string value. Outputs: full_model_name: string (always the real extracted model basename), short/manual name: string (auto-shortened or manual when switch enabled; safe for filenames)."
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("full_model_name", "short/manual name")
    FUNCTION = "extract"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "node_id": ("STRING", {"default": "0", "tooltip": "The numeric ID or Title of the model loader node to inspect."}),
            },
            "optional": {
                "manual_name": ("STRING", {"default": "", "multiline": False, "tooltip": "Manual model name (optional). When 'use manual name' is on, this value (sanitized) becomes the short/manual output."}),
                "use_manual_name": ("BOOLEAN", {"default": False, "tooltip": "When true and manual_name is not empty, outputs will use the manual name (sanitized)."}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Force re-execution to reflect upstream widget changes each run
        return float("nan")

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
            if nid == identifier or (isinstance(nid, str) and nid.endswith("." + identifier)):
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

    def extract(
        self,
        node_id: str,
        manual_name: str = "",
        use_manual_name: bool = False,
        prompt = None,
        extra_pnginfo = None,
    ):
        chosen = None
        ident = str(node_id).strip()

        # 1) Look in the main graph
        try:
            node = self._get_node_from_prompt(prompt, ident)
            cand = extract_from_node(node)
            if cand:
                chosen = cand
        except Exception:
            pass

        # 2) Look in embedded workflow JSON
        if not chosen:
            try:
                node = self._get_node_from_workflow(extra_pnginfo, ident)
                cand = extract_from_node(node)
                if cand:
                    chosen = cand
            except Exception:
                pass

        chosen = chosen or ""
        # Always extract the true model name for output 1
        if chosen:
            base = os.path.basename(chosen.replace("\\", "/"))
            full_model_name = os.path.splitext(base)[0]
        else:
            full_model_name = ""
        _manual = str(manual_name) if manual_name is not None else ""
        # Output 2: short/manual name for filename
        if use_manual_name and _manual.strip():
            model_short = sanitize_for_filename(_manual)
        else:
            model_short = get_short_name(chosen) if chosen else ""
        return (full_model_name, model_short)


NODE_CLASS_MAPPINGS = {
    "AUNExtractModelName": AUNExtractModelName,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNExtractModelName": "AUN Extract Model Name",
}
