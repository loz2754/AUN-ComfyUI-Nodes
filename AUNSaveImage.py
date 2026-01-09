import os
from datetime import datetime
import json
import piexif
import piexif.helper
from PIL import Image
from PIL.PngImagePlugin import PngInfo
from typing import Any, Dict
import numpy as np
import folder_paths
import re
from .utils import get_sha256
from .model_utils import (
    get_short_name as get_model_short_name,
    get_lora_short_name,
    get_sampler_short_name,
    get_scheduler_short_name,
    MODEL_SHORT_NAMES,
    SAMPLER_SHORT_NAMES,
    SCHEDULER_SHORT_NAMES,
    LORA_SHORT_NAMES,
)

# --- Constants ---

# (Dictionaries now imported from .model_utils)

# Model short names: map common model base filenames (without extension) to short, readable tags.
# Users can extend this map to fit their local model names.

# LoRA short names: map common/long LoRA base filenames (without extension) to short tags.
# Users can extend this map to fit their local LoRA names.

# --- Helper Functions ---

def get_short_name(name, short_names_dict):
    """Returns a shortened name from a dictionary if it exists, otherwise the original name."""
    return short_names_dict.get(name, name)

def _sanitize_token_str(value: str) -> str:
    """Sanitize token replacement values so they produce safe filenames."""
    if value is None:
        return ""
    s = str(value).strip()
    s = s.replace("\\", "/").split("/")[-1]
    s = s.replace(" ", "_")
    # Keep alphanum, dash, underscore, plus, parentheses, comma, semicolon, and '@'
    s = re.sub(r"[^A-Za-z0-9_(),;+@\-]", "", s)
    # remove dots to be consistent with model short names
    s = s.replace('.', '')
    return s


_LORA_TAG_PATTERN = re.compile(r"<lora:([^:>]+):([^:>]+)(?::([^:>]+))?>", re.IGNORECASE)


def _coerce_float(value: Any) -> float | None:
    try:
        if value in (None, "", False):
            return None
        return float(value)
    except Exception:
        return None


def _parse_lora_tag_text(text: str) -> list[dict]:
    """Parse LoRA descriptors from inline <lora:name:strength[:clip]> syntax."""

    if not isinstance(text, str) or '<lora:' not in text.lower():
        return []

    items: list[dict] = []
    for match in _LORA_TAG_PATTERN.findall(text):
        lora_name = match[0]
        model_strength = _coerce_float(match[1])
        clip_strength = _coerce_float(match[2]) if match[2] else None
        if model_strength is None:
            continue
        if clip_strength is None:
            clip_strength = model_strength
        items.append({
            'name': lora_name,
            'strength': model_strength,
            'strengthTwo': clip_strength,
        })
    return items


LORA_TAG_LOADER_NAMES = {
    "LoraTagLoader",
    "Lora Tag Loader",
    "LoRA Tag Loader",
    "LoRA Tag Loader (LoraManager)",
}


def _looks_like_node_id(value: Any) -> bool:
    if isinstance(value, (int, float)):
        return True
    if not isinstance(value, str):
        return False
    if not value:
        return False
    if value.isdigit():
        return True
    return bool(re.fullmatch(r"[0-9a-fA-F]{1,16}", value))


def _find_lora_entries(value: Any) -> list[dict]:
    """Recursively search nested structures for LoRA descriptors."""

    results: list[dict] = []

    strength_keys = (
        'strength',
        'strength_model',
        'model_strength',
        'strength_value',
        'weight',
        'alpha',
    )
    clip_strength_keys = (
        'strengthTwo',
        'clip_strength',
        'clipStrength',
        'strength_clip',
        'clip',
    )

    def walk(obj: Any) -> None:
        if isinstance(obj, dict):
            name = obj.get('name') or obj.get('lora_name')
            has_strength = any(key in obj for key in strength_keys) or any(key in obj for key in clip_strength_keys)
            if isinstance(name, str) and has_strength:
                if obj.get('active', True) not in (False, 'false', 'False', 0):
                    model_strength = None
                    for key in strength_keys:
                        val = obj.get(key)
                        if val not in (None, ''):
                            model_strength = val
                            break
                    clip_strength = None
                    for key in clip_strength_keys:
                        val = obj.get(key)
                        if val not in (None, ''):
                            clip_strength = val
                            break
                    if model_strength is None:
                        model_strength = clip_strength
                    if model_strength is not None:
                        ms = _coerce_float(model_strength)
                        cs = _coerce_float(clip_strength)
                        if ms is None and cs is None:
                            return
                        if ms is None:
                            ms = cs
                        if cs is None:
                            cs = ms
                        results.append({
                            'name': name,
                            'strength': ms,
                            'strengthTwo': cs,
                        })
            for nested in obj.values():
                walk(nested)
        elif isinstance(obj, (list, tuple, set)):
            for item in obj:
                walk(item)

    walk(value)
    return results


def _resolve_connected_texts(value: Any,
                              prompt_nodes: dict[str, dict] | None,
                              workflow_nodes: dict[str, dict] | None,
                              workflow_links: dict[str, dict] | None = None,
                              visited: set[str] | None = None,
                              depth: int = 0,
                              collect_all: bool = False) -> list[str]:
    if visited is None:
        visited = set()
    if depth > 16 or value is None:
        return []

    results: list[str] = []

    def visit_node(node_id: str) -> None:
        if node_id in visited:
            return
        visited.add(node_id)
        start_len = len(results)
        if prompt_nodes and node_id in prompt_nodes:
            node = prompt_nodes[node_id]
            node_inputs_raw = node.get('inputs', {}) or {}
            if isinstance(node_inputs_raw, dict):
                node_inputs_iterable = node_inputs_raw.values()
            else:
                node_inputs_iterable = _normalize_input_mapping(node_inputs_raw, workflow_links).values()
            for val in node_inputs_iterable:
                before = len(results)
                results.extend(_resolve_connected_texts(val, prompt_nodes, workflow_nodes, workflow_links, visited, depth + 1, collect_all))
                if not collect_all and len(results) > before:
                    break
        if workflow_nodes and node_id in workflow_nodes:
            node = workflow_nodes[node_id]
            node_inputs_raw = node.get('inputs') or {}
            if isinstance(node_inputs_raw, dict):
                node_inputs_iterable = node_inputs_raw.values()
            else:
                node_inputs_iterable = _normalize_input_mapping(node_inputs_raw, workflow_links).values()
            for val in node_inputs_iterable:
                before = len(results)
                results.extend(_resolve_connected_texts(val, prompt_nodes, workflow_nodes, workflow_links, visited, depth + 1, collect_all))
                if not collect_all and len(results) > before:
                    break
            if len(results) == start_len:
                widgets = node.get('widgets_values')
                if isinstance(widgets, list):
                    for item in widgets:
                        if isinstance(item, str) and item:
                            results.append(item)
                            if not collect_all:
                                break

    if isinstance(value, str):
        if _looks_like_node_id(value):
            visit_node(str(value))
        else:
            results.append(value)
        return results

    if isinstance(value, (int, float)):
        visit_node(str(int(value)))
        return results

    if isinstance(value, dict):
        node_ref = value.get('node')
        if node_ref is None and workflow_links and 'link' in value:
            link_info = workflow_links.get(str(value.get('link')))
            if link_info and link_info.get('from_node') is not None:
                node_ref = link_info.get('from_node')
        if node_ref is not None:
            visit_node(str(node_ref))
        else:
            for nested in value.values():
                results.extend(_resolve_connected_texts(nested, prompt_nodes, workflow_nodes, workflow_links, visited, depth + 1, collect_all))
        return results

    if isinstance(value, (list, tuple, set)):
        for item in value:
            if isinstance(item, (list, tuple)) and item:
                possible_id = item[0]
                if _looks_like_node_id(possible_id):
                    visit_node(str(possible_id))
                    if not collect_all:
                        continue
            if isinstance(item, dict) and workflow_links and 'link' in item:
                link_info = workflow_links.get(str(item.get('link')))
                if link_info and link_info.get('from_node') is not None:
                    visit_node(str(link_info.get('from_node')))
                    if not collect_all:
                        continue
            if _looks_like_node_id(item):
                visit_node(str(item))
            else:
                results.extend(_resolve_connected_texts(item, prompt_nodes, workflow_nodes, workflow_links, visited, depth + 1, collect_all))
        return results

    return results


