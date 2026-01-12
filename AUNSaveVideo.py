import os
import sys
from pathlib import Path
import builtins

import folder_paths
from .logger import logger
from .misc import *
from .utilsj import *

import copy
import json
import math
import random
import re
import shutil
import subprocess
import torch

try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover
    cv2 = None

try:
    import piexif  # type: ignore
    import piexif.helper  # type: ignore
except Exception:  # pragma: no cover
    piexif = None

from .model_utils import (
    get_short_name as get_model_short_name_common,
    get_lora_short_name as get_lora_short_name_common,
    get_sampler_short_name,
    get_scheduler_short_name,
    MODEL_SHORT_NAMES,
    SAMPLER_SHORT_NAMES,
    SCHEDULER_SHORT_NAMES,
    LORA_SHORT_NAMES,
)

import numpy as np

import comfy.sd
from nodes import SaveImage
from comfy.utils import common_upscale

from PIL import Image, ImageSequence
from PIL.PngImagePlugin import PngInfo
from typing import Dict, List
import time
import os as _os_mod
from uuid import uuid4

FFMPEG_PATH = shutil.which("ffmpeg")
if FFMPEG_PATH is None:
    logger.info("ffmpeg could not be found. Using ffmpeg from imageio-ffmpeg.")
    try:
        from imageio_ffmpeg import get_ffmpeg_exe  # type: ignore

        try:
            FFMPEG_PATH = get_ffmpeg_exe()
        except Exception:
            logger.warning("ffmpeg could not be found. Outputs that require it have been disabled")
    except Exception:
        logger.warning(
            "imageio-ffmpeg is not installed and ffmpeg is not on PATH. Outputs that require it have been disabled"
        )

