import os as _os_mod
import re
from typing import Dict

from .logger import logger
from .model_utils import (
    get_lora_short_name as get_lora_short_name_common,
    LORA_SHORT_NAMES,
)
from .aun_lora_extraction_shared import BASIC_LORA_TARGET_NAMES, extract_basic_loras_from_inputs

class AUNExtractPowerLoras:
    """
    Extract LoRA names (and strengths) from rgthree Power Lora Loader nodes in the graph/workflow.

    Outputs:
    - loras_names (STRING): Newline-separated descriptive entries, one per line.
    - loras_list (STRING): Newline-separated A1111-style entries (e.g. <lora:name:strength>).

    """

    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "Extract LoRA names (and strengths) from rgthree Power Lora Loader nodes in the graph/workflow. Optionally target specific nodes by ID. Outputs: - loras_names (STRING): Descriptive entries, one per line. - loras_list (STRING): A1111-style entries."
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("loras_names", "loras_list")
    FUNCTION = "extract"

    # (Dictionaries now imported from .model_utils)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {                
                "target_node_ids": ("STRING", {"default": "", "multiline": False, "tooltip": "Comma-separated node IDs to extract LoRAs from. Leave empty to extract from all LoRA loaders in the graph."}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Force re-run each time to reflect widget changes
        return float("nan")

    # Utilities shared with AUNSaveVideo
    @staticmethod
    def _sanitize_token_str(value: str) -> str:
        if value is None:
            return ""
        s = str(value).strip().replace("\\", "/").split("/")[-1]
        s = re.sub(r"\s+", "_", s)
        s = re.sub(r"[^A-Za-z0-9._()+\-@]", "", s)
        s = re.sub(r"[_\-]{3,}", "--", s)
        return s

    def _extract_loras_from_inputs(inputs: dict) -> list[dict]:
        return extract_basic_loras_from_inputs(inputs)

    @staticmethod
    def _extract_loras(prompt: Dict | None = None, extra_pnginfo: Dict | None = None, target_ids: set[str] | None = None) -> list[dict]:
        target_names = set(BASIC_LORA_TARGET_NAMES)
        all_items: list[dict] = []
        seen: set[tuple] = set()
        has_target_ids = bool(target_ids)

        wf = None
        if isinstance(extra_pnginfo, dict):
            wf = extra_pnginfo.get('workflow')
        
        def find_all_nodes(nodes_list):
            res = []
            if not isinstance(nodes_list, list): return res
            for n in nodes_list:
                if not isinstance(n, dict): continue
                res.append(n)
                if "nodes" in n and isinstance(n["nodes"], list):
                    res.extend(find_all_nodes(n["nodes"]))
            return res

        # Map node IDs to their mode from workflow
        node_modes = {}
        workflow_nodes = []
        if wf and isinstance(wf, dict):
            workflow_nodes.extend(find_all_nodes(wf.get('nodes')))
            # Search in definitions (subgraphs)
            definitions = wf.get('definitions', {})
            if isinstance(definitions, dict):
                subgraphs = definitions.get('subgraphs', [])
                if isinstance(subgraphs, list):
                    for sg in subgraphs:
                        if isinstance(sg, dict):
                            workflow_nodes.extend(find_all_nodes(sg.get('nodes')))
            
            for node in workflow_nodes:
                nid = str(node.get('id', ''))
                if nid:
                    node_modes[nid] = node.get('mode', 0)

        # From prompt graph
        try:
            if isinstance(prompt, dict):
                for nid, node in prompt.items():
                    snid = str(nid)
                    # Skip if targeting specific IDs and this isn't one of them
                    if has_target_ids and snid not in target_ids:
                        continue
                    # Check if bypassed (including namespaced IDs)
                    is_bypassed = False
                    if node_modes.get(snid) == 2:
                        is_bypassed = True
                    else:
                        for wnid, mode in node_modes.items():
                            if mode == 2 and snid.endswith("." + wnid):
                                is_bypassed = True; break
                    if is_bypassed: continue

                    ctype = node.get('class_type') if isinstance(node, dict) else None
                    if ctype and ctype in target_names:
                        items = AUNExtractPowerLoras._extract_loras_from_inputs(node.get('inputs', {}))
                        for it in items or []:
                            key = (it.get('name'), it.get('strength'), it.get('strengthTwo') or it.get('strength_clip'))
                            if key not in seen:
                                seen.add(key)
                                all_items.append(it)
        except Exception:
            pass

        # From embedded workflow JSON
        try:
            for node in workflow_nodes:
                # Check if bypassed
                if node.get('mode', 0) == 2:
                    continue

                nid = str(node.get('id', ''))
                # Skip if targeting specific IDs and this isn't one of them
                if has_target_ids and nid not in target_ids:
                    continue

                ntype = node.get('type') or node.get('class_type')
                if ntype and ntype in target_names:
                    items = AUNExtractPowerLoras._extract_loras_from_inputs(node.get('inputs', {}))
                    for it in items or []:
                        key = (it.get('name'), it.get('strength'), it.get('strengthTwo') or it.get('strength_clip'))
                        if key not in seen:
                            seen.add(key)
                            all_items.append(it)
        except Exception:
            pass
        return all_items

    def extract(self, target_node_ids: str, prompt=None, extra_pnginfo=None):
        # Parse target node IDs
        target_ids = None
        if target_node_ids and target_node_ids.strip():
            target_ids = {nid.strip() for nid in target_node_ids.split(',') if nid.strip()}

        items = AUNExtractPowerLoras._extract_loras(prompt, extra_pnginfo, target_ids)

        def fmt_strength(v):
            try:
                if v is None:
                    return None
                return f"{float(v):.2f}"
            except Exception:
                return None

        descriptive_lines = []
        a1111_lines = []
        raw_names = []
        for it in items:
            raw = it.get('name')
            if not raw:
                continue
            raw_names.append(str(raw))
            base_name_only = _os_mod.path.splitext(_os_mod.path.basename(raw))[0]
            base_name_with_ext = _os_mod.path.basename(raw)
            base = get_lora_short_name_common(raw)
            sm = it.get('strength')
            sc = it.get('strengthTwo') or it.get('strength_clip')
            sm_s = fmt_strength(sm)
            sc_s = fmt_strength(sc)

            # Descriptive format: name (model strength X, clip strength Y)
            if sm_s and sc_s and sm_s != sc_s:
                desc_line = f"{base_name_only} (model strength {sm_s}, clip strength {sc_s})"
            elif sm_s:
                desc_line = f"{base_name_only} (model strength {sm_s})"
            else:
                desc_line = base_name_only

            # A1111 format: <lora:name:strength> or <lora:name:model:clip>
            if sm_s and sc_s and sm_s != sc_s:
                a1111_line = f"<lora:{base_name_with_ext}:{sm_s}:{sc_s}>"
            elif sm_s:
                a1111_line = f"<lora:{base_name_with_ext}:{sm_s}>"
            else:
                a1111_line = f"<lora:{base_name_with_ext}:1.0>"

            if base_name_with_ext:
                descriptive_lines.append(desc_line)
                a1111_lines.append(a1111_line)

        try:
            logger.info(f"AUNExtractPowerLoras: raw={raw_names}")
        except Exception:
            pass

        names_text = "\n".join(descriptive_lines) if descriptive_lines else ""
        list_text = "\n".join(a1111_lines) if a1111_lines else ""
        return (names_text, list_text)


NODE_CLASS_MAPPINGS = {
    "AUNExtractPowerLoras": AUNExtractPowerLoras,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNExtractPowerLoras": "AUN Extract Power LoRAs",
}