def _normalize_input_mapping(raw_inputs: Any,
                             workflow_links: dict[str, dict] | None = None) -> dict[str, Any]:
    if isinstance(raw_inputs, dict):
        return raw_inputs

    normalized: dict[str, Any] = {}
    if not isinstance(raw_inputs, list):
        return normalized

    for entry in raw_inputs:
        if not isinstance(entry, dict):
            continue
        name = entry.get('name')
        if not name:
            continue

        value: Any = None
        if 'link' in entry and entry.get('link') is not None and workflow_links:
            link_info = workflow_links.get(str(entry.get('link')))
            if link_info and link_info.get('from_node') is not None:
                value = {'node': str(link_info.get('from_node'))}
        if value is None and 'connections' in entry and isinstance(entry.get('connections'), list):
            connections = []
            for conn in entry['connections']:
                if isinstance(conn, dict) and conn.get('node') is not None:
                    connections.append({'node': str(conn.get('node'))})
            if connections:
                value = connections[0] if len(connections) == 1 else connections
        if value is None and entry.get('value') is not None:
            value = entry.get('value')
        if value is None and 'default' in entry:
            value = entry.get('default')

        if value is None:
            continue

        if name in normalized:
            existing = normalized[name]
            if isinstance(existing, list):
                existing.append(value)
            else:
                normalized[name] = [existing, value]
        else:
            normalized[name] = value

    return normalized


def _extract_loras_from_inputs(inputs: Any,
                               node_type: str | None = None,
                               node_meta: dict | None = None,
                               prompt_nodes: dict[str, dict] | None = None,
                               workflow_nodes: dict[str, dict] | None = None,
                               workflow_links: dict[str, dict] | None = None) -> list[dict]:
    items = []
    try:
        normalized_inputs = _normalize_input_mapping(inputs, workflow_links)

        def add_item(name: Any,
                     model_strength: Any,
                     clip_strength: Any,
                     origin_override: str | None = None) -> None:
            if not name or not isinstance(name, str):
                return
            ms = _coerce_float(model_strength)
            cs = _coerce_float(clip_strength)
            if ms is None and cs is None:
                return
            if ms is None:
                ms = cs
            if cs is None:
                cs = ms
            entry = {'name': name, 'strength': ms, 'strengthTwo': cs}
            origin_value = origin_override or node_type
            if isinstance(origin_value, str) and origin_value:
                entry['origin'] = origin_value
            items.append(entry)

        # Handle rgthree's Power Lora Loader: lora_1, lora_2, etc. as dicts
        for key, val in normalized_inputs.items():
            k = str(key).lower()
            if k.startswith('lora_') and isinstance(val, dict):
                if val.get('on', False) and 'lora' in val:
                    add_item(val.get('lora'), val.get('strength'), val.get('strengthTwo'))
        # Handle standard ComfyUI LoraLoader: lora_name, strength_model, strength_clip
        if not items:
            lora_name = normalized_inputs.get('lora_name') or normalized_inputs.get('lora')
            if lora_name and isinstance(lora_name, str):
                add_item(
                    lora_name,
                    normalized_inputs.get('strength_model') or normalized_inputs.get('strength') or normalized_inputs.get('model_strength'),
                    normalized_inputs.get('strength_clip') or normalized_inputs.get('clip_strength'),
                )
        # Handle multiple loras like lora_name_1, lora_name_2, etc. (for LoraManager or similar)
        if not items:
            for key, val in normalized_inputs.items():
                k = str(key).lower()
                if k.startswith('lora_name_') or k.startswith('lora_') and not isinstance(val, dict):
                    if isinstance(val, str) and val:
                        idx = k.split('_')[-1]
                        strength_key = f'strength_model_{idx}' if idx.isdigit() else 'strength_model'
                        clip_key = f'strength_clip_{idx}' if idx.isdigit() else 'strength_clip'
                        add_item(
                            val,
                            normalized_inputs.get(strength_key) or normalized_inputs.get('strength'),
                            normalized_inputs.get(clip_key) or normalized_inputs.get('clip_strength'),
                        )
        # Handle loras as a list
        if not items:
            loras = normalized_inputs.get('loras')
            if isinstance(loras, list):
                for lora in loras:
                    if isinstance(lora, dict) and 'name' in lora:
                        add_item(
                            lora.get('name'),
                            lora.get('strength') or lora.get('model_strength'),
                            lora.get('clip_strength'),
                        )
            elif isinstance(loras, dict) and '__value__' in loras:
                for lora in loras['__value__']:
                    if isinstance(lora, dict) and 'name' in lora and lora.get('active', True):
                        add_item(
                            lora.get('name'),
                            lora.get('strength') or lora.get('model_strength'),
                            lora.get('clipStrength') or lora.get('clip_strength'),
                        )
        # Handle lora_stack (list of tuples: path, model_strength, clip_strength)
        if not items:
            lora_stack = normalized_inputs.get('lora_stack')
            if isinstance(lora_stack, list):
                for stack_item in lora_stack:
                    if isinstance(stack_item, (list, tuple)) and len(stack_item) >= 2:
                        lora_path = stack_item[0]
                        if isinstance(lora_path, str):
                            # Extract name from path
                            import os
                            lora_name = os.path.splitext(os.path.basename(lora_path))[0]
                            model_strength = stack_item[1] if len(stack_item) > 1 else None
                            clip_strength = stack_item[2] if len(stack_item) > 2 else model_strength
                            add_item(lora_name, model_strength, clip_strength)
        # Handle text inputs with <lora:name:strength> syntax (for LoraManager)
        if not items:
            text_input = normalized_inputs.get('text') or normalized_inputs.get('lora_syntax')
            if isinstance(text_input, str):
                for entry in _parse_lora_tag_text(text_input):
                    add_item(entry['name'], entry['strength'], entry['strengthTwo'], origin_override='TextBasedLoRA')
            elif isinstance(text_input, (list, tuple)):
                for val in text_input:
                    if isinstance(val, str):
                        for entry in _parse_lora_tag_text(val):
                            add_item(entry['name'], entry['strength'], entry['strengthTwo'], origin_override='TextBasedLoRA')
        if not items and (not node_type or node_type not in LORA_TAG_LOADER_NAMES):
            source_to_search = inputs if isinstance(inputs, dict) else normalized_inputs
            items.extend(_find_lora_entries(source_to_search))

        # Specialized handling for LoraTagLoader text inputs
        if node_type and node_type in LORA_TAG_LOADER_NAMES:
            candidate_texts: list[str] = []
            text_input = normalized_inputs.get('text')
            candidate_texts.extend(_resolve_connected_texts(text_input, prompt_nodes, workflow_nodes, workflow_links, collect_all=True))
            if not candidate_texts and isinstance(text_input, str) and text_input:
                candidate_texts.append(text_input)
            if (not candidate_texts and node_meta and isinstance(node_meta.get('widgets_values'), list)
                    and (not isinstance(text_input, (list, tuple, dict)) or not text_input)):
                for val in node_meta['widgets_values']:
                    if isinstance(val, str) and val:
                        candidate_texts.append(val)
                        break
            seen_texts: set[str] = set()
            for text_val in candidate_texts:
                if not isinstance(text_val, str) or '<lora:' not in text_val.lower():
                    continue
                if text_val in seen_texts:
                    continue
                seen_texts.add(text_val)
                parsed_entries = _parse_lora_tag_text(text_val)
                if not parsed_entries:
                    continue
                for entry in parsed_entries:
                    add_item(
                        entry['name'],
                        entry['strength'],
                        entry['strengthTwo'],
                        origin_override='LoraTagLoader',
                    )
    except Exception:
        pass
    return items