class AUNSaveVideo():
    '''
    Based on work done by Kosinkadink as a part of the Video Helper Suite.
    '''
    @classmethod
    def INPUT_TYPES(cls):
        # Get the list of filenames (including .json files) in the directory
        file_names = os.listdir(VIDEO_FORMATS_DIRECTORY)

        # Filter out only the JSON files (those ending with .json)
        json_files = [filename for filename in file_names if filename.endswith(".json")]

        # Generate the video format names by removing ".json" and prefixing with "video/"
        video_formats = ["video/" + filename[:-5] for filename in json_files]

        return {
            "required": {
                "images": ("IMAGE", {"tooltip": "Image frames to encode (batch)."}),
                "frame_rate": ("INT", {"default": 8, "min": 1, "step": 1, "tooltip": "Frames per second. For animated images sets frame delay; for videos sets FPS."},),
                "loop_count": ("INT", {"default": 0, "min": 0, "max": 100, "step": 1, "tooltip": "Animated images only (GIF/APNG/WebP). 0 = loop forever; N = repeat N times. Ignored for video outputs."}),
                "filename_format": ("STRING", {"default": "Comfy", "tooltip": "Output name template. Supports tokens: %seed%, %steps%, %cfg%, %model%, %model_short%, %sampler_name%, %scheduler%, %loras%. Missing values become empty. Example: Comfy_%model_short%_s%steps%_c%cfg%_seed%seed%_%loras%"}),
                "output_format": (["image/gif", "image/webp", "image/apng"] + video_formats, {"tooltip": "Choose animated image or video. Video/* entries come from format JSONs. WebM uses VP9; some inputs may be re-encoded for compatibility."}),
                "save_to_output_dir": ("BOOLEAN", {"default": True, "tooltip": "Save to the ComfyUI output directory when true; otherwise to the temp directory. Affects preview location type."}),
                "quality": ("INT", {"default": 95, "min": 0, "max": 100, "step": 1, "tooltip": "0–100. Higher is better (larger files). Mapped to each format; for videos, translated to encoder quality."}),
                "save_metadata": ("BOOLEAN", {"default": True, "tooltip": "Embed node metadata into the file (GIF comment / APNG pnginfo / WebP EXIF / video comment)."}),
                "save_workflow": ("BOOLEAN", {"default": True, "tooltip": "Include the full workflow JSON in embedded metadata for reproducibility."}),
                "batch_size": ("INT", {"default": 128, "min": 32, "step": 1, "tooltip": "Video outputs only. Frames per interim segment before concat: lower = less memory; higher = fewer segments/faster concat. No effect for GIF/APNG/WebP."}),
            },
            "optional": {
                "audio_options": ("AUDIO_INPUT_OPTIONS", {"tooltip": "Optional. Add an audio track (and trimming). Applies to video outputs only."}),
                "seed_value": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "Used if %seed% appears. Inserts 'seed-<value>' (0 is valid). Remove %seed% from filename to omit."}),
                "steps_value": ("INT", {"default": 0, "min": 0, "tooltip": "Used if %steps% appears. Inserts 'steps-<value>' when > 0; empty when 0."}),
                "cfg_value": ("FLOAT", {"default": 0.0, "min": 0.0, "tooltip": "Used if %cfg% appears. Inserts 'cfg-<value>' when > 0 (compact formatting); empty when 0."}),
                "model_name": ("STRING", {"default": "", "multiline": False, "tooltip": "Used if %model% appears. Value is sanitized for filenames (no slashes/specials)."}),
                "sampler_name_value": ("STRING", {"default": "", "multiline": False, "tooltip": "Used if %sampler_name% appears. Sanitized; empty leaves nothing."}),
                "scheduler_value": ("STRING", {"default": "", "multiline": False, "tooltip": "Used if %scheduler% appears. Sanitized; empty leaves nothing."}),
                # Short/manual model name for %model_short%; otherwise auto-shortened
                "short_manual_model_name": ("STRING", {"default": "", "multiline": False, "tooltip": "Optional short/manual name for %model_short%. Leave empty to auto-generate a short name from the model."}),
                # LoRA controls
                # LoRAs now controlled from path node via %loras% token; no direct list inputs here.
                "loras_delimiter": ("STRING", {"default": "+", "tooltip": "Delimiter between LoRA entries in %loras%. Allowed: + - _ . space , ;"}),
                # Sidecar export option (mirrors AUNSaveImage)
                "sidecar_format": ([
                    "Output only (text)",
                    "Output only (json)",
                    "Save to file (text)",
                    "Save to file (json)",
                ], {"default": "Output only (text)", "tooltip": "Choose how to export sidecar info: Output only (text/json) returns it via node output; Save to file (text/json) also writes a .txt/.json next to the video."}),
                
            },
            "hidden": {
                "extra_pnginfo": "EXTRA_PNGINFO",
                "prompt": "PROMPT",
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("images", "sidecar_text")
    OUTPUT_NODE = True
    FUNCTION = "combine_video"
    CATEGORY = "AUN Nodes/Video"
    DESCRIPTION = (
    "Combine image frames into an animated image or video. Supports filename tokens: %seed%, %steps%, %cfg%, %model%, %model_short%, %sampler_name%, %scheduler%, %loras%."
    "Empty inputs yield empty replacements."
    "Example: %model_short%_steps-%steps%_cfg-%cfg%_seed-%seed%_%loras%."
    )

    @staticmethod
    def _extract_text_prompts(prompt: Dict | None = None, extra_pnginfo: Dict | None = None) -> tuple[str, str]:
        """Extract positive/negative prompts by following actual connections to CLIPTextEncode nodes.

        Strategy:
        1) Use the live prompt graph (preferred) to find a KSampler-like node. Trace its 'positive'/'negative' inputs
           upstream until reaching a CLIPTextEncode* node, then resolve its 'text' input recursively.
        2) Fallback to workflow graph: find KSampler UI node and its connected CLIPTextEncode UI nodes; try to use
           their widgets_values (first string) as the text.
        """
        def to_key(x):
            try:
                return str(int(x))
            except Exception:
                return str(x)

        prompt_nodes: Dict[str, Dict] = {}
        if isinstance(prompt, dict):
            for k, v in prompt.items():
                if isinstance(v, dict):
                    prompt_nodes[to_key(k)] = v

        wf_nodes_by_id: Dict[str, Dict] = {}
        wf = None
        if isinstance(extra_pnginfo, dict):
            wf = extra_pnginfo.get('workflow')
        if wf and isinstance(wf, dict) and isinstance(wf.get('nodes'), list):
            for n in wf['nodes']:
                nid = to_key(n.get('id'))
                wf_nodes_by_id[nid] = n

        def resolve_single_chain(node_id: str, depth: int = 0) -> str:
            """Resolve a single upstream chain to a string (avoid combining multiple parts)."""
            if depth > 8:
                return ""
            node = prompt_nodes.get(to_key(node_id))
            if not isinstance(node, dict):
                # Fallback to workflow-side widgets
                wf_node = wf_nodes_by_id.get(to_key(node_id))
                if isinstance(wf_node, dict):
                    wv = wf_node.get('widgets_values')
                    if isinstance(wv, list) and wv and isinstance(wv[0], str):
                        return wv[0]
                return ""
            ctype = str(node.get('class_type') or '')
            inps = node.get('inputs', {}) or {}
            # Special handling for AUNTextIndexSwitch: honor selected index to pick textN
            if 'AUNTextIndexSwitch' in ctype:
                def _to_int(v):
                    try:
                        if isinstance(v, bool):
                            return None
                        if isinstance(v, int):
                            return v
                        if isinstance(v, str) and v.strip().isdigit():
                            return int(v.strip())
                        if isinstance(v, (list, tuple)) and v:
                            # resolve upstream and try to parse
                            s = resolve_single_chain(v[0], depth + 1)
                            return int(s) if s and str(s).strip().isdigit() else None
                    except Exception:
                        return None
                    return None
                idx = _to_int(inps.get('index')) or 1
                if idx < 1:
                    idx = 1
                if idx > 10:
                    idx = 10
                sel_key = f'text{idx}'
                if sel_key in inps:
                    val = inps.get(sel_key)
                    if isinstance(val, str):
                        return val
                    if isinstance(val, (list, tuple)) and val:
                        return resolve_single_chain(val[0], depth + 1)
                # Fallback: first non-empty among text1..text10
                for i in range(1, 11):
                    k = f'text{i}'
                    if k in inps:
                        v = inps.get(k)
                        if isinstance(v, str) and v:
                            return v
                        if isinstance(v, (list, tuple)) and v:
                            s = resolve_single_chain(v[0], depth + 1)
                            if s:
                                return s
            # Prefer a single direct text/string/value if present
            for key in ('text', 'text_g', 'text_l', 'text2', 'string', 'value', 'prompt'):
                val = inps.get(key)
                if isinstance(val, str) and val:
                    return val
                if isinstance(val, (list, tuple)) and val:
                    return resolve_single_chain(val[0], depth + 1)
            # Otherwise, try common positional-like keys one at a time
            for key in (
                'a', 'b', 'c', 'd', 'prefix', 'suffix', 'pre', 'post', 'left', 'right', 'middle',
                'text1', 'text2', 'text3', 'text4', 'text5', 'text6', 'text7', 'text8', 'text9', 'text10'
            ):
                val = inps.get(key)
                if isinstance(val, str) and val:
                    return val
                if isinstance(val, (list, tuple)) and val:
                    return resolve_single_chain(val[0], depth + 1)
            # As a last resort, follow the first connection-like input
            for val in inps.values():
                if isinstance(val, (list, tuple)) and val:
                    return resolve_single_chain(val[0], depth + 1)
                if isinstance(val, str) and val:
                    return val
            # Workflow fallback
            wf_node = wf_nodes_by_id.get(to_key(node_id))
            if isinstance(wf_node, dict):
                wv = wf_node.get('widgets_values')
                if isinstance(wv, list) and wv and isinstance(wv[0], str):
                    return wv[0]
            return ""

        def resolve_text_from_any_node(node_id: str, depth: int = 0) -> str:
            if depth > 8:
                return ""
            node = prompt_nodes.get(to_key(node_id))
            if not isinstance(node, dict):
                # Fallback to workflow widgets
                wf_node = wf_nodes_by_id.get(to_key(node_id))
                if isinstance(wf_node, dict):
                    wv = wf_node.get('widgets_values')
                    if isinstance(wv, list) and wv:
                        cand = [w for w in wv if isinstance(w, str) and w]
                        if cand:
                            return " ".join(cand)
                return ""
            ctype = str(node.get('class_type') or '')
            inps = node.get('inputs', {}) or {}
            # Special handling for AUNTextIndexSwitch in "any" mode: still pick selected index
            if 'AUNTextIndexSwitch' in ctype:
                def _to_int(v):
                    try:
                        if isinstance(v, bool):
                            return None
                        if isinstance(v, int):
                            return v
                        if isinstance(v, str) and v.strip().isdigit():
                            return int(v.strip())
                        if isinstance(v, (list, tuple)) and v:
                            s = resolve_single_chain(v[0], depth + 1)
                            return int(s) if s and str(s).strip().isdigit() else None
                    except Exception:
                        return None
                    return None
                idx = _to_int(inps.get('index')) or 1
                idx = max(1, min(10, idx))
                sel_key = f'text{idx}'
                if sel_key in inps:
                    val = inps.get(sel_key)
                    if isinstance(val, str) and val:
                        return val
                    if isinstance(val, (list, tuple)) and val:
                        s = resolve_text_from_any_node(val[0], depth + 1)
                        if s:
                            return s
                # Try first non-empty among text1..text10
                for i in range(1, 11):
                    k = f'text{i}'
                    if k in inps:
                        v = inps.get(k)
                        if isinstance(v, str) and v:
                            return v
                        if isinstance(v, (list, tuple)) and v:
                            s = resolve_text_from_any_node(v[0], depth + 1)
                            if s:
                                return s
            # Helper to resolve arbitrary value (string or connection or list of connections)
            def _resolve_val(v):
                if isinstance(v, str):
                    return v
                if isinstance(v, (list, tuple)) and v:
                    # List of pairs or single pair
                    if all(isinstance(it, (list, tuple)) for it in v):
                        parts = []
                        for it in v:
                            if it:
                                parts.append(resolve_text_from_any_node(it[0], depth + 1))
                        return " ".join([p for p in parts if p])
                    else:
                        return resolve_text_from_any_node(v[0], depth + 1)
                return ""

            # Preferred keys for text, include SDXL variants
            preferred_keys = (
                'text', 'text_g', 'text_l', 'text2', 'string', 'value',
                'a', 'b', 'c', 'd', 'prefix', 'suffix', 'pre', 'post',
                'left', 'right', 'middle', 'text1', 'text2', 'text3', 'text4', 'text5', 'text6', 'text7', 'text8', 'text9', 'text10',
                'prompt', 'negative'
            )
            pieces = []
            for key in preferred_keys:
                if key in inps:
                    val = inps.get(key)
                    s = _resolve_val(val)
                    if s:
                        pieces.append(s)

            # Nodes that accept a list of strings/connections
            for list_key in ('strings', 'list', 'items', 'parts'):
                val = inps.get(list_key)
                if isinstance(val, (list, tuple)) and val:
                    parts = []
                    for it in val:
                        parts.append(_resolve_val(it))
                    parts = [p for p in parts if p]
                    if parts:
                        pieces.append(" ".join(parts))

            if pieces:
                delim = inps.get('delimiter') or inps.get('sep') or inps.get('joiner') or ' '
                try:
                    delim = str(delim)
                except Exception:
                    delim = ' '
                return delim.join([p for p in pieces if p])

            # As a last resort, scan any inputs
            for val in inps.values():
                s = _resolve_val(val)
                if s:
                    return s
            # Workflow fallback
            wf_node = wf_nodes_by_id.get(to_key(node_id))
            if isinstance(wf_node, dict):
                wv = wf_node.get('widgets_values')
                if isinstance(wv, list) and wv:
                    cand = [w for w in wv if isinstance(w, str) and w]
                    if cand:
                        return " ".join(cand)
            return ""

        def trace_to_encoder_text(node_ref, target_branch: str = 'positive') -> str:
            # node_ref is either a node id (str/int) or a [node_id, output] connection
            # Perform a DFS through upstream connections to find a CLIPTextEncode node
            def _normalize_ref(ref):
                if isinstance(ref, (list, tuple)) and ref:
                    return to_key(ref[0])
                return to_key(ref)

            target_id = _normalize_ref(node_ref)
            visited: set[str] = set()

            def dfs(cur_id: str, depth: int = 0) -> str:
                if depth > 16 or not cur_id or cur_id in visited:
                    return ""
                visited.add(cur_id)
                n = prompt_nodes.get(cur_id)
                if not isinstance(n, dict):
                    # Try workflow-side encoder widgets directly
                    wfn = wf_nodes_by_id.get(cur_id)
                    if isinstance(wfn, dict) and 'CLIPTextEncode' in str(wfn.get('type')):
                        wv = wfn.get('widgets_values')
                        if isinstance(wv, list) and wv and isinstance(wv[0], str):
                            return wv[0]
                    return ""
                ctype = str(n.get('class_type') or '')
                if 'CLIPTextEncode' in ctype:
                    # Handle SDXL dual-text encoders by combining global/local when present
                    enc_inps = n.get('inputs', {}) or {}
                    parts: list[str] = []
                    for key in ('text_g', 'text_l', 'text', 'text2'):
                        val = enc_inps.get(key)
                        if isinstance(val, str) and val:
                            parts.append(val)
                        elif isinstance(val, (list, tuple)) and val:
                            parts.append(resolve_single_chain(val[0]))
                    parts = [p for p in parts if isinstance(p, str) and p]
                    if parts:
                        # Join SDXL global/local (and extras) with comma for readability
                        return ", ".join(parts)
                    # Workflow fallback
                    wfn = wf_nodes_by_id.get(cur_id)
                    if isinstance(wfn, dict):
                        wv = wfn.get('widgets_values')
                        if isinstance(wv, list) and wv:
                            # Some encoders expose two text widgets (SDXL): combine first two strings
                            strings = [w for w in wv if isinstance(w, str) and w]
                            if strings:
                                return ", ".join(strings[:2]) if len(strings) > 1 else strings[0]
                    return ""
                # Explore upstream connections for any path to an encoder
                inps = n.get('inputs', {}) or {}
                # Prioritized keys commonly carrying conditioning/clip, with branch-aware ordering
                base_priority = (
                    'conditioning', 'input', 'samples', 'clip', 'text',
                    'cond', 'c', 'cn', 'clip_g', 'clip_l', 'clip_vision'
                )
                tb = 'positive' if str(target_branch).lower().startswith('pos') else 'negative'
                opposite = 'negative' if tb == 'positive' else 'positive'
                priority = (tb,) + base_priority + (opposite,)
                # Build a list of upstream refs to try (prioritized first, then the rest)
                ordered_keys = list(priority) + [k for k in inps.keys() if k not in priority]
                for key in ordered_keys:
                    val = inps.get(key)
                    if isinstance(val, (list, tuple)) and val:
                        # Could be a single pair or list of pairs
                        if all(isinstance(it, (list, tuple)) for it in val):
                            for it in val:
                                nxt = _normalize_ref(it)
                                res = dfs(nxt, depth + 1)
                                if res:
                                    return res
                        else:
                            nxt = _normalize_ref(val)
                            res = dfs(nxt, depth + 1)
                            if res:
                                return res
                return ""

            return dfs(target_id, 0)

        pos = ""
        neg = ""
        try:
            # Prefer live prompt: find a KSampler-like node
            for nid, n in prompt_nodes.items():
                ctype = str(n.get('class_type') or '')
                if 'KSampler' in ctype:
                    inps = n.get('inputs', {}) or {}
                    pos_ref = inps.get('positive')
                    neg_ref = inps.get('negative')
                    if pos_ref is not None and not pos:
                        pos = trace_to_encoder_text(pos_ref, 'positive') or pos
                    if neg_ref is not None and not neg:
                        neg = trace_to_encoder_text(neg_ref, 'negative') or neg
                    if pos or neg:
                        break
            # Fallback to workflow UI graph
            if (not pos or not neg) and wf_nodes_by_id:
                # Small DFS on the UI graph to reach a CLIPTextEncode* node and read widgets
                def ui_follow_to_encoder_text(start_ref) -> str:
                    # start_ref may be list/dict variant as saved in workflow JSON
                    def _get_id(r):
                        if isinstance(r, dict) and 'node' in r:
                            return to_key(r.get('node'))
                        if isinstance(r, (list, tuple)) and r:
                            return to_key(r[0])
                        return to_key(r)
                    visited_ui: set[str] = set()
                    stack: list[str] = []
                    sid = _get_id(start_ref)
                    if not sid:
                        return ""
                    stack.append(sid)
                    while stack:
                        cur = stack.pop()
                        if cur in visited_ui:
                            continue
                        visited_ui.add(cur)
                        wn = wf_nodes_by_id.get(cur)
                        if not isinstance(wn, dict):
                            continue
                        wtype = str(wn.get('type') or '')
                        if 'CLIPTextEncode' in wtype:
                            wv = wn.get('widgets_values')
                            if isinstance(wv, list) and wv:
                                strings = [w for w in wv if isinstance(w, str) and w]
                                if strings:
                                    return ", ".join(strings[:2]) if len(strings) > 1 else strings[0]
                            return ""
                        # Otherwise push upstream references
                        inps = wn.get('inputs') or {}
                        for val in inps.values():
                            if isinstance(val, list) and val:
                                # Could be list of refs
                                if all(isinstance(x, (list, tuple, dict)) for x in val):
                                    for it in val:
                                        nid = _get_id(it)
                                        if nid and nid not in visited_ui:
                                            stack.append(nid)
                                else:
                                    nid = _get_id(val)
                                    if nid and nid not in visited_ui:
                                        stack.append(nid)
                            elif isinstance(val, (tuple, dict)):
                                nid = _get_id(val)
                                if nid and nid not in visited_ui:
                                    stack.append(nid)
                    return ""

                for nid, node in wf_nodes_by_id.items():
                    ntype = str(node.get('type') or '')
                    if 'KSampler' in ntype:
                        inputs = node.get('inputs') or {}
                        for k in ('positive', 'negative'):
                            ref = inputs.get(k)
                            if not ref:
                                continue
                            text_found = ui_follow_to_encoder_text(ref)
                            if k == 'positive' and not pos and text_found:
                                pos = text_found
                            elif k == 'negative' and not neg and text_found:
                                neg = text_found
                        if pos or neg:
                            break
        except Exception:
            pass
        return pos or "", neg or ""

    @staticmethod
    def _sanitize_token_str(value: str) -> str:
        """Sanitize token replacement values so they produce safe filenames."""
        if value is None:
            return ""
        # Convert to string and normalize whitespace
        s = str(value).strip()
        # Replace path separators and spaces; keep only the basename-like tail
        s = s.replace("\\", "/").split("/")[-1]
        # Normalize whitespace to underscores
        s = re.sub(r"\s+", "_", s)
        # Keep alphanum, dash, underscore, dot, plus, parentheses, comma, semicolon, and '@' (for LoRA strengths)
        s = re.sub(r"[^A-Za-z0-9._(),;+\-@]", "", s)
        # Collapse long runs of underscores/dashes
        s = re.sub(r"[_\-]{3,}", "--", s)
        # Do not truncate; filenames may legitimately include long %loras lists
        return s

    @staticmethod
    def _remove_dir_with_retry(path: str, attempts: int = 40, delay_sec: float = 0.25) -> bool:
        """Best-effort removal of a directory tree, retrying to sidestep Windows locks."""
        if not path:
            return True
        for _ in range(max(1, attempts)):
            if not os.path.exists(path):
                return True
            try:
                shutil.rmtree(path)
                return True
            except FileNotFoundError:
                return True
            except PermissionError:
                time.sleep(delay_sec)
            except OSError:
                time.sleep(delay_sec)
        try:
            shutil.rmtree(path, ignore_errors=True)
        except Exception:
            pass
        return not os.path.exists(path)

    # --- Short-name maps (mirroring AUNSaveImage) ---
    # (Dictionaries now imported from .model_utils)

    # --- Helpers for short names ---

    # --- LoRA helpers ---

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

        # Map node IDs to their mode from workflow
        node_modes = {}
        wf = None
        if isinstance(extra_pnginfo, dict):
            wf = extra_pnginfo.get('workflow')
        if wf and isinstance(wf, dict) and isinstance(wf.get('nodes'), list):
            for node in wf['nodes']:
                nid = str(node.get('id'))
                node_modes[nid] = node.get('mode', 0)

        # 1) Collect from prompt
        try:
            if isinstance(prompt, dict):
                for nid, node in prompt.items():
                    # Check if bypassed in workflow
                    if node_modes.get(str(nid)) == 2: # 2 is bypassed
                        continue

                    ctype = node.get('class_type') if isinstance(node, dict) else None
                    if ctype and ctype in target_names:
                        items = AUNSaveVideo._extract_loras_from_inputs(node.get('inputs', {}))
                        for it in items or []:
                            key = (it.get('name'), it.get('strength'), it.get('strengthTwo') or it.get('strength_clip'))
                            if key not in seen:
                                seen.add(key)
                                all_items.append(it)
        except Exception:
            pass
        # 2) Collect from extra_pnginfo workflow
        try:
            if wf and isinstance(wf, dict) and isinstance(wf.get('nodes'), list):
                for node in wf['nodes']:
                    # Check if bypassed
                    if node.get('mode', 0) == 2:
                        continue

                    ntype = node.get('type') or node.get('class_type')
                    if ntype and ntype in target_names:
                        items = AUNSaveVideo._extract_loras_from_inputs(node.get('inputs', {}))
                        for it in items or []:
                            key = (it.get('name'), it.get('strength'), it.get('strengthTwo') or it.get('strength_clip'))
                            if key not in seen:
                                seen.add(key)
                                all_items.append(it)
        except Exception:
            pass
        return all_items

    @staticmethod
    def _build_loras_token(prompt, extra_pnginfo, mode: str, delimiter: str = "+") -> str:
        """Build the %loras% token text.

        - mode: 'full' includes @strengths, 'names' omits strengths, 'count' yields count marker.
        - delimiter: single-character joiner between entries. Allowed: + - _ . space , ;
        """
        items = AUNSaveVideo._extract_loras(prompt, extra_pnginfo)
        # sanitize delimiter: pick first allowed char or fallback to '+'
        allowed = set(['+', '-', '_', '.', ' ', ',', ';'])
        d = '+'
        if isinstance(delimiter, str) and len(delimiter) > 0:
            # Use first char that is allowed
            for ch in delimiter:
                if ch in allowed:
                    d = ch
                    break
        entries = []
        def fmt_strength(v):
            try:
                if v is None:
                    return None
                s = f"{float(v):.2f}".rstrip('0').rstrip('.')
                return s
            except Exception:
                return None
        raw_names = []
        for it in items:
            raw = it.get('name')
            if not raw:
                continue
            raw_names.append(str(raw))
            base = get_lora_short_name_common(raw)
            sm = it.get('strength')
            sc = it.get('strengthTwo') or it.get('strength_clip')
            sm_s = fmt_strength(sm)
            sc_s = fmt_strength(sc)
            if mode == 'names':
                token = base
            elif mode == 'full':
                if sm_s and sc_s and sm_s != sc_s:
                    token = f"{base}@{sm_s}-{sc_s}"
                elif sm_s:
                    token = f"{base}@{sm_s}"
                else:
                    token = base
            else:
                token = base
            if base:
                entries.append(token)
        if not entries:
            return ""
        if mode == 'count':
            return f"(LORAS-{len(entries)})"
        joined = d.join(entries)
        return f"(LORAS-{joined})"

    @staticmethod
    def _cleanup_filename_core(value: str) -> str:
        """Minimal cleanup after token replacement: collapse multiple spaces and trim."""
        if not value:
            return value
        v = re.sub(r"\s{2,}", " ", value)
        return v.strip()

    @staticmethod
    def _ensure_optional_dependencies() -> None:
        # Keep the pack importable even without these installed; fail only when the node executes.
        if cv2 is None:
            raise RuntimeError(
                "AUN Save Video requires OpenCV (cv2). Install dependencies via ComfyUI-Manager (Install requirements) or run 'pip install -r custom_nodes/AUN/requirements.txt'."
            )
        if piexif is None:
            raise RuntimeError(
                "AUN Save Video requires piexif for metadata handling. Install dependencies via ComfyUI-Manager (Install requirements) or run 'pip install -r custom_nodes/AUN/requirements.txt'."
            )

    @staticmethod
    def determine_file_name(filename, full_output_folder, output_format, seed_value=0, steps_value=None, cfg_value=None, model_name=None, sampler_name_value=None, scheduler_value=None, short_manual_model_name: str = "", loras_value=None):

        format_type, format_ext_mime = output_format.split("/")
        format_ext = format_ext_mime

        for ext in ACCEPTED_IMAGE_AND_VIDEO_EXTENSIONS_COMPENDIUM:
            if ext in format_ext_mime:
                format_ext = ext 
                break
 
        file_path = os.path.join(full_output_folder, f"{filename}.{format_ext}")

        new_filename = filename

    # Removed timestamp/counter support: AUN nodes now avoid auto time/counter in filenames

        seed_token = "%seed%"
        if seed_token in new_filename:
            # 0 is a valid seed; only None means unset
            if seed_value is not None and isinstance(seed_value, int):
                repl = "seed-" + str(seed_value)
            else:
                repl = ""
            new_filename = new_filename.replace(seed_token, repl)
            file_path = os.path.join(full_output_folder, f"{new_filename}.{format_ext}")

        steps_token = "%steps%"
        if steps_token in new_filename:
            if steps_value is not None and isinstance(steps_value, int) and steps_value > 0:
                repl = "steps-" + str(steps_value)
            else:
                repl = ""
            new_filename = new_filename.replace(steps_token, repl)
            file_path = os.path.join(full_output_folder, f"{new_filename}.{format_ext}")

        cfg_token = "%cfg%"
        if cfg_token in new_filename:
            # Normalize cfg to trimmed value without trailing zeros where sensible
            if cfg_value is not None and isinstance(cfg_value, (int, float)) and float(cfg_value) > 0:
                cfg_str = ("%g" % cfg_value).rstrip()
                repl = "cfg-" + cfg_str
            else:
                repl = ""
            new_filename = new_filename.replace(cfg_token, repl)
            file_path = os.path.join(full_output_folder, f"{new_filename}.{format_ext}")

        model_token = "%model%"
        if model_token in new_filename:
            repl = AUNSaveVideo._sanitize_token_str(model_name) if model_name else ""
            new_filename = new_filename.replace(model_token, repl)
            file_path = os.path.join(full_output_folder, f"{new_filename}.{format_ext}")

        # Support %model_short%
        model_short_token = "%model_short%"
        if model_short_token in new_filename:
            # Order: explicit override -> auto-shortened from model
            if short_manual_model_name:
                short = short_manual_model_name
            else:
                short = get_model_short_name_common(model_name) if model_name else ""
            repl = AUNSaveVideo._sanitize_token_str(short)
            new_filename = new_filename.replace(model_short_token, repl)
            file_path = os.path.join(full_output_folder, f"{new_filename}.{format_ext}")

        sampler_token = "%sampler_name%"
        if sampler_token in new_filename:
            raw = sampler_name_value or ""
            short = get_sampler_short_name(raw)
            repl = AUNSaveVideo._sanitize_token_str(short)
            new_filename = new_filename.replace(sampler_token, repl)
            file_path = os.path.join(full_output_folder, f"{new_filename}.{format_ext}")

        scheduler_token = "%scheduler%"
        if scheduler_token in new_filename:
            raw = scheduler_value or ""
            short = get_scheduler_short_name(raw)
            repl = AUNSaveVideo._sanitize_token_str(short)
            new_filename = new_filename.replace(scheduler_token, repl)
            file_path = os.path.join(full_output_folder, f"{new_filename}.{format_ext}")

        loras_token = "%loras%"
        if loras_token in new_filename:
            repl = AUNSaveVideo._sanitize_token_str(loras_value) if loras_value else ""
            new_filename = new_filename.replace(loras_token, repl)
            file_path = os.path.join(full_output_folder, f"{new_filename}.{format_ext}")

        # Final tidy: remove extra spaces that may result from empty token replacements
        cleaned = AUNSaveVideo._cleanup_filename_core(new_filename)
        if cleaned != new_filename:
            new_filename = cleaned
            file_path = os.path.join(full_output_folder, f"{new_filename}.{format_ext}")

    # No filename truncation in AUNSaveVideo to match AUNSaveImage behavior

        # Final safety: if file already exists, append an incrementing suffix
        if os.path.exists(file_path):
            base_name = new_filename
            i = 1
            while True:
                suffix = f"_{i:03}"
                candidate_name = f"{base_name}{suffix}"
                candidate_path = os.path.join(full_output_folder, f"{candidate_name}.{format_ext}")
                if not os.path.exists(candidate_path):
                    new_filename = candidate_name
                    file_path = candidate_path
                    break
                i += 1

        return file_path, format_type, format_ext_mime, format_ext

    def combine_video(
        self,
        images,
        frame_rate: int,
        loop_count: int,
        filename_format="Comfy",
        output_format="image/webp",
        save_to_output_dir=True,
        seed_value=0,
        steps_value=None,
        cfg_value=None,
        model_name=None,
        sampler_name_value=None,
        scheduler_value=None,
        short_manual_model_name: str = "",
        quality=95,
        save_metadata=True,
        save_workflow=True,
        batch_size=128,
        audio_options=None,
        extra_pnginfo=None,
        # New options
    # loras options removed; always auto-detect from workflow
    loras_delimiter="+",
    sidecar_format="none",
        prompt=None,
    ):

        AUNSaveVideo._ensure_optional_dependencies()

    # Autofill removed by user request: tokens remain empty when inputs are not provided

        # get output information
        output_dir = (
            folder_paths.get_output_directory()
            if save_to_output_dir
            else folder_paths.get_temp_directory()
        )
        (
            full_output_folder,
            filename,
            _,
            subfolder,
            _,
        ) = folder_paths.get_save_image_path(filename_format, output_dir)
                
        # Build %loras% token value (auto-detect from workflow; full mode) using selected delimiter
        loras_value = AUNSaveVideo._build_loras_token(
            prompt,
            extra_pnginfo,
            "full",
            loras_delimiter if isinstance(loras_delimiter, str) else "+",
        )

        file_path, format_type, format_ext_mime, format_ext = self.determine_file_name(
            filename, full_output_folder, output_format,
            seed_value, steps_value, cfg_value,
            model_name, sampler_name_value, scheduler_value,
            short_manual_model_name,
            loras_value=loras_value,
        )

        # Build raw LoRAs block for sidecar (Power Lora Loader style to match AUNSaveImageV2)
        try:
            _items = AUNSaveVideo._extract_loras(prompt, extra_pnginfo)
        except Exception:
            _items = []

        def _fmt_strength_display(value):
            try:
                if value is None:
                    return None
                return f"{float(value):.2f}"
            except Exception:
                return None

        _lora_power_lines: list[str] = []
        for _it in _items or []:
            _raw = _it.get('name')
            if not _raw:
                continue
            _base = _os_mod.path.splitext(_os_mod.path.basename(str(_raw)))[0]
            if not _base:
                continue
            _sm = _it.get('strength')
            _sc = _it.get('strengthTwo') or _it.get('strength_clip')
            _sm_disp = _fmt_strength_display(_sm)
            _sc_disp = _fmt_strength_display(_sc)
            _tag = f"<lora:{_base}"
            if _sm_disp:
                _tag += f":{_sm_disp}"
            if _sc_disp:
                _tag += f":{_sc_disp}"
            _tag += ">"
            _lora_power_lines.append(_tag)

        _loras_sidecar = ""
        if _lora_power_lines:
            _formatted = "\n".join(line.strip() for line in _lora_power_lines)
            _loras_sidecar = f"PowerLoraLoader loras:\n{_formatted}".strip()

        # Extract positive/negative prompts for sidecar
        _pos_prompt, _neg_prompt = AUNSaveVideo._extract_text_prompts(prompt, extra_pnginfo)

        # Strip LoRA tags from prompts for sidecar to avoid duplication
        _lora_pattern = re.compile(r"<lora:([^:>]+):([^:>]+)(?::([^:>]+))?>", re.IGNORECASE)
        if isinstance(_pos_prompt, str):
            _pos_prompt = re.sub(_lora_pattern, "", _pos_prompt)
            _pos_prompt = re.sub(r',\s*,', ',', _pos_prompt)
            _pos_prompt = re.sub(r'\s+', ' ', _pos_prompt).strip(' ,')
        if isinstance(_neg_prompt, str):
            _neg_prompt = re.sub(_lora_pattern, "", _neg_prompt)
            _neg_prompt = re.sub(r',\s*,', ',', _neg_prompt)
            _neg_prompt = re.sub(r'\s+', ' ', _neg_prompt).strip(' ,')

        # Build sidecar context (resolved later with final file path)
        # Compute sidecar model_short consistent with filename logic
        if model_name:
            if short_manual_model_name:
                _sidecar_model_short = str(short_manual_model_name)
            else:
                _sidecar_model_short = get_model_short_name_common(model_name)
        else:
            _sidecar_model_short = ""

        # Robustly infer width/height from the input tensor regardless of layout
        def _infer_dims_for_sidecar(imgs) -> tuple[int | None, int | None, int]:
            try:
                if imgs is None:
                    return None, None, 0
                # Support torch tensor batches or sequences
                first = imgs[0]
                if isinstance(first, torch.Tensor):
                    shp = tuple(first.shape)
                    if len(shp) == 3:
                        # BHWC frame -> (H,W,C) or NCHW frame -> (C,H,W)
                        if shp[-1] in (1, 3, 4):
                            h, w = shp[0], shp[1]
                        elif shp[0] in (1, 3, 4) and len(shp) == 3:
                            h, w = shp[1], shp[2]
                        else:
                            # Fallback best guess assuming HWC
                            h, w = shp[0], shp[1]
                        return int(w), int(h), len(imgs)
                # Numpy arrays or other sequences
                if hasattr(first, 'shape'):
                    shp = tuple(first.shape)
                    if len(shp) == 3:
                        if shp[-1] in (1, 3, 4):
                            h, w = shp[0], shp[1]
                        elif shp[0] in (1, 3, 4):
                            h, w = shp[1], shp[2]
                        else:
                            h, w = shp[0], shp[1]
                        return int(w), int(h), len(imgs)
            except Exception:
                pass
            return None, None, (len(images) if images is not None else 0)

        _w, _h, _cnt = _infer_dims_for_sidecar(images)

        # Match AUNSaveImage formatting for cfg (string with one decimal) and field ordering
        try:
            _cfg_str = f"{float(cfg_value):.1f}" if cfg_value is not None else ""
        except Exception:
            _cfg_str = str(cfg_value) if cfg_value is not None else ""

        # Do not include filename in context; append later like AUNSaveImage
        sidecar_ctx = {
            "extension": format_ext,
            "seed": seed_value,
            "steps": steps_value,
            "cfg": _cfg_str,
            "model": os.path.basename(model_name) if model_name else "",
            "model_short": _sidecar_model_short,
            # non-shortened values in sidecar
            "sampler_name": sampler_name_value or "",
            "scheduler": scheduler_value or "",
            "loras": _loras_sidecar,
            "positive_prompt": _pos_prompt,
            "negative_prompt": _neg_prompt,
            # Video-specific fields appended after image-common ones
            "frame_rate": frame_rate,
            "loop_count": loop_count,
            "quality": quality,
            "width": _w,
            "height": _h,
            "count": _cnt,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

        metadata = PngInfo()
        video_metadata = {}
        if extra_pnginfo is not None:
            for key in extra_pnginfo:
                if not save_workflow and key == "workflow":
                    continue
                
                value = json.dumps(extra_pnginfo[key])    
                metadata.add_text(key, value)
                video_metadata[key] = value
            
        if format_type == "image":
            
            frames = [tensor2pil(f)[0] for f in images]
            
            args = {
                "save_all": True,
                "append_images": frames[1:],
                "duration": round(1000 / frame_rate),
                "loop": loop_count,
                }
            
            # Add metadata to images
            if format_ext == "gif":
                if save_metadata:
                    args["comment"] = json.dumps(video_metadata, indent=2, sort_keys=True)                
                    
            elif format_ext == "apng":
                compress_level = quality // 11
                args["compress_level"] = compress_level
                if save_metadata:
                    args["pnginfo"] = metadata
                    
            elif format_ext == "webp":
                args["quality"] = quality
                args["minimize_size"] = False
                if save_metadata:
                    exif_bytes = piexif.dump({
                            "Exif":{
                                piexif.ExifIFD.UserComment:piexif.helper.UserComment.dump(json.dumps(video_metadata, indent=2, sort_keys=True), encoding="unicode")}})
                    args["exif"] = exif_bytes 
                    
            frames[0].save(file_path, **args)
        else:
            # Use ffmpeg to save a video
            if FFMPEG_PATH is None:
                #Should never be reachable
                raise ProcessLookupError("Could not find ffmpeg")

            video_format_path = os.path.join(VIDEO_FORMATS_DIRECTORY, format_ext_mime + ".json")
            with open(video_format_path, 'r') as stream:
                video_format = json.load(stream)
                if "extension" in video_format:
                    format_ext = video_format["extension"]
                    # If the final extension differs from what determine_file_name used, align and ensure uniqueness
                    base_name = get_clean_filename(file_path)
                    desired_path = os.path.join(full_output_folder, f"{base_name}.{format_ext}")
                    if desired_path != file_path:
                        file_path = desired_path
                    # Ensure we don't overwrite an existing file
                    if os.path.exists(file_path):
                        i = 1
                        while True:
                            suffix = f"_{i:03}"
                            candidate_path = os.path.join(full_output_folder, f"{base_name}{suffix}.{format_ext}")
                            if not os.path.exists(candidate_path):
                                file_path = candidate_path
                                break
                            i += 1
            # Normalize dimensions from input regardless of tensor layout
            def _infer_w_h(imgs) -> tuple[int, int, str]:
                # Returns (w, h, layout) where layout in {"BHWC","NCHW","HWC","CHW"}
                try:
                    f = imgs[0]
                    if isinstance(f, torch.Tensor):
                        shp = tuple(f.shape)
                        if len(shp) == 3:
                            if shp[-1] in (1, 3, 4):
                                return int(shp[1]), int(shp[0]), "HWC"
                            if shp[0] in (1, 3, 4):
                                return int(shp[2]), int(shp[1]), "CHW"
                    if hasattr(f, 'shape'):
                        shp = tuple(f.shape)
                        if len(shp) == 3:
                            if shp[-1] in (1, 3, 4):
                                return int(shp[1]), int(shp[0]), "HWC"
                            if shp[0] in (1, 3, 4):
                                return int(shp[2]), int(shp[1]), "CHW"
                except Exception:
                    pass
                # Fallback to previous heuristic
                return int(len(images[0][0])), int(len(images[0])), "HWC"

            _w, _h, _layout = _infer_w_h(images)
            dimensions = f"{_w}x{_h}"
            output_quality = map_to_range(quality, 0, 100, 50, 1) # ffmpeg quality maps from 50 (worst) to 1 (best)
            args = [
                FFMPEG_PATH, 
                "-v", "error", 
                "-f", "rawvideo", 
                "-pix_fmt", "rgb24", 
                '-loglevel', 'quiet',
                "-s", dimensions, 
                "-r", str(frame_rate), 
                "-i", "-", 
                "-crf", str(output_quality) 
                ] \
                + video_format['main_pass']

            env=os.environ.copy()
            if  "environment" in video_format:
                env.update(video_format["environment"])

            # Use ComfyUI's temp directory so leftovers get swept up automatically on restart
            temp_base = os.path.join(folder_paths.get_temp_directory(), "AUNSaveVideo")
            os.makedirs(temp_base, exist_ok=True)
            full_output_folder_temp = os.path.join(temp_base, f"run_{uuid4().hex}")
            os.makedirs(full_output_folder_temp, exist_ok=True)

            try:
                interim_file_paths = []
                total_passes = math.ceil(float(len(images)) / float(batch_size))
                total_passes_digit_count = len(str(total_passes))
                join_videos_instance = JoinVideosInDirectory()
                metadata_path = None
                for start in range(0, len(images), batch_size):

                    batch_count = len(interim_file_paths) + 1
                    logger.info(f"SaveVideo: Processing batch {str(batch_count).zfill(total_passes_digit_count)} of {total_passes}")

                    end = min(start + batch_size, len(images))
                    image_batch = images[start:end]

                    # Normalize to (N,H,W,3) uint8 for ffmpeg rgb24
                    def _to_bhwc_rgb_uint8(t: torch.Tensor) -> np.ndarray:
                        # Accept (N,H,W,C) or (N,C,H,W). Handle C in {1,3,4}.
                        if not isinstance(t, torch.Tensor):
                            # Assume numpy-like; just coerce and fix channels
                            arr = np.asarray(t)
                            if arr.ndim == 4 and arr.shape[-1] in (1, 3, 4):
                                pass
                            elif arr.ndim == 4 and arr.shape[1] in (1, 3, 4):
                                arr = np.transpose(arr, (0, 2, 3, 1))
                            else:
                                raise ValueError("Unsupported images array shape for video writing")
                            if arr.shape[-1] == 1:
                                arr = np.repeat(arr, 3, axis=-1)
                            elif arr.shape[-1] >= 3:
                                arr = arr[..., :3]
                            arr = (arr * 255.0).astype(np.uint8) if arr.dtype != np.uint8 else arr
                            return arr
                        x = t
                        # Ensure float range [0,1]
                        if x.dtype not in (torch.float16, torch.float32, torch.float64):
                            x = x.float()
                        # Detect layout
                        if x.dim() == 4 and x.shape[-1] in (1, 3, 4):
                            # (N,H,W,C)
                            bhwc = x
                        elif x.dim() == 4 and x.shape[1] in (1, 3, 4):
                            # (N,C,H,W) -> (N,H,W,C)
                            bhwc = x.permute(0, 2, 3, 1).contiguous()
                        else:
                            # Try to interpret as batch of HWC frames
                            raise ValueError(f"Unsupported image batch shape {tuple(x.shape)}; expected (N,H,W,C) or (N,C,H,W)")
                        # Ensure 3 channels
                        c = bhwc.shape[-1]
                        if c == 1:
                            bhwc = bhwc.repeat(1, 1, 1, 3)
                        elif c >= 3:
                            bhwc = bhwc[..., :3]
                        bhwc = bhwc.clamp(0, 1)
                        arr = (bhwc.detach().cpu().numpy() * 255.0 + 0.5).astype(np.uint8)
                        return arr

                    try:
                        image_batch = _to_bhwc_rgb_uint8(image_batch)
                    except Exception:
                        # As a last resort, try per-frame conversion
                        frames_np = []
                        for f in image_batch:
                            frames_np.append(_to_bhwc_rgb_uint8(f.unsqueeze(0))[0])
                        image_batch = np.stack(frames_np, axis=0)

                    interim_file_path = f"{full_output_folder_temp}/{get_clean_filename(file_path)}_{len(interim_file_paths)}.{format_ext}"
                    interim_file_paths.append(interim_file_path)

                    res = None
                    # images = images.tobytes()
                    if save_metadata:
                        os.makedirs(folder_paths.get_temp_directory(), exist_ok=True)
                        md = json.dumps(video_metadata)
                        metadata_path = os.path.join(folder_paths.get_temp_directory(), "metadata.txt")
                        # metadata from file should escape = ; # \\ and newline
                        md = md.replace("\\","\\\\")
                        md = md.replace(";","\\;")
                        md = md.replace("#","\\#")
                        md = md.replace("=","\\=")
                        md = md.replace("\n","\\\n")
                        md = md.replace(": NaN}", ": \"NaN\"}")
                        comment_line = "comment=" + md
                        workflow_line = None
                        if save_workflow and "workflow" in video_metadata:
                            wf = str(video_metadata.get("workflow", ""))
                            wf = wf.replace("\\","\\\\").replace(";","\\;").replace("#","\\#").replace("=","\\=").replace("\n","\\\n")
                            workflow_line = "workflow=" + wf
                        with open(metadata_path, "w") as f:
                            f.write(";FFMETADATA1\n")
                            f.write(comment_line + "\n")
                            if workflow_line:
                                f.write(workflow_line + "\n")

                        # For MP4/MOV containers, enable using metadata tags
                        mov_like = format_ext.lower() in ("mp4", "mov", "m4v", "ismv")
                        args_with_metadata = [
                            FFMPEG_PATH,
                            "-v", "error",
                            "-f", "rawvideo",
                            "-pix_fmt", "rgb24",
                            "-loglevel", "quiet",
                            "-s", dimensions,
                            "-r", str(frame_rate),
                            "-i", "-",
                            "-i", metadata_path,
                            "-crf", str(output_quality),
                        ] + video_format['main_pass'] + (["-movflags", "use_metadata_tags"] if mov_like else []) + [
                            "-map_metadata", "1",
                        ]
                        try:
                            res = subprocess.run(args_with_metadata + [interim_file_path], input=image_batch.tobytes(),
                                                capture_output=True, check=True, env=env)
                        except subprocess.CalledProcessError as e:
                            # Res was not set
                            print(e.stderr.decode("utf-8"), end="", file=sys.stderr)
                            logger.warn("An error occurred when saving with metadata")

                    if not res:
                        try:
                            res = subprocess.run(args + [interim_file_path], input=image_batch.tobytes(),
                                                capture_output=True, check=True, env=env)
                        except subprocess.CalledProcessError as e:
                            raise Exception("An error occured in the ffmpeg subprocess:\n" \
                                    + e.stderr.decode("utf-8"))
                    if res.stderr:
                        print(res.stderr.decode("utf-8"), end="", file=sys.stderr)

                use_mov_flags = format_ext.lower() in ("mp4", "mov", "m4v", "ismv")
                join_videos_instance.join_videos_in_directory(full_output_folder_temp, file_path, audio_options, True, metadata_path, use_mov_flags)
            finally:
                removed = AUNSaveVideo._remove_dir_with_retry(full_output_folder_temp)
                if not removed and os.path.exists(full_output_folder_temp):
                    logger.warning(f"AUNSaveVideo: Failed to remove temp directory {full_output_folder_temp}")

        # Build previews for UI
        previews = [
            {
                "filename": f"{get_clean_filename(file_path)}.{format_ext}",
                "subfolder": subfolder,
                "type": "output" if save_to_output_dir else "temp",
                "format": output_format,
            }
        ]

        # Normalize sidecar selection to a format and whether to save-to-file
        def _normalize_sidecar(choice: str) -> tuple[str, bool]:
            """Map UI selection or legacy values to (format, save_to_file).

            - format: "text" or "json"
            - save_to_file: True to also write a sidecar file next to the output

            Backward compatible with legacy values from older workflows.
            """
            s = str(choice or "").strip().lower()
            if not s or s in {"none", "off", "no"}:
                # Legacy "none" behaved like output-only text
                return ("text", False)

            # New explicit modes
            if "output" in s and "json" in s:
                return ("json", False)
            if "output" in s and "text" in s:
                return ("text", False)
            if ("save" in s or "file" in s) and "json" in s:
                return ("json", True)
            if ("save" in s or "file" in s) and "text" in s:
                return ("text", True)

            # Legacy synonyms
            text_saves = {
                "text", "txt", "text (save)", "txt (save)",
                "text save", "text save to file", "text save to file (txt)",
                "save to file (txt)", "save to file txt", "save txt",
            }
            json_saves = {
                "json", "jsn", "json (save)",
                "json save", "json save to file", "json save to file (json)",
                "save to file (json)", "save to file json", "save json",
            }
            if s in json_saves:
                return ("json", True)
            if s in text_saves:
                return ("text", True)

            # Fallback: default to output-only text
            return ("text", False)

        def _format_sidecar(rec: dict, fmt: str) -> str:
            if (fmt or "text").lower() == "json":
                try:
                    return json.dumps(rec, ensure_ascii=False, indent=2)
                except Exception:
                    return json.dumps(rec, ensure_ascii=False)
            # text formatting (mirror AUNSaveImage)
            lines = []
            for k, v in rec.items():
                try:
                    vv = json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v
                except Exception:
                    vv = v
                lines.append(f"{k}: {vv}")
            return "\n".join(lines)

        # Build the record and sidecar text always
        record = dict(sidecar_ctx)
        record.update({
            "filename": f"{get_clean_filename(file_path)}.{format_ext}",
            "extension": format_ext,
        })
        sidecar_fmt, sidecar_save = _normalize_sidecar(sidecar_format)
        sidecar_text = _format_sidecar(record, sidecar_fmt)

        # Conditionally write sidecar file alongside the output
        try:
            if sidecar_save:
                base_no_ext = os.path.splitext(file_path)[0]
                sc_path = base_no_ext + (".json" if sidecar_fmt == "json" else ".txt")
                with open(sc_path, "w", encoding="utf-8") as f:
                    f.write(sidecar_text)
        except Exception:
            pass
        return {"ui": {"images": previews}, "result": (images, sidecar_text)}
    
class AudioInputOptions:

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": 
                    {
                        "audio_input_path": ("STRING", {"default": "/path/"}),
                        "clip_audio": ("BOOLEAN", {"default": False}),
                        "audio_clip_start_seconds": ("FLOAT", {"default": 0, "min": 0, "max": 3.402823466e+38}),
                        "audio_clip_duration": ("FLOAT", {"default": 0, "min": 0, "max": 3.402823466e+38}),
                     },
                "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }
        
    RETURN_TYPES = ("AUDIO_INPUT_OPTIONS",)
    FUNCTION = "execute"

    def execute(self, **kwargs):
        kwargs_copy = copy.deepcopy(kwargs)
        kwargs_copy["audio_input_path"] = resolve_file_path(kwargs["audio_input_path"])
        return (kwargs_copy,)

class JoinVideosInDirectory:

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": 
                    {
                        "directory_containing_videos": ("STRING", {"default": "/path/"}),
                        "output_file_path": ("STRING", {"default": "/path/"}),
                        "audio_input_options": ("AUDIO_INPUT_OPTIONS",),
                        "delete_directory_containing_videos": ("BOOLEAN", {"default": False}),
                     },
                "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }
        
    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "join_videos_in_directory"
    
    def _safe_remove(self, path, attempts: int = 8, delay_sec: float = 0.25):
        """Attempt to remove a file with retries to avoid Windows file-lock issues."""
        if not path:
            return True
        for _ in range(attempts):
            try:
                if os.path.exists(path):
                    os.remove(path)
                return True
            except PermissionError:
                time.sleep(delay_sec)
            except Exception:
                break
        return False

    def _rmtree_with_retry(self, path, attempts: int = 20, delay_sec: float = 0.25):
        """Attempt to remove a directory tree with retries.
        Returns True on success, False if it ultimately failed (but suppresses exceptions)."""
        if not path:
            return True
        for _ in range(attempts):
            try:
                if os.path.exists(path):
                    shutil.rmtree(path)
                return True
            except PermissionError:
                time.sleep(delay_sec)
            except Exception:
                # Wait and retry a bit for transient errors
                time.sleep(delay_sec)
        # Final attempt ignoring errors
        try:
            shutil.rmtree(path, ignore_errors=True)
        except Exception:
            pass
        return False

    def _probe_video_codec(self, file_path: str) -> str | None:
        try:
            result = subprocess.run(
                [
                    'ffprobe', '-v', 'error', '-select_streams', 'v:0',
                    '-show_entries', 'stream=codec_name', '-of', 'default=nw=1:nk=1', file_path
                ],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True
            )
            codec = result.stdout.strip().lower()
            return codec or None
        except Exception:
            return None

    def join_videos_in_directory(
        self,
        directory_containing_videos,
        output_file_path,
        audio_input_options,
        delete_directory_containing_videos=False,
        metadata_path: str | None = None,
        use_mov_metadata_flags: bool = False,
    ):

        directory_containing_videos = resolve_file_path(directory_containing_videos)
        output_file_path = resolve_file_path(output_file_path)

        full_output_directory = os.path.dirname(output_file_path)
        os.makedirs(full_output_directory, exist_ok=True)         

        # Get a list of video files in the folder
        video_files = [f for f in os.listdir(directory_containing_videos) if is_video(os.path.join(directory_containing_videos, f))]

        if not video_files:
            print("No video files found in the folder.")
            return

        should_apply_audio = False
        if audio_input_options:
            audio_input_path = audio_input_options.get("audio_input_path")
            should_apply_audio = os.path.isfile(audio_input_path) and self.has_audio_track(audio_input_path)

        if not should_apply_audio and len(video_files) == 1:
            source_file = os.path.join(directory_containing_videos, video_files[0])

            if source_file != output_file_path:
                try:
                    shutil.copy(source_file, output_file_path)
                    print(f"Single video file copied from {source_file} to {output_file_path}")
                except IOError as e:
                    print(f"An error occurred while copying the file: {e}")
        else:

            def alphanumeric_sort_key(filename):
                """Sort filenames alphanumerically."""
                return [int(text) if text.isdigit() else text.lower() for text in re.split('([0-9]+)', filename)]

            # Sort video files to maintain order
            video_files.sort(key=alphanumeric_sort_key)

            # Create a file to list video files
            list_file_path = os.path.join(directory_containing_videos, 'video_list.txt')

            with open(list_file_path, 'w') as list_file:
                for video_file in video_files:
                    list_file.write(f"file '{os.path.join(directory_containing_videos, video_file)}'\n")       
            
            # Preemptively create trimmed audio path even if we don't need it 
            trimmed_audio_path = os.path.join(directory_containing_videos, 'trimmed_audio.aac')

            # Determine if we need to re-encode video based on target container/codec
            target_ext = os.path.splitext(output_file_path)[1].lower().lstrip('.')
            first_input = os.path.join(directory_containing_videos, video_files[0])
            input_vcodec = self._probe_video_codec(first_input)
            vcodec = 'copy'
            vcodec_extra = []
            if target_ext == 'webm':
                # WebM requires VP8/9/AV1
                if input_vcodec not in ('vp8', 'vp9', 'av1'):
                    vcodec = 'libvpx-vp9'
                    vcodec_extra = ['-b:v', '0', '-pix_fmt', 'yuv420p']

            # Build the ffmpeg command to concatenate videos and apply audio
            if should_apply_audio:
                audio_codec = 'aac'
                if output_file_path.endswith("webm"):
                    audio_codec = 'libopus'
                audio_input_path = audio_input_options.get("audio_input_path")                
                clip_audio = audio_input_options.get("clip_audio", False)
                audio_clip_start_seconds = audio_input_options.get("audio_clip_start_seconds", 0)
                audio_clip_duration = audio_input_options.get("audio_clip_duration", 0)

                use_whole_audio = audio_clip_start_seconds == 0 and audio_clip_duration == 0

                if clip_audio and not use_whole_audio:
                    # Trim the audio first
                    audio_duration = self.get_audio_duration(audio_input_path)
                    if audio_clip_duration == 0 or audio_clip_start_seconds + audio_clip_duration > audio_duration:
                        audio_clip_duration = audio_duration - audio_clip_start_seconds
                    audio_trim_command = [
                        'ffmpeg',
                        '-i', audio_input_path,
                        '-ss', str(audio_clip_start_seconds),
                        '-t', str(audio_clip_duration),
                        '-ac', '2', # Force stereo for now
                        '-c:a', 'aac',
                        '-loglevel', 'quiet',
                        trimmed_audio_path
                    ]
                    try:
                        subprocess.run(audio_trim_command, check=True)
                        print(f"Trimmed audio saved to {trimmed_audio_path}")
                    except subprocess.CalledProcessError as e:
                        print(f"An error occurred during audio trimming: {e}")
                        return
                    audio_path_to_use = trimmed_audio_path
                else:
                    audio_path_to_use = audio_input_path

                ffmpeg_command_final = [
                    'ffmpeg',
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', list_file_path,
                    '-i', audio_path_to_use,
                ]
                if metadata_path and os.path.exists(metadata_path):
                    ffmpeg_command_final += ['-i', metadata_path]
                ffmpeg_command_final += [
                    '-map', '0:v',
                    '-map', '1:a',
                    '-c:v', vcodec,
                    *vcodec_extra,
                    '-c:a', audio_codec,
                    '-strict', 'experimental',
                    '-loglevel', 'quiet',
                ]
                if metadata_path and os.path.exists(metadata_path):
                    ffmpeg_command_final += ['-map_metadata', '2']
                if use_mov_metadata_flags:
                    ffmpeg_command_final += ['-movflags', 'use_metadata_tags+faststart']
                ffmpeg_command_final += [output_file_path]

            else:
                # No audio file provided
                ffmpeg_command_final = [
                    'ffmpeg',
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', list_file_path,
                ]
                if metadata_path and os.path.exists(metadata_path):
                    ffmpeg_command_final += ['-i', metadata_path]
                ffmpeg_command_final += [
                    '-c:v', vcodec,
                    *vcodec_extra,
                    '-strict', 'experimental',
                ]
                if metadata_path and os.path.exists(metadata_path):
                    ffmpeg_command_final += ['-map', '0:v', '-map_metadata', '1']
                if use_mov_metadata_flags:
                    ffmpeg_command_final += ['-movflags', 'use_metadata_tags+faststart']
                ffmpeg_command_final += [output_file_path]

            try:
                # Run ffmpeg to concatenate videos and optionally apply audio
                process_final = subprocess.Popen(
                    ffmpeg_command_final, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True
                )

                # Read the output and error streams
                stdout, stderr = process_final.communicate()

                # Wait for the process to finish
                process_final.wait()
                # Explicitly close streams and release process handles before file cleanup
                try:
                    if process_final.stdout:
                        process_final.stdout.close()
                except Exception:
                    pass
                try:
                    if process_final.stderr:
                        process_final.stderr.close()
                except Exception:
                    pass
                # Small delay to allow OS/ffmpeg to release file locks on Windows
                time.sleep(0.5)
                if process_final.returncode == 0:
                    print(f"\nProcessing complete. Output file: {output_file_path}")
                else:
                    print(f"\nAn error occurred during processing: ffmpeg process returned non-zero exit code {process_final.returncode}")
                    print(stdout)
                    print(stderr)
                    return

            except subprocess.CalledProcessError as e:
                print(f"\nAn error occurred: {e}")

            finally:
                # If caller wants the whole temp dir removed, prefer deleting the directory tree
                if delete_directory_containing_videos:
                    # Try to rename potentially locked files so the directory can be removed later
                    try:
                        if os.path.exists(list_file_path):
                            os.replace(list_file_path, list_file_path + ".del")
                    except Exception:
                        pass
                    try:
                        if os.path.exists(trimmed_audio_path):
                            os.replace(trimmed_audio_path, trimmed_audio_path + ".del")
                    except Exception:
                        pass
                    # Remove the temp directory with retries
                    self._rmtree_with_retry(directory_containing_videos, attempts=40, delay_sec=0.25)
                else:
                    # Otherwise, clean individual files with retries
                    self._safe_remove(list_file_path, attempts=40, delay_sec=0.25)
                    self._safe_remove(trimmed_audio_path, attempts=40, delay_sec=0.25)

    # Directory cleanup is handled in the finally block above when requested.

        output_directory = folder_paths.get_output_directory()
        temp_directory = folder_paths.get_temp_directory()

        save_to_output_dir = output_file_path.startswith(output_directory)
        save_to_temp_dir = output_file_path.startswith(temp_directory)

        # While saving anywhere is supported, we can only display temp/output types
        if save_to_output_dir or save_to_temp_dir:
            filename = get_clean_filename(output_file_path)     
            format_ext = get_file_extension_without_dot(output_file_path)       
            subfolder = full_output_directory.replace(
                output_directory if save_to_output_dir else temp_directory,""
            )
            if subfolder.startswith("/"):
                subfolder = subfolder[1:]
            output_format = f"video/{format_ext}"
            
            previews = [
                {
                    "filename": f"{filename}.{format_ext}",
                    "subfolder": subfolder,
                    "type": "output" if save_to_output_dir else "temp",
                    "format": f"video/{format_ext}",
                }
            ]
            return {"ui": {"images": previews}}

        return {}

    def get_audio_duration(self, file_path):
        """Get the duration of an audio file in seconds."""
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file_path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        info = json.loads(result.stdout)
        return float(info['format']['duration'])

    def has_audio_track(self, file_path):
        try:
            # Run ffprobe command to get stream information in JSON format
            result = subprocess.run(
                [
                    'ffprobe',
                    '-v', 'error',
                    '-show_entries', 'stream=codec_type',
                    '-of', 'json',
                    file_path
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=True,
                text=True
            )

            # Parse the JSON output
            output = json.loads(result.stdout)
            streams = output.get('streams', [])

            # Check if any of the streams are of type 'audio'
            for stream in streams:
                if stream.get('codec_type') == 'audio':
                    return True
            
            return False

        except subprocess.CalledProcessError as e:
            print(f"An error occurred while running ffprobe: {e}")
            return False


NODE_CLASS_MAPPINGS = {
    "AUNSaveVideo": AUNSaveVideo,
    "JoinVideosInDirectory": JoinVideosInDirectory,
    "AudioInputOptions": AudioInputOptions
}  

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNSaveVideo": "AUN Save Video",
    "JoinVideosInDirectory": "Join Videos In Directory",
    "AudioInputOptions": "Audio Input Options (For Video Output)"
}
