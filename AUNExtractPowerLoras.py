import os as _os_mod
import re
from typing import Dict, List, Tuple

from .logger import logger
from .model_utils import (
    get_lora_short_name as get_lora_short_name_common,
    LORA_SHORT_NAMES,
)

class AUNExtractPowerLoras:
    """
    Extract LoRA names (and strengths) from rgthree Power Lora Loader nodes in the graph/workflow.

    Outputs:
    - loras_token (STRING): Grouped token string, sanitized for filenames.
    - loras_names (STRING): Delimiter-joined short names with strengths, no parentheses.
    - loras_list (STRING): Newline-separated base names (file stem, no extension) including labeled strengths when available, one per line.

    """

    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "Extract LoRA names (and strengths) from rgthree Power Lora Loader nodes in the graph/workflow. Outputs: - loras_token (STRING): Grouped token string, sanitized for filenames. - loras_names (STRING): Delimiter-joined short names with strengths, no parentheses. - loras_list (STRING): Newline-separated base names (file stem, no extension) including labeled strengths when available, one per line."
    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("loras_token", "loras_names", "loras_list")
    FUNCTION = "extract"

    # (Dictionaries now imported from .model_utils)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {                
                "loras_delimiter": ("STRING", {"default": ";", "tooltip": "Delimiter between LoRA entries in the token (e.g. '+', '-', '_', ',', ';')."}),
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

    @staticmethod
    def _extract_loras_from_inputs(inputs: dict) -> list[dict]:
        items = []
        try:
            # Handle rgthree's Power Lora Loader: lora_1, lora_2, etc. as dicts
            for key, val in inputs.items():
                k = str(key).lower()
                if k.startswith('lora_') and isinstance(val, dict):
                    if val.get('on', False) and 'lora' in val:
                        items.append({
                            'name': val.get('lora'),
                            'strength': val.get('strength', None),
                            'strengthTwo': val.get('strengthTwo', None),
                        })
            
            # Handle standard ComfyUI LoraLoader: lora_name, strength_model, strength_clip
            if not items:
                lora_name = inputs.get('lora_name')
                if lora_name and isinstance(lora_name, str):
                    items.append({
                        'name': lora_name,
                        'strength': inputs.get('strength_model'),
                        'strengthTwo': inputs.get('strength_clip'),
                    })
        except Exception:
            pass
        return items

    @staticmethod
    def _extract_loras(prompt: Dict | None = None, extra_pnginfo: Dict | None = None) -> list[dict]:
        target_names = {
            "Power Lora Loader (rgthree)",
            "RgthreePowerLoraLoader",
            "Power Lora Loader",
            "LoraLoader",
            "LoraLoaderModelOnly",
        }
        all_items: list[dict] = []
        seen: set[tuple] = set()

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

    @staticmethod
    def _build_loras(entries: list[str], delim: str) -> str:
        if not entries:
            return ""
        # sanitize delimiter to be filename-safe and simple
        delim = delim if isinstance(delim, str) and delim != "" else "+"
        if any(c for c in delim if c not in "+-_. ,;"):
            delim = "+"
        joined = delim.join(entries)
        return f"(LORAS-{joined})"

    def extract(self, loras_delimiter: str, prompt=None, extra_pnginfo=None):
        items = AUNExtractPowerLoras._extract_loras(prompt, extra_pnginfo)

        def fmt_strength(v):
            try:
                if v is None:
                    return None
                s = f"{float(v):.2f}".rstrip('0').rstrip('.')
                return s
            except Exception:
                return None

        entries = []
        names_only = []
        names_with_strengths = []
        lines = []
        raw_names = []
        for it in items:
            raw = it.get('name')
            if not raw:
                continue
            raw_names.append(str(raw))
            base_name_only = _os_mod.path.splitext(_os_mod.path.basename(raw))[0]
            base = get_lora_short_name_common(raw)
            sm = it.get('strength')
            sc = it.get('strengthTwo') or it.get('strength_clip')
            sm_s = fmt_strength(sm)
            sc_s = fmt_strength(sc)

            if sm_s and sc_s and sm_s != sc_s:
                    token = f"{base}@{sm_s}-{sc_s}"
            elif sm_s:
                    token = f"{base}@{sm_s}"
            else:
                    token = base

            # loras_names: always include strengths with short name using @
            if sm_s and sc_s and sm_s != sc_s:
                name_ws = f"{base}@{sm_s}-{sc_s}"
            elif sm_s:
                name_ws = f"{base}@{sm_s}"
            else:
                name_ws = base

            # List should be base names and include labeled strengths when available
            if sm_s and sc_s and sm_s != sc_s:
                line = f"{base_name_only} (model strength {sm_s}, clip strength {sc_s})"
            elif sm_s:
                line = f"{base_name_only} (model strength {sm_s})"
            else:
                line = base_name_only
            if base:
                entries.append(token)
                names_only.append(base)
                names_with_strengths.append(name_ws)
                lines.append(line)

        try:
            logger.info(f"AUNExtractPowerLoras: raw={raw_names} entries={entries}")
        except Exception:
            pass

        # Reuse the same delimiter safety as in token build
        safe_delim = loras_delimiter if isinstance(loras_delimiter, str) and loras_delimiter != "" else "+"
        if any(c for c in safe_delim if c not in "+-_. ,;"):
            safe_delim = "+"

        token = AUNExtractPowerLoras._build_loras(entries, safe_delim)
        names_str = safe_delim.join(names_with_strengths) if names_with_strengths else ""
        list_text = "\n".join(lines) if lines else ""
        return (token, names_str, list_text)


NODE_CLASS_MAPPINGS = {
    "AUNExtractPowerLoras": AUNExtractPowerLoras,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNExtractPowerLoras": "AUN Extract Power LoRAs",
}