def extract_loras(prompt: Any = None, extra_pnginfo: Any = None) -> list[dict]:
    """Extract enabled LoRAs (name + strengths) from LoRA loader nodes
    in both runtime prompt (server) structure and saved workflow (UI) structure.
    Supports rgthree's Power Lora Loader and standard ComfyUI LoraLoader.
    Returns a list of dicts with keys: name, strength, strengthTwo (clip).
    """
    target_names = {
        "Power Lora Loader (rgthree)",
        # Fallbacks in case of variations
        "RgthreePowerLoraLoader",
        "Power Lora Loader",
        "LoraLoader",
        "Lora Loader",
        "LoraLoaderModelOnly",
        "LoraLoaderModelOnly (rgthree)",
        "Lora Loader (LoraManager)",
        "LoRA Text Loader (LoraManager)",
        "LoraTagLoader",
        "Lora Tag Loader",
        "LoRA Tag Loader",
        "LoRA Tag Loader (LoraManager)",
        "Load LoRA Tag",
        "LoraManager",
        "Lora Manager",
        "LoraManagerLoader",
    }
    all_items = []
    prompt_nodes_map: dict[str, dict] | None = None
    workflow_nodes_map: dict[str, dict] | None = None
    workflow_nodes_list: list[dict] = []
    workflow_links_map: dict[str, dict] | None = None

    if isinstance(prompt, dict):
        prompt_nodes_map = {}
        for key, node in prompt.items():
            if isinstance(node, dict):
                prompt_nodes_map[str(key)] = node

    if isinstance(extra_pnginfo, dict):
        wf = extra_pnginfo.get('workflow')
        if isinstance(wf, dict):
            nodes = wf.get('nodes')
            if isinstance(nodes, list):
                workflow_nodes_list = nodes
                workflow_nodes_map = {}
                for node in nodes:
                    if not isinstance(node, dict):
                        continue
                    node_id = node.get('id')
                    if node_id is None:
                        node_id = node.get('index') or node.get('node_id')
                    if node_id is not None:
                        workflow_nodes_map[str(node_id)] = node
            links = wf.get('links')
            if isinstance(links, list):
                workflow_links_map = {}
                for link in links:
                    if isinstance(link, (list, tuple)) and len(link) >= 5:
                        link_id = link[0]
                        from_node = link[1]
                        to_node = link[3]
                        workflow_links_map[str(link_id)] = {
                            'from_node': str(from_node) if from_node is not None else None,
                            'to_node': str(to_node) if to_node is not None else None,
                        }

    # 1) Try prompt dict mapping {id: {class_type, inputs}}
    try:
        if prompt_nodes_map:
            for nid, node in prompt_nodes_map.items():
                # Check if bypassed in workflow
                wf_node = workflow_nodes_map.get(str(nid))
                if wf_node and wf_node.get('mode', 0) == 2:
                    continue

                ctype = node.get('class_type') if isinstance(node, dict) else None
                if ctype and ctype in target_names:
                    items = _extract_loras_from_inputs(
                        node.get('inputs', {}),
                        ctype,
                        node,
                        prompt_nodes_map,
                        workflow_nodes_map,
                        workflow_links_map,
                    )
                    all_items.extend(items)
    except Exception:
        pass
    # 2) Try extra_pnginfo['workflow'] UI structure with nodes list
    try:
        if workflow_nodes_list:
            for node in workflow_nodes_list:
                if not isinstance(node, dict):
                    continue
                # Check if bypassed
                if node.get('mode', 0) == 2:
                    continue

                ntype = node.get('type') or node.get('class_type')
                if ntype and ntype in target_names:
                    items = _extract_loras_from_inputs(
                        node.get('inputs', {}),
                        ntype,
                        node,
                        prompt_nodes_map,
                        workflow_nodes_map,
                        workflow_links_map,
                    )
                    all_items.extend(items)
    except Exception:
        pass
    # Fallback parsing: look for inline tags anywhere in prompt/workflow structures
    # Remove duplicates if any
    seen = set()
    unique_items = []
    for item in all_items:
        key = (item['name'], item['strength'], item['strengthTwo'])
        if key not in seen:
            seen.add(key)
            unique_items.append(item)
    return unique_items

def get_timestamp(time_format):
    """Generates a timestamp string based on the provided format."""
    try:
        return datetime.now().strftime(time_format)
    except:
        return datetime.now().strftime("%Y%m%d-%H%M%S")

def generate_path_from_pattern(pattern, replacements):
    """Replaces placeholders in a pattern with values from a dictionary."""
    # Replace longer placeholders first to avoid substring collisions
    for placeholder in sorted(replacements.keys(), key=len, reverse=True):
        value = replacements[placeholder]
        pattern = pattern.replace(f"%{placeholder}", str(value))
    return pattern

# --- Node Class ---

