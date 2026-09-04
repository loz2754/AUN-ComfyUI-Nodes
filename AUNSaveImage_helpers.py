"""Private helpers for AUNSaveImage (extracted from AUNSaveImage.py).

Not a node module: no NODE_CLASS_MAPPINGS here. Imported by AUNSaveImage.py.
"""
import os
from datetime import datetime
import re
from typing import Any, Dict
from .aun_lora_extraction_shared import (
    BASIC_LORA_TARGET_NAMES,
    STACK_LORA_NODE_NAMES,
    extract_basic_loras_from_inputs,
)


# --- Constants ---




# --- Helper Functions ---

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


_WINDOWS_RESERVED_NAMES = {
    'con', 'prn', 'aux', 'nul',
    *(f'com{i}' for i in range(1, 10)),
    *(f'lpt{i}' for i in range(1, 10)),
}


def _sanitize_subfolder_path(value: Any) -> str:
    """Sanitize a user-provided *subfolder* path.

    Goal: allow nested subfolders under the ComfyUI output directory, while preventing:
    - absolute paths / drive letters
    - path traversal (..)
    - Windows-illegal characters
    """
    if value is None:
        return ""
    s = str(value).strip()
    if not s:
        return ""

    # Normalize separators to simplify splitting.
    s = s.replace('\\', '/')

    # Strip any drive letter prefix like C: or N:
    s = re.sub(r'^[A-Za-z]:', '', s)

    # Strip leading slashes to avoid absolute paths.
    while s.startswith('/'):
        s = s[1:]

    parts: list[str] = []
    for raw_part in s.split('/'):
        part = str(raw_part).strip()
        if not part or part == '.':
            continue
        if part == '..':
            # Drop traversal segments.
            continue

        # Remove characters disallowed on Windows and most filesystems.
        part = re.sub(r'[<>:"/\\|?*\x00-\x1F]', '', part)

        # Windows: no trailing dots/spaces.
        part = part.rstrip(' .')
        if not part:
            continue

        # Windows reserved device names (case-insensitive) cannot be used as path segments.
        if part.lower() in _WINDOWS_RESERVED_NAMES:
            part = f"_{part}"

        parts.append(part)

    return os.path.join(*parts) if parts else ""


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

        basic_items = extract_basic_loras_from_inputs(normalized_inputs)
        for entry in basic_items:
            add_item(
                entry.get('name'),
                entry.get('strength'),
                entry.get('strengthTwo'),
            )
        # Handle multiple loras like lora_name_1, lora_name_2, etc. (for LoraManager or similar)
        if not items and node_type not in STACK_LORA_NODE_NAMES:
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
        if not items and (not node_type or (node_type not in LORA_TAG_LOADER_NAMES and node_type not in STACK_LORA_NODE_NAMES)):
            source_to_search = inputs if isinstance(inputs, dict) else normalized_inputs
            items.extend(_find_lora_entries(source_to_search))

        # Specialized handling for AUNRandomLoraModelOnly: extract only the selected lora
        if node_type and 'AUNRandomLoraModelOnly' in node_type:
            try:
                mode = str(normalized_inputs.get('mode', 'Random') or 'Random')
                
                # Only extract if we can determine statically (Select mode with direct value)
                if mode == 'Select':
                    # Try to get select_idx, but handle external connections gracefully
                    select_val = normalized_inputs.get('select', 1)
                    select_idx = None
                    try:
                        # If it's a direct value, convert to int
                        if not isinstance(select_val, (dict, list)):
                            select_idx = int(select_val or 1)
                    except Exception:
                        pass
                    
                    # Only extract if we have a deterministic select_idx
                    if select_idx is not None:
                        lora_key = f'lora_{select_idx}'
                        selected_lora = normalized_inputs.get(lora_key)
                        
                        if isinstance(selected_lora, str) and selected_lora and selected_lora != 'None':
                            add_item(
                                selected_lora,
                                normalized_inputs.get('strength_model', 1.0),
                                normalized_inputs.get('strength_clip', 1.0),
                                origin_override='AUNRandomLoraModelOnly'
                            )
                # For Random/Increment/Range modes or external select connections, don't extract statically.
                # User should connect the selected_lora output to capture the actual runtime value.
            except Exception:
                pass

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
        *BASIC_LORA_TARGET_NAMES,
        "Lora Loader",
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
        "AUNLoraLoaderModelOnlyFromString",
        "AUNLoraStackWithTriggers",
        "AUNLoraStackWithTriggersModelClip",
        "AUNRandomLoraModelOnly",
        "AUNExtractPowerLoras",
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
        normalized_format = str(time_format or "%Y%m%d-%H%M%S")
        mapping = [
            ("yyyy", "%Y"),
            ("MM", "%m"),
            ("dd", "%d"),
            ("HH", "%H"),
            ("mm", "%M"),
            ("ss", "%S"),
            ("yy", "%y"),
            ("M", "%m"),
            ("d", "%d"),
            ("H", "%H"),
            ("m", "%M"),
            ("s", "%S"),
        ]
        for java_token, python_token in mapping:
            normalized_format = re.sub(rf"(?<!%)\b{java_token}\b", python_token, normalized_format)
        return datetime.now().strftime(normalized_format)
    except:
        return datetime.now().strftime("%Y%m%d-%H%M%S")


def build_sidecar_timestamp(date_format):
    """Build a sidecar timestamp without duplicating time tokens."""
    normalized_format = str(date_format or "%Y%m%d-%H%M%S")
    if "%H" not in normalized_format and "%M" not in normalized_format and "%S" not in normalized_format:
        normalized_format = normalized_format + " %H:%M:%S"
    return get_timestamp(normalized_format)

def generate_path_from_pattern(pattern, replacements):
    """Replace both canonical %token% and legacy %token placeholders."""
    resolved = str(pattern)

    def _java_to_python_datefmt(fmt: str) -> str:
        mapping = [
            ("yyyy", "%Y"),
            ("MM", "%m"),
            ("dd", "%d"),
            ("HH", "%H"),
            ("mm", "%M"),
            ("ss", "%S"),
            ("yy", "%y"),
            ("M", "%m"),
            ("d", "%d"),
            ("H", "%H"),
            ("m", "%M"),
            ("s", "%S"),
        ]
        out = fmt
        for java_token, python_token in mapping:
            out = re.sub(rf"(?<!%)\b{java_token}\b", python_token, out)
        return out

    def _replace_datetime_placeholders(text: str) -> str:
        now = datetime.now()

        def _repl(match):
            kind = match.group(1)
            raw_fmt = match.group(2)
            fmt = _java_to_python_datefmt(raw_fmt)
            try:
                return now.strftime(fmt)
            except Exception:
                return now.strftime("%Y-%m-%d" if kind == "date" else "%H-%M-%S")

        return re.sub(r"%(date|time):([^%]+)%", _repl, text)

    resolved = _replace_datetime_placeholders(resolved)

    # Replace longer placeholders first to avoid substring collisions.
    for placeholder in sorted(replacements.keys(), key=len, reverse=True):
        value = replacements[placeholder]
        replacement = "" if value is None else str(value)
        resolved = resolved.replace(f"%{placeholder}%", replacement)
        resolved = resolved.replace(f"%{placeholder}", replacement)
    return resolved