class AUNSaveImage:
    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()
        self.type = "output"

    @staticmethod
    def _extract_text_prompts(prompt: Dict | None = None, extra_pnginfo: Dict | None = None) -> tuple[str, str]:
        """Extract only the final text feeding the CLIP text encoders (no concatenation)."""
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
                wf_nodes_by_id[to_key(n.get('id'))] = n

        def resolve_single_chain(node_id: str, depth: int = 0) -> str:
            """Resolve a single upstream chain to a string (avoid combining multiple parts)."""
            if depth > 12:
                return ""
            node = prompt_nodes.get(to_key(node_id))
            if not isinstance(node, dict):
                wfn = wf_nodes_by_id.get(to_key(node_id))
                if isinstance(wfn, dict):
                    wv = wfn.get('widgets_values')
                    if isinstance(wv, list) and wv and isinstance(wv[0], str):
                        return wv[0]
                return ""
            inps = node.get('inputs', {}) or {}
            ctype = str(node.get('class_type') or '')

            # Explicit handling for AUNMultiNegPrompt: select exact slot by which_negative, no fallback
            try:
                if 'AUNMultiNegPrompt' in ctype:
                    # Determine selected index (1..10)
                    idx_raw = inps.get('which_negative', None)
                    idx_num = None
                    if isinstance(idx_raw, (int, float)) or (isinstance(idx_raw, str) and idx_raw.isdigit()):
                        try:
                            idx_num = int(idx_raw)
                        except Exception:
                            idx_num = None
                    if idx_num is None:
                        # Workflow fallback: widgets_values ordering has negatives x10 then which_negative
                        wfn_ln = wf_nodes_by_id.get(to_key(node_id))
                        if isinstance(wfn_ln, dict):
                            wv = wfn_ln.get('widgets_values')
                            if isinstance(wv, list) and len(wv) >= 11:
                                try:
                                    idx_num = int(wv[10])
                                except Exception:
                                    idx_num = None
                    if not idx_num or idx_num < 1 or idx_num > 10:
                        # Out of range: treat as intentionally empty
                        return ""
                    pick_key = f"negative{idx_num}"
                    if pick_key in inps:
                        val = inps.get(pick_key)
                        if isinstance(val, str):
                            return val or ""
                        if isinstance(val, (list, tuple)) and val:
                            return resolve_single_chain(val[0], depth + 1)
                        return ""
                    # If key missing, treat as empty
                    return ""
            except Exception:
                pass

            # Impact Pack: prefer populated_text over wildcard_text
            try:
                if 'ImpactWildcardProcessor' in ctype or 'ImpactWildcardEncode' in ctype:
                    for key in ('populated_text', 'wildcard_text', 'text', 'string'):
                        val = inps.get(key)
                        if isinstance(val, str) and val:
                            return val
                        if isinstance(val, (list, tuple)) and val:
                            return resolve_single_chain(val[0], depth + 1)
                    # Workflow fallback: widgets_values index for populated_text
                    wfn_i = wf_nodes_by_id.get(to_key(node_id))
                    if isinstance(wfn_i, dict):
                        wv = wfn_i.get('widgets_values')
                        if isinstance(wv, list) and wv:
                            # ImpactWildcardProcessor: [wildcard_text, populated_text, mode, seed, select]
                            # ImpactWildcardEncode: [model, clip, wildcard_text, populated_text, mode, select_lora, select_wc, seed]
                            idx = 1 if 'ImpactWildcardProcessor' in ctype else (3 if len(wv) > 3 else None)
                            if idx is not None and idx < len(wv) and isinstance(wv[idx], str):
                                return wv[idx]
                    return ""
            except Exception:
                pass

            # Special handling: index-based switch/select nodes (e.g., AUNTextIndexSwitch, AUNMultiNegPrompt)
            try:
                idx_val = inps.get('index', inps.get('idx', inps.get('i', None)))
                # Gather candidate text slots
                textN = sorted([k for k in inps.keys() if re.fullmatch(r"text\d+", str(k))], key=lambda k: int(str(k)[4:]) if str(k)[4:].isdigit() else 0)
                letters = [k for k in inps.keys() if str(k) in [chr(c) for c in range(ord('a'), ord('z')+1)]]
                candidates = textN if textN else letters
                if candidates:
                    # Resolve index value: literal -> use; connection -> try upstream; else -> workflow widget
                    def _resolve_index_from_ref(ref, dpth=0):
                        if dpth > 12 or ref is None:
                            return None
                        # Direct numeric
                        if isinstance(ref, (int, float)) or (isinstance(ref, str) and ref.isdigit()):
                            try:
                                return int(ref)
                            except Exception:
                                return None
                        # Connection form
                        if isinstance(ref, (list, tuple)) and ref:
                            up = ref[0]
                            try:
                                up_id = to_key(up[0]) if isinstance(up, (list, tuple)) else to_key(up)
                            except Exception:
                                up_id = None
                            n2 = prompt_nodes.get(up_id) if up_id else None
                            if isinstance(n2, dict):
                                c2 = str(n2.get('class_type') or '')
                                in2 = n2.get('inputs', {}) or {}
                                # Handle AUNRandomIndexSwitch: check if select or random
                                if 'RandomIndexSwitch' in c2:
                                    wf_n2 = wf_nodes_by_id.get(to_key(up_id))
                                    if isinstance(wf_n2, dict):
                                        wv = wf_n2.get('widgets_values', [])
                                        if len(wv) >= 4:
                                            rand_or_select = wv[2]
                                            select_val = wv[3]
                                            if not rand_or_select:  # select mode
                                                return select_val
                                            else:
                                                return None
                                    return None
                                # Generic: try common int-ish keys
                                for kx in ('index', 'idx', 'i', 'value', 'val', 'int', 'select'):
                                    v2 = in2.get(kx, None)
                                    if v2 is not None:
                                        r = _resolve_index_from_ref(v2, dpth + 1)
                                        if r is not None:
                                            return r
                        return None

                    idx_num = None
                    # First: try to resolve from reference (handles literals and connections)
                    idx_num = _resolve_index_from_ref(idx_val, 0)
                    if idx_num is None:
                        wfn = wf_nodes_by_id.get(to_key(node_id))
                        if isinstance(wfn, dict):
                            wv = wfn.get('widgets_values')
                            if isinstance(wv, list) and len(wv) >= 1:
                                try:
                                    idx_num = int(wv[0])
                                except Exception:
                                    idx_num = None
                    if idx_num is None:
                        return ""
                    # If this is a AUN Multi/Index prompt node, pick exact textN; do NOT fall back
                    if any(tag in ctype for tag in (
                        'TextIndexSwitch',
                        'AUNMultiNegPrompt',
                        'AUNMultiPosPrompt',
                        'AUNMultiPrompt',
                    )):
                        keys_to_try = []
                        # Prefer exact 1-based key first
                        keys_to_try.append(f"text{idx_num}")
                        # If idx might be 0-based, also try +1
                        if idx_num >= 0:
                            keys_to_try.append(f"text{idx_num + 1}")
                        for pick_key in keys_to_try:
                            if pick_key in inps:
                                val = inps.get(pick_key)
                                if isinstance(val, str) and val:
                                    return val
                                if isinstance(val, (list, tuple)) and val:
                                    resolved = resolve_single_chain(val[0], depth + 1)
                                    return resolved
                                return ""
                        # Selected slot absent -> treat as empty (don’t use other inputs)
                        return ""
                    # Generic case (non-AUN switch): choose candidate positionally
                    try_indices = []
                    for try_idx in (idx_num, idx_num - 1):
                        if 0 <= try_idx < len(candidates):
                            try_indices.append(try_idx)
                    if try_indices:
                        pick_key = candidates[try_indices[0]]
                        val = inps.get(pick_key)
                        if isinstance(val, str) and val:
                            return val
                        if isinstance(val, (list, tuple)) and val:
                            return resolve_single_chain(val[0], depth + 1)
                        # If a positional candidate was selected but is empty and this is a AUN node,
                        # treat as intentionally empty instead of falling back.
                        if 'AUN' in ctype:
                            return ""
                    # Else fall through to default heuristics
            except Exception:
                pass
            # Prefer a single direct text/string/value if present
            for key in ('text', 'text_g', 'text_l', 'text2', 'string', 'value', 'prompt'):
                val = inps.get(key)
                if isinstance(val, str) and val:
                    return val
                if isinstance(val, (list, tuple)) and val:
                    return resolve_single_chain(val[0], depth + 1)
            # Otherwise, try common positional-like keys one at a time (include text1..text10)
            for key in (
                'a', 'b', 'c', 'd', 'prefix', 'suffix', 'pre', 'post', 'left', 'right', 'middle',
                'text1', 'text2', 'text3', 'text4', 'text5', 'text6', 'text7', 'text8', 'text9', 'text10'
            ):
                val = inps.get(key)
                if isinstance(val, str) and val:
                    return val
                if isinstance(val, (list, tuple)) and val:
                    return resolve_single_chain(val[0], depth + 1)
            # Special handling for concatenation nodes like AUNAddToPrompt
            try:
                if 'AddToPrompt' in ctype:
                    texts = []
                    # Collect all inputs that are strings or resolve to strings
                    for i in range(1, 11):  # text1 to text10
                        key = f'text{i}'
                        val = inps.get(key)
                        if isinstance(val, str) and val.strip():
                            texts.append(val.strip())
                        elif isinstance(val, (list, tuple)) and val:
                            resolved = resolve_single_chain(val[0], depth + 1)
                            if resolved.strip():
                                texts.append(resolved.strip())
                    # Also check for other text inputs
                    for key in sorted(inps.keys()):
                        if key.startswith('text') and key not in [f'text{i}' for i in range(1, 11)]:
                            val = inps.get(key)
                            if isinstance(val, str) and val.strip():
                                texts.append(val.strip())
                            elif isinstance(val, (list, tuple)) and val:
                                resolved = resolve_single_chain(val[0], depth + 1)
                                if resolved.strip():
                                    texts.append(resolved.strip())
                    # Prefix and suffix
                    prefix = inps.get('prefix', '')
                    suffix = inps.get('suffix', '')
                    if isinstance(prefix, str) and prefix.strip():
                        texts.insert(0, prefix.strip())
                    elif isinstance(prefix, (list, tuple)) and prefix:
                        resolved = resolve_single_chain(prefix[0], depth + 1)
                        if resolved.strip():
                            texts.insert(0, resolved.strip())
                    if isinstance(suffix, str) and suffix.strip():
                        texts.append(suffix.strip())
                    elif isinstance(suffix, (list, tuple)) and suffix:
                        resolved = resolve_single_chain(suffix[0], depth + 1)
                        if resolved.strip():
                            texts.append(resolved.strip())
                    # Handle text_to_add for single AddToPrompt
                    text_add = inps.get('text_to_add', '')
                    if isinstance(text_add, str) and text_add.strip():
                        texts.append(text_add.strip())
                    elif isinstance(text_add, (list, tuple)) and text_add:
                        resolved = resolve_single_chain(text_add[0], depth + 1)
                        if resolved.strip():
                            texts.append(resolved.strip())
                    order = inps.get('order', 'prompt_first')
                    if order == 'text_first':
                        texts.reverse()
                    delimiter = inps.get('delimiter', ', ')
                    if texts:
                        concat = delimiter.join(texts)
                        print(f"AddToPrompt returning: {concat}")
                        return concat
            except Exception as e:
                print(f"Exception in AddToPrompt for {ctype}: {e}")
                pass
            # Special last resort for AddToPrompt
            if 'AddToPrompt' in ctype:
                resolved = None
                text_add = None
                for key, val in inps.items():
                    if key == 'text_to_add':
                        if isinstance(val, str) and val.strip():
                            text_add = val.strip()
                        elif isinstance(val, (list, tuple)) and val:
                            text_add = resolve_single_chain(val[0], depth + 1)
                    elif isinstance(val, (list, tuple)) and val:
                        if resolved is None:
                            resolved = resolve_single_chain(val[0], depth + 1)
                    elif isinstance(val, str) and val and key not in ('delimiter', 'order', 'mode'):
                        if text_add is None:
                            text_add = val
                if resolved or text_add:
                    result = resolved or ""
                    if text_add:
                        delimiter = inps.get('delimiter', ', ')
                        order = inps.get('order', 'prompt_first')
                        if order == 'text_first':
                            result = text_add + delimiter + result
                        else:
                            result = result + delimiter + text_add
                    return result
            # As a last resort, follow the first connection-like input
            for val in inps.values():
                if isinstance(val, (list, tuple)) and val:
                    return resolve_single_chain(val[0], depth + 1)
                if isinstance(val, str) and val:
                    return val
            # Workflow fallback
            wfn = wf_nodes_by_id.get(to_key(node_id))
            if isinstance(wfn, dict):
                wv = wfn.get('widgets_values')
                if isinstance(wv, list) and wv and isinstance(wv[0], str):
                    return wv[0]
            return ""

        def trace_to_encoder_text(node_ref, target_branch: str = 'positive') -> str:
            # Depth-first through upstream connections to a CLIPTextEncode, then resolve its 'text' single chain
            def _normalize_ref(ref):
                if isinstance(ref, (list, tuple)) and ref:
                    return to_key(ref[0])
                return to_key(ref)

            target_id = _normalize_ref(node_ref)
            visited: set[str] = set()

            def dfs(cur_id: str, depth: int = 0) -> str:
                if depth > 20 or not cur_id or cur_id in visited:
                    return ""
                visited.add(cur_id)
                n = prompt_nodes.get(cur_id)
                if not isinstance(n, dict):
                    wfn = wf_nodes_by_id.get(cur_id)
                    if isinstance(wfn, dict) and 'CLIPTextEncode' in str(wfn.get('type')):
                        wv = wfn.get('widgets_values')
                        if isinstance(wv, list) and wv and isinstance(wv[0], str):
                            return wv[0]
                    return ""
                ctype = str(n.get('class_type') or '')
                if 'CLIPTextEncode' in ctype:
                    print(f"Found CLIPTextEncode {cur_id}, resolving text")
                    enc_inps = n.get('inputs', {}) or {}
                    for key in ('text', 'text_g', 'text_l', 'text2'):
                        val = enc_inps.get(key)
                        if isinstance(val, str) and val:
                            print(f"Direct text {val}")
                            return val
                        if isinstance(val, (list, tuple)) and val:
                            resolved = resolve_single_chain(val[0])
                            print(f"Resolved text {resolved}")
                            return resolved
                    # Workflow fallback
                    wfn = wf_nodes_by_id.get(cur_id)
                    if isinstance(wfn, dict):
                        wv = wfn.get('widgets_values')
                        if isinstance(wv, list) and wv and isinstance(wv[0], str):
                            return wv[0]
                    return ""
                # Impact Pack: if DFS reaches an Impact wildcard node, resolve its populated text directly
                if 'ImpactWildcard' in ctype:
                    return resolve_single_chain(cur_id)
                inps = n.get('inputs', {}) or {}
                # Branch-aware priority to stay on the correct path
                base_priority = (
                    'conditioning', 'input', 'samples', 'clip', 'text',
                    'cond', 'c', 'cn', 'clip_g', 'clip_l', 'clip_vision'
                )
                tb = 'positive' if str(target_branch).lower().startswith('pos') else 'negative'
                opposite = 'negative' if tb == 'positive' else 'positive'
                priority = (tb,) + base_priority + (opposite,)
                ordered_keys = list(priority) + [k for k in inps.keys() if k not in priority]
                for key in ordered_keys:
                    val = inps.get(key)
                    if isinstance(val, (list, tuple)) and val:
                        if all(isinstance(it, (list, tuple)) for it in val):
                            # Follow only the first branch to avoid concatenation
                            it = val[0]
                            return dfs(to_key(it[0]), depth + 1)
                        else:
                            return dfs(to_key(val[0]), depth + 1)
                return ""

            return dfs(target_id, 0)

        def _first_link_src_id(ref) -> str | None:
            try:
                if isinstance(ref, (list, tuple)) and ref:
                    first = ref[0]
                    if isinstance(first, (list, tuple)) and first:
                        return to_key(first[0])
                    return to_key(first)
            except Exception:
                pass
            return None

        def _dfs_upstream_ksampler(start_ref, max_depth: int = 32) -> Dict | None:
            """From a connection reference, walk upstream prioritizing the image/sample path to find the nearest KSampler node."""
            start_id = _first_link_src_id(start_ref)
            if not start_id:
                return None
            visited: set[str] = set()

            # Keys prioritized for image/latent flow
            flow_keys = (
                'image', 'images', 'img', 'samples', 'samples_in', 'latent', 'latent_image',
                'x', 'input', 'in', 'source'
            )

            def _dfs(cur_id: str, depth: int) -> Dict | None:
                if not cur_id or depth > max_depth or cur_id in visited:
                    return None
                visited.add(cur_id)
                n = prompt_nodes.get(cur_id)
                if not isinstance(n, dict):
                    return None
                ctype = str(n.get('class_type') or '')
                if 'KSampler' in ctype:
                    return n
                inps = n.get('inputs', {}) or {}
                # Walk strong flow keys first, then any other connection
                ordered = list(flow_keys) + [k for k in inps.keys() if k not in flow_keys]
                for k in ordered:
                    v = inps.get(k)
                    # Single connection
                    if isinstance(v, (list, tuple)) and v:
                        # If multi, prefer the first as the main flow
                        nxt_id = None
                        if all(isinstance(it, (list, tuple)) for it in v):
                            it0 = v[0]
                            if isinstance(it0, (list, tuple)) and it0:
                                nxt_id = to_key(it0[0])
                        else:
                            nxt_id = to_key(v[0])
                        if nxt_id:
                            found = _dfs(nxt_id, depth + 1)
                            if found:
                                return found
                return None

            return _dfs(start_id, 0)

        pos = ""
        neg = ""
        try:
            # 0) Try to locate THIS AUNSaveImage node in the live prompt graph and trace upstream
            save_ids = [sid for sid, sn in prompt_nodes.items() if str(sn.get('class_type') or '') == 'AUNSaveImage']
            for save_id in save_ids:
                sn = prompt_nodes.get(save_id) or {}
                sinps = sn.get('inputs', {}) or {}
                img_ref = sinps.get('images')
                if img_ref is None:
                    continue
                ksampler_node = _dfs_upstream_ksampler(img_ref)
                if isinstance(ksampler_node, dict):
                    kinps = ksampler_node.get('inputs', {}) or {}
                    pos_ref = kinps.get('positive')
                    neg_ref = kinps.get('negative')
                    if pos_ref is not None and not pos:
                        pos = trace_to_encoder_text(pos_ref, 'positive') or pos
                    if neg_ref is not None and not neg:
                        neg = trace_to_encoder_text(neg_ref, 'negative') or neg
                    if pos or neg:
                        break

            # 1) Fallback: pick the first KSampler in the live prompt graph
            if not pos and not neg:
                for _, n in prompt_nodes.items():
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
                for _, node in wf_nodes_by_id.items():
                    ntype = str(node.get('type') or '')
                    if 'KSampler' in ntype:
                        inputs = node.get('inputs') or {}
                        for k in ('positive', 'negative'):
                            ref = inputs.get(k)
                            src_id = None
                            if isinstance(ref, list) and ref:
                                r0 = ref[0]
                                if isinstance(r0, dict) and 'node' in r0:
                                    src_id = to_key(r0.get('node'))
                                elif isinstance(r0, (list, tuple)):
                                    src_id = to_key(r0[0])
                            if src_id:
                                enc = wf_nodes_by_id.get(src_id)
                                if isinstance(enc, dict) and 'CLIPTextEncode' in str(enc.get('type')):
                                    wv = enc.get('widgets_values')
                                    if isinstance(wv, list) and wv and isinstance(wv[0], str):
                                        if k == 'positive' and not pos:
                                            pos = wv[0]
                                        if k == 'negative' and not neg:
                                            neg = wv[0]
                        if pos or neg:
                            break
        except Exception:
            pass
        return pos or "", neg or ""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {"tooltip": "Input images to save. Can be single image or batch."}),
                "filename": ("STRING", {"default": '%date_%basemodelname_%seed', "tooltip": "Filename pattern. Placeholders: %date, %time, %model, %modelname, %basemodelname, %model_short, %modelname_short, %basemodelshort, %basemodelname_short, %loras (grouped, e.g., (LORAS-NameA+NameB)), %sampler_name, %scheduler, %steps, %cfg, %seed, %batch_num. Note: %loras_group is kept as an alias of %loras for compatibility."}),
                "path": ("STRING", {"default": '', "tooltip": "Subfolder path within the output directory."}),
                "extension": (['png', 'jpg', 'webp'], {"default": "png", "tooltip": "Image format to save in."}),
            },
            "optional": {
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000, "tooltip": "Number of sampling steps."}),
                "cfg": ("FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0, "tooltip": "CFG scale."}),
                "modelname": ("STRING", {"default": '', "tooltip": "Model name for %model, %modelname, %basemodelname, %model_short, %modelname_short, %basemodelshort, %basemodelname_short placeholders."}),
                "sampler_name": ("STRING", {"default": '', "tooltip": "Sampler name for metadata and %sampler_name placeholder."}),
                "scheduler": ("STRING", {"default": '', "tooltip": "Scheduler name for metadata and %scheduler placeholder."}),
                "seed_value": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "Seed value for %seed placeholder and metadata."}),
                "time_format": ("STRING", {"default": "%Y%m%d-%H%M%S", "tooltip": "Time format for %time placeholder."}),
                #"denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "tooltip": "Denoise strength for metadata."}),
                "preview": (["enabled", "disabled"], {"default": "enabled", "tooltip": "Enable/disable image preview on the node."}),
                "loras_delimiter": ("STRING", {"default": ";", "tooltip": "Delimiter between LoRA entries in %loras%. Allowed: + - _ . space , ;"}),
                # Sidecar export / output option (updated)
                # New options (2025-10): user always gets an output (node return) and can select format; optionally also save per-image sidecar files.
                # Options:
                #  - Output text          -> return text sidecar in node output only
                #  - Output json          -> return json sidecar in node output only
                #  - Save to file - text  -> return text sidecar AND write .txt file(s)
                #  - Save to file - json  -> return json sidecar AND write .json file(s)
                # Backwards compatibility: legacy values like 'none', 'save to file (txt)', 'save to file (json)' still parsed in _normalize_sidecar.
                "sidecar_format": ([
                    "Output text",
                    "Output json",
                    "Save to file - text",
                    "Save to file - json"
                ], {"default": "Output text", "tooltip": "Sidecar output format and file saving: choose Output (text/json) or also Save to file (text/json)."}),
                # Boolean control: True saves images to output folder, False only writes temp previews (no output files or sidecars)
                "save_image": ("BOOLEAN", {"default": True, "tooltip": "True: save images to output path. False: only generate previews (saved into temp directory)."}),
                "positive_prompt": ("STRING", {"forceInput": True, "default": "", "tooltip": "Positive prompt text to embed in metadata."}),
                "negative_prompt": ("STRING", {"forceInput": True, "default": "", "tooltip": "Negative prompt text to embed in metadata."}),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("filename", "sidecar_text")
    FUNCTION = "save_files"
    OUTPUT_NODE = True
    CATEGORY = "AUN Nodes/Image"
    DESCRIPTION = "A versatile image saver with advanced filename customization and metadata embedding."

    def _get_model_hash(self, modelname):
        """Calculates the SHA256 hash of the model file."""
        if not modelname:
            return ""
        try:
            ckpt_path = folder_paths.get_full_path("checkpoints", modelname)
            if ckpt_path and os.path.exists(ckpt_path):
                 return get_sha256(ckpt_path)[:10]
        except Exception:
            pass # Ignore errors if the model isn't found
        return ""

    def _prepare_metadata_comment(self, **kwargs):
        """Prepares the metadata comment string."""
        short_sampler = get_short_name(kwargs.get('sampler_name', ''), SAMPLER_SHORT_NAMES)
        short_scheduler = get_short_name(kwargs.get('scheduler', ''), SCHEDULER_SHORT_NAMES)
        
        scheduler_part = f"_{short_scheduler}" if short_scheduler != 'Normal' else ''

        return (f"Steps: {kwargs.get('steps', 0)}, Sampler: {short_sampler}{scheduler_part}, "
                f"CFG Scale: {kwargs.get('cfg', 0.0):.1f}, Seed: {kwargs.get('seed_value', 0)}, "
                f"Model: {kwargs.get('basemodelname', '')}, Model Hash: {kwargs.get('modelhash', '')}, Version: ComfyUI")

    def _create_output_path(self, path_pattern):
        """Creates the output directory if it doesn't exist."""
        full_output_path = os.path.join(self.output_dir, path_pattern)
        if not os.path.exists(full_output_path):
            print(f"Path '{full_output_path}' doesn't exist. Creating directory.")
            os.makedirs(full_output_path, exist_ok=True)
        return full_output_path

    def save_files(self, images, filename, path, extension, **kwargs):
        try:
            preview = kwargs.get("preview", "enabled")
            modelname = kwargs.get("modelname", "")            
            basemodelname = os.path.splitext(os.path.basename(modelname))[0]
            model_short = get_model_short_name(modelname)
            # Normalize sidecar selection: returns (format, save_to_file)
            # New UI options (2025-10):
            #   "Output text"         -> (text, False)
            #   "Output json"         -> (json, False)
            #   "Save to file - text" -> (text, True)
            #   "Save to file - json" -> (json, True)
            # Legacy values handled for workflows saved before update:
            #   "none" -> (text, False)
            #   "save to file (txt)" -> (text, True)
            #   "save to file (json)" -> (json, True)
            #   plus various synonym spellings already supported.
            # NOTE: The node always returns a sidecar_text output (never suppressed). The option only controls
            #       (a) the format of that output (text vs json) and (b) whether per-image sidecar files are also written.
            def _normalize_sidecar(choice: str | None) -> tuple[str, bool]:
                c_raw = (choice or "").strip()
                c = c_raw.lower()
                # Direct new option mapping
                if c == "output text":
                    return ("text", False)
                if c == "output json":
                    return ("json", False)
                if c == "save to file - text":
                    return ("text", True)
                if c == "save to file - json":
                    return ("json", True)
                # Legacy / synonym handling
                if c in {"none", "off", "disabled"}:
                    return ("text", False)
                if c in {"save to file (txt)", "save to file txt", "save txt", "text (save)", "txt (save)", "text save", "text save to file"}:
                    return ("text", True)
                if c in {"save to file (json)", "save to file json", "save json", "json (save)", "json save", "json save to file"}:
                    return ("json", True)
                if c in {"text", "txt"}:
                    return ("text", False)
                if c in {"json", "jsn"}:
                    return ("json", False)
                # Fallback default
                return ("text", False)
            # Extract enabled LoRAs (with strengths) from prompt/workflow
            def _fmt_strength(v):
                try:
                    if v is None:
                        return None
                    # Compact formatting up to 2 decimals
                    s = f"{float(v):.2f}".rstrip('0').rstrip('.')
                    return s
                except Exception:
                    return None

            def _fmt_strength_display(v):
                try:
                    if v is None:
                        return None
                    return f"{float(v):.2f}"
                except Exception:
                    return None

            lora_items = extract_loras(kwargs.get("prompt"), kwargs.get("extra_pnginfo"))

            prompt_lora_names: set[str] = set()

            def _collect_lora_name_variants(raw_name: str | None) -> set[str]:
                variants: set[str] = set()
                if not isinstance(raw_name, str) or not raw_name:
                    return variants
                lower = raw_name.lower()
                if lower:
                    variants.add(lower)
                base = os.path.basename(raw_name).lower()
                if base:
                    variants.add(base)
                stem = os.path.splitext(base)[0]
                if stem:
                    variants.add(stem)
                return variants

            for prompt_key in ("positive_prompt", "negative_prompt", "lora_prompt"):
                text_val = kwargs.get(prompt_key)
                if not isinstance(text_val, str):
                    continue
                for tag in _parse_lora_tag_text(text_val):
                    tag_name = tag.get("name") if isinstance(tag, dict) else None
                    prompt_lora_names.update(_collect_lora_name_variants(tag_name))

            # Filter lora_items: if it's from a text-based loader (like LoraTagLoader),
            # it MUST be present in the final text prompts to be included.
            filtered_items: list[Any] = []
            for item in lora_items:
                if isinstance(item, dict):
                    origin = str(item.get("origin") or "").lower()
                    # We consider LoraTagLoader and other text-based loaders as candidates for filtering
                    if origin in ("loratagloader", "textbasedlora"):
                        item_name = item.get("name")
                        if not isinstance(item_name, str) or not item_name:
                            continue
                        name_variants = _collect_lora_name_variants(item_name)
                        if not (name_variants & prompt_lora_names):
                            continue
                filtered_items.append(item)
            lora_items = filtered_items

            lora_tokens_short = []
            lora_power_lines = []
            for item in lora_items:
                raw = item.get('name')
                if not raw:
                    continue
                # Map LoRA name to a short alias (with fallback auto-shortening)
                base_short = get_lora_short_name(os.path.splitext(os.path.basename(raw))[0])
                base_raw = os.path.splitext(os.path.basename(raw))[0]
                sm = item.get('strength')
                sc = item.get('strengthTwo') or item.get('strength_clip')
                sm_s = _fmt_strength(sm)
                sc_s = _fmt_strength(sc)
                sm_disp = _fmt_strength_display(sm)
                sc_disp = _fmt_strength_display(sc)
                # Build short token (for filename tokens)
                if base_short:
                    if sm_s and sc_s and sm_s != sc_s:
                        lora_tokens_short.append(f"{base_short}@{sm_s}-{sc_s}")
                    elif sm_s:
                        lora_tokens_short.append(f"{base_short}@{sm_s}")
                    else:
                        lora_tokens_short.append(base_short)
                if base_raw:
                    tag = f"<lora:{base_raw}"
                    if sm_disp:
                        tag += f":{sm_disp}"
                    if sc_disp:
                        tag += f":{sc_disp}"
                    tag += ">"
                    lora_power_lines.append(tag)
            # Choose delimiter for joining LoRAs
            allowed = set(['+', '-', '_', '.', ' ', ',', ';'])
            delim_raw = kwargs.get("loras_delimiter", "+")
            d = "+"
            if isinstance(delim_raw, str) and len(delim_raw) > 0:
                for ch in delim_raw:
                    if ch in allowed:
                        d = ch
                        break
            loras_joined_short = d.join([t for t in lora_tokens_short if t])
            loras_group = f"(LORAS-{loras_joined_short})" if loras_joined_short else ""
            # Raw loras for sidecar (Power Lora Loader style block)
            loras_group_raw = ""
            if lora_power_lines:
                formatted = "\n".join(line.strip() for line in lora_power_lines)
                loras_group_raw = f"PowerLoraLoader loras:\n{formatted}".strip()
            modelhash = self._get_model_hash(modelname)
            replacements = {
                "date": get_timestamp("%Y-%m-%d"),
                "time": get_timestamp(kwargs.get("time_format", "%Y%m%d-%H%M%S")),
                "basemodelname": basemodelname,
                "model": os.path.basename(modelname),
                "modelname": os.path.basename(modelname),
                "model_short": model_short,
                "basemodelshort": model_short,
                "modelname_short": model_short,
                "basemodelname_short": model_short,
                # Consolidated: %loras now produces grouped format; %loras_group is an alias
                "loras": loras_group,
                "loras_group": loras_group,
                "sampler_name": get_short_name(kwargs.get("sampler_name", ""), SAMPLER_SHORT_NAMES),
                "scheduler": get_short_name(kwargs.get("scheduler", ""), SCHEDULER_SHORT_NAMES),
                "steps": kwargs.get("steps", 20),
                "cfg": f'{kwargs.get("cfg", 8.0):.1f}',
                "denoise": kwargs.get("denoise", 1.0),
                "seed": kwargs.get("seed_value", 0),
            }

            filename_prefix = generate_path_from_pattern(filename, replacements)
            full_path_pattern = generate_path_from_pattern(path, replacements)
            
            output_path = self._create_output_path(full_path_pattern)
            
            metadata_comment = self._prepare_metadata_comment(basemodelname=basemodelname, modelhash=modelhash, **kwargs)

            # Prepare sidecar context
            try:
                batch_count = len(images)
            except Exception:
                batch_count = 1
            # Extract prompts once for sidecar
            _pos_prompt = kwargs.get("positive_prompt", "")
            _neg_prompt = kwargs.get("negative_prompt", "")

            # Strip LoRA tags from prompts for sidecar to avoid duplication
            if isinstance(_pos_prompt, str):
                _pos_prompt = re.sub(_LORA_TAG_PATTERN, "", _pos_prompt)
                _pos_prompt = re.sub(r',\s*,', ',', _pos_prompt)
                _pos_prompt = re.sub(r'\s+', ' ', _pos_prompt).strip(' ,')
            if isinstance(_neg_prompt, str):
                _neg_prompt = re.sub(_LORA_TAG_PATTERN, "", _neg_prompt)
                _neg_prompt = re.sub(r',\s*,', ',', _neg_prompt)
                _neg_prompt = re.sub(r'\s+', ' ', _neg_prompt).strip(' ,')

            sidecar_context = {
                # removed: filename_prefix, subfolder, modelname, basemodelname
                "extension": extension,
                "seed": kwargs.get("seed_value", 0),
                "steps": kwargs.get("steps", 20),
                "cfg": f'{kwargs.get("cfg", 8.0):.1f}',
                "model": os.path.basename(modelname),
                "model_short": model_short,
                # Use non-shortened names for sidecar
                "sampler_name": kwargs.get("sampler_name", ""),
                "scheduler": kwargs.get("scheduler", ""),
                "loras": loras_group_raw,
                "positive_prompt": _pos_prompt,
                "negative_prompt": _neg_prompt,
                "count": batch_count,
                "timestamp": get_timestamp("%Y-%m-%d %H:%M:%S"),
            }

            # Determine sidecar behavior
            selected_sidecar = kwargs.get("sidecar_format", "none")
            sidecar_fmt, sidecar_save = _normalize_sidecar(selected_sidecar)
            # Backward compatibility: map legacy 'save_mode' (string) to new boolean 'save_image'
            if 'save_mode' in kwargs and 'save_image' not in kwargs:
                sm_val = str(kwargs.get('save_mode')).strip().lower()
                if sm_val in ("preview only", "preview", "false", "no", "0"):
                    kwargs['save_image'] = False
                else:
                    kwargs['save_image'] = True
            save_image = bool(kwargs.get("save_image", True))
            preview_only = not save_image
            if preview_only:
                # Never write sidecar files in preview-only mode
                sidecar_save = False

            if not preview_only:
                saved_filenames = self.save_images_to_disk(
                    images, output_path, filename_prefix, metadata_comment,
                    extension, kwargs.get("prompt"), kwargs.get("extra_pnginfo"),
                    sidecar_fmt,
                    sidecar_context,
                    sidecar_save=sidecar_save,
                )
            else:
                # Preview-only: save images into the ComfyUI temp directory so UI can display them without populating output folder.
                try:
                    temp_dir = folder_paths.get_temp_directory()
                except Exception:
                    # Fallback to output directory if temp unavailable
                    temp_dir = output_path
                if not os.path.exists(temp_dir):
                    os.makedirs(temp_dir, exist_ok=True)
                saved_filenames = []
                for i, image_tensor in enumerate(images):
                    img_array = np.clip(255. * image_tensor.cpu().numpy(), 0, 255).astype(np.uint8)
                    img = Image.fromarray(img_array)
                    # Resolve batch placeholder for this index
                    this_prefix = filename_prefix.replace('%batch_num', str(i+1)).replace('%batch_number', str(i+1))
                    # Use a short unique suffix in temp to avoid collisions
                    temp_name = f"{this_prefix}_tmp{i+1}.{extension}"
                    temp_path = os.path.join(temp_dir, temp_name)
                    try:
                        if extension == 'png':
                            png_info = PngInfo()
                            png_info.add_text("parameters", metadata_comment)
                            img.save(temp_path, pnginfo=png_info, optimize=True)
                        else:
                            img.save(temp_path, optimize=True, quality=90)
                    except Exception:
                        pass
                    saved_filenames.append(temp_name)
                # NOTE: No sidecar files are written in preview-only mode.

            # Determine the final filename prefix to return (batch placeholder resolved to last image index)
            try:
                batch_count = len(images)
            except Exception:
                batch_count = 1
            final_return_prefix = filename_prefix
            for ph in ("%batch_num", "%batch_number"):
                final_return_prefix = final_return_prefix.replace(ph, str(batch_count if batch_count > 0 else 1))

            # Produce sidecar text output always, matching selected format when possible
            def _format_sidecar(record: Dict[str, Any], fmt: str) -> str:
                if fmt == "json":
                    try:
                        return json.dumps(record, ensure_ascii=False, indent=2)
                    except Exception:
                        return json.dumps(record, ensure_ascii=False)
                # text format
                lines = []
                for k, v in record.items():
                    try:
                        if k == "loras" and isinstance(v, list):
                            for item in v:
                                lines.append(item)
                        elif isinstance(v, list):
                            for item in v:
                                lines.append(f"{k}: {item}")
                        else:
                            vv = json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v
                            lines.append(f"{k}: {vv}")
                    except Exception:
                        lines.append(f"{k}: {v}")
                return "\n".join(lines)

            sidecar_text = ""
            try:
                if saved_filenames:
                    last_file = saved_filenames[-1]
                    # Build record similar to on-disk sidecar
                    record = dict(sidecar_context)
                    record.update({
                        "filename": last_file,
                        "batch_num": batch_count if batch_count > 0 else 1,
                        "extension": extension,
                    })
                    sidecar_text = _format_sidecar(record, sidecar_fmt)
            except Exception:
                sidecar_text = ""

            result: Dict[str, Any] = {"result": (final_return_prefix, sidecar_text)}
            if preview == "enabled":
                if not preview_only:
                    subfolder = os.path.normpath(full_path_pattern)
                    result["ui"] = {"images": [{"filename": fname, "subfolder": subfolder if subfolder != '.' else '', "type": self.type} for fname in saved_filenames]}
                else:
                    # For preview-only images saved to temp, set type to 'temp' and subfolder ''
                    result["ui"] = {"images": [{"filename": fname, "subfolder": '', "type": 'temp'} for fname in saved_filenames]}
            else:
                result.setdefault("ui", {"images": []})
            
            return result

        except Exception as e:
            print(f"Error in AUNSaveImage: {e}")
            return {"ui": {"images": []}, "result": (None,)}

    def save_images_to_disk(self, images, output_path, filename_prefix, comment, extension, prompt, extra_pnginfo,
                            sidecar_format: str = "text",
                            sidecar_context: Dict[str, Any] | None = None,
                            sidecar_save: bool = False):
        saved_filenames = []
        for i, image_tensor in enumerate(images):
            img_array = np.clip(255. * image_tensor.cpu().numpy(), 0, 255).astype(np.uint8)
            img = Image.fromarray(img_array)

            # Support both %batch_num and %batch_number placeholders
            final_filename_prefix = filename_prefix
            for ph in ("%batch_num", "%batch_number"):
                final_filename_prefix = final_filename_prefix.replace(ph, str(i+1))
            unique_prefix = self.get_unique_filename(output_path, final_filename_prefix, extension)
            
            file_path = f"{unique_prefix}.{extension}"
            full_file_path = os.path.join(output_path, file_path)

            if extension == 'png':
                png_info = PngInfo()
                png_info.add_text("parameters", comment)
                if prompt:
                    png_info.add_text("prompt", json.dumps(prompt)) 
                if extra_pnginfo:
                    for key, value in extra_pnginfo.items():
                        png_info.add_text(key, json.dumps(value))
                # Add LoRA information to PNG metadata
                if sidecar_context and "loras" in sidecar_context:
                    png_info.add_text("loras", json.dumps(sidecar_context["loras"]))
                img.save(full_file_path, pnginfo=png_info, optimize=True)
            else:
                img.save(full_file_path, optimize=True, quality=95)
                exif_bytes = piexif.dump({"Exif": {piexif.ExifIFD.UserComment: piexif.helper.UserComment.dump(comment, encoding="unicode")}})
                piexif.insert(exif_bytes, full_file_path)
            
            saved_filenames.append(file_path)

            # Sidecar writing per image (always include all known fields; add prompt/workflow if available)
            try:
                if sidecar_save:
                    # Build base context
                    ctx = dict(sidecar_context or {})
                    # Per-image specifics
                    ctx.update({
                        "filename": file_path,
                       # "index": i + 1,
                        "batch_num": i + 1,
                        "extension": extension,
                    })
                    record = ctx.copy()
                    # Write
                    base_no_ext, _ = os.path.splitext(full_file_path)
                    if sidecar_format == "json":
                        sidecar_path = base_no_ext + ".json"
                        with open(sidecar_path, "w", encoding="utf-8") as f:
                            json.dump(record, f, ensure_ascii=False, indent=2)
                    else:
                        sidecar_path = base_no_ext + ".txt"
                        with open(sidecar_path, "w", encoding="utf-8") as f:
                            for k, v in record.items():
                                try:
                                    if isinstance(v, list):
                                        for item in v:
                                            f.write(f"{k}: {item}\n")
                                    else:
                                        vv = json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v
                                        f.write(f"{k}: {vv}\n")
                                except Exception:
                                    f.write(f"{k}: {v}\n")
            except Exception:
                # Sidecar writing should never break saving images
                pass
        return saved_filenames

    def get_unique_filename(self, output_path, filename_prefix, extension):
        i = 1
        while True:
            suffix = f"_{i:03}" if i > 1 else ""
            full_path = os.path.join(output_path, f"{filename_prefix}{suffix}.{extension}")
            if not os.path.exists(full_path):
                return f"{filename_prefix}{suffix}"
            i += 1

NODE_CLASS_MAPPINGS = {"AUNSaveImage": AUNSaveImage}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNSaveImage": "AUN Save Image"}