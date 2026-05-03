import random
import time
import builtins
import re


class AUNRandomModelBundleSwitch:
    MAX_SLOTS = 10

    def __init__(self):
        self.index = None
        self.range_index = 0
        self._rng = random.SystemRandom()

    @classmethod
    def INPUT_TYPES(cls):
        required = {
            "mode": (
                ["None", "Select", "Increment", "Random", "Range"],
                {
                    "default": "Select",
                    "tooltip": "Selection mode for active slot.",
                },
            ),
            "slot_count": (
                "INT",
                {
                    "default": 3,
                    "min": 1,
                    "max": cls.MAX_SLOTS,
                    "tooltip": "How many slots are active from top to bottom.",
                },
            ),
            "select": (
                "INT",
                {
                    "default": 1,
                    "min": 1,
                    "max": cls.MAX_SLOTS,
                    "tooltip": "Slot index used in Select mode.",
                },
            ),
            "minimum": (
                "INT",
                {
                    "default": 1,
                    "min": 1,
                    "max": cls.MAX_SLOTS,
                    "tooltip": "Minimum slot index for Increment/Random.",
                },
            ),
            "maximum": (
                "INT",
                {
                    "default": 3,
                    "min": 1,
                    "max": cls.MAX_SLOTS,
                    "tooltip": "Maximum slot index for Increment/Random.",
                },
            ),
            "range": (
                "STRING",
                {
                    "default": "1,2,3",
                    "multiline": False,
                    "tooltip": "Comma-separated explicit index range for Range mode (for example 1,3,5-6).",
                },
            ),
        }

        optional = {}
        optional["base_model"] = (
            "MODEL",
            {
                "tooltip": "Unpatched model passthrough used when mode is None.",
            },
        )
        for i in range(1, cls.MAX_SLOTS + 1):
            optional[f"model_{i}"] = (
                "MODEL",
                {
                    "tooltip": f"Model input for slot {i}.",
                },
            )
            optional[f"text_{i}"] = (
                "STRING",
                {
                    "tooltip": f"Optional text metadata for slot {i}.",
                    "forceInput": True,
                },
            )
            optional[f"label_{i}"] = (
                "STRING",
                {
                    "tooltip": f"Optional custom label for slot {i}.",
                    "forceInput": True,
                },
            )

        hidden = {
            "prompt": "PROMPT",
            "unique_id": "UNIQUE_ID",
            "extra_pnginfo": "EXTRA_PNGINFO",
        }

        return {"required": required, "optional": optional, "hidden": hidden}

    RETURN_TYPES = ("MODEL", "STRING", "INT", "STRING")
    RETURN_NAMES = ("MODEL", "selected_text", "index", "label")
    FUNCTION = "switch"
    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = (
        "Selects one model and optional text/label pair using None, Select, Increment, Random, or Range modes. "
        "TIP: Double-click the node or right-click and select 'Compact mode' to hide configuration widgets."
    )

    def _clamp_range(self, minimum, maximum, slot_count):
        max_slot = max(1, min(int(slot_count or self.MAX_SLOTS), self.MAX_SLOTS))
        min_val = max(1, min(int(minimum or 1), max_slot))
        max_val = max(1, min(int(maximum or max_slot), max_slot))
        if min_val > max_val:
            min_val, max_val = max_val, min_val
        return min_val, max_val

    def _parse_range_string(self, range_str, min_val, max_val):
        valid_indices = []
        try:
            for part in str(range_str or "").split(","):
                part = part.strip()
                if not part:
                    continue
                if "-" in part:
                    start_str, end_str = part.split("-", 1)
                    start = int(start_str.strip())
                    end = int(end_str.strip())
                    if start > end:
                        start, end = end, start
                    valid_indices.extend(list(range(start, end + 1)))
                else:
                    valid_indices.append(int(part))
        except Exception:
            pass

        valid_indices = [idx for idx in valid_indices if min_val <= idx <= max_val]
        if not valid_indices:
            valid_indices = [min_val]
        return sorted(set(valid_indices))

    def _first_non_empty(self, indices, model_map):
        for idx in indices:
            if model_map.get(idx) is not None:
                return idx
        return None

    def _next_filled_from(self, start_idx, candidate_indices, model_map):
        if not candidate_indices:
            return None
        ordered = sorted(set(candidate_indices))
        if start_idx not in ordered:
            return self._first_non_empty(ordered, model_map)

        start_pos = ordered.index(start_idx)
        total = len(ordered)
        for step in range(total):
            idx = ordered[(start_pos + step) % total]
            if model_map.get(idx) is not None:
                return idx
        return None

    def _pick_index(self, mode, select, minimum, maximum, range_str, candidate_indices, slot_count):
        if not candidate_indices:
            return None

        min_val, max_val = self._clamp_range(minimum, maximum, slot_count)
        clamped_candidates = [idx for idx in candidate_indices if min_val <= idx <= max_val]
        if not clamped_candidates:
            clamped_candidates = candidate_indices

        if mode == "Random":
            return self._rng.choice(clamped_candidates)

        if mode == "Increment":
            if self.index is None or self.index not in clamped_candidates:
                self.index = clamped_candidates[0]
                return self.index
            next_pos = (clamped_candidates.index(self.index) + 1) % len(clamped_candidates)
            self.index = clamped_candidates[next_pos]
            return self.index

        if mode == "Range":
            valid_indices = self._parse_range_string(range_str, min_val, max_val)
            valid_candidates = [idx for idx in valid_indices if idx in candidate_indices]
            if not valid_candidates:
                valid_candidates = clamped_candidates
            if self.range_index >= len(valid_candidates):
                self.range_index = 0
            chosen = valid_candidates[self.range_index]
            self.range_index = (self.range_index + 1) % len(valid_candidates)
            return chosen

        select_idx = max(1, min(int(select or 1), max(1, min(int(slot_count or self.MAX_SLOTS), self.MAX_SLOTS))))
        return select_idx

    def _find_prompt_node(self, prompt, node_id):
        if not isinstance(prompt, dict) or not node_id:
            return None

        nid = str(node_id).strip()
        if nid in prompt:
            return prompt[nid]

        def id_matches_key(key, wanted):
            key_str = str(key)
            if key_str == wanted:
                return True
            if key_str.endswith("." + wanted) or key_str.endswith(":" + wanted) or key_str.endswith("/" + wanted):
                return True
            tokens = re.split(r"[^A-Za-z0-9_]+", key_str)
            return bool(tokens) and tokens[-1] == wanted

        for key, value in prompt.items():
            if id_matches_key(key, nid):
                return value
        return None

    def _resolve_connected_title(self, idx, prompt, unique_id):
        if not isinstance(prompt, dict):
            return ""

        current_node = self._find_prompt_node(prompt, unique_id)
        if not isinstance(current_node, dict):
            return ""

        inputs = current_node.get("inputs", {})
        model_link = inputs.get(f"model_{idx}")
        if not (isinstance(model_link, list) and len(model_link) >= 1):
            return ""

        source_node = self._find_prompt_node(prompt, model_link[0])
        if not isinstance(source_node, dict):
            return ""

        title = source_node.get("_meta", {}).get("title")
        if isinstance(title, str) and title.strip():
            return title.strip()

        class_name = source_node.get("class_type")
        if isinstance(class_name, str) and class_name.strip():
            return class_name.strip()

        return ""

    def _extract_node_title(self, node):
        if not isinstance(node, dict):
            return ""
        candidates = [
            node.get("title"),
            node.get("_meta", {}).get("title") if isinstance(node.get("_meta"), dict) else None,
            node.get("properties", {}).get("Node name for S&R") if isinstance(node.get("properties"), dict) else None,
            node.get("class_type"),
            node.get("type"),
        ]
        for candidate in candidates:
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        return ""

    def _find_workflow_node(self, workflow, wanted_id):
        wanted = str(wanted_id).strip()
        if not wanted:
            return None

        def search_nodes(nodes):
            if not isinstance(nodes, list):
                return None
            for node in nodes:
                if not isinstance(node, dict):
                    continue
                if str(node.get("id")) == wanted:
                    return node
                nested = node.get("nodes")
                found = search_nodes(nested)
                if found:
                    return found
            return None

        top_found = search_nodes(workflow.get("nodes")) if isinstance(workflow, dict) else None
        if top_found:
            return top_found

        definitions = workflow.get("definitions", {}) if isinstance(workflow, dict) else {}
        subgraphs = definitions.get("subgraphs", []) if isinstance(definitions, dict) else []
        for subgraph in subgraphs:
            found = search_nodes(subgraph.get("nodes") if isinstance(subgraph, dict) else None)
            if found:
                return found
        return None

    def _find_workflow_node_and_subgraph(self, workflow, wanted_id):
        wanted = str(wanted_id).strip()
        if not wanted or not isinstance(workflow, dict):
            return (None, None)

        nodes = workflow.get("nodes")
        if isinstance(nodes, list):
            for node in nodes:
                if isinstance(node, dict) and str(node.get("id")) == wanted:
                    return (node, None)

        definitions = workflow.get("definitions", {})
        subgraphs = definitions.get("subgraphs", []) if isinstance(definitions, dict) else []
        if isinstance(subgraphs, list):
            for subgraph in subgraphs:
                if not isinstance(subgraph, dict):
                    continue
                sg_name = str(subgraph.get("name") or "").strip() or None
                for node in subgraph.get("nodes", []) or []:
                    if isinstance(node, dict) and str(node.get("id")) == wanted:
                        return (node, sg_name)
        return (None, None)

    def _resolve_connected_title_from_workflow(self, idx, extra_pnginfo, unique_id):
        workflow = extra_pnginfo.get("workflow") if isinstance(extra_pnginfo, dict) else None
        if not isinstance(workflow, dict):
            return ""

        uid = str(unique_id or "").strip()
        if not uid:
            return ""

        # unique_id can be namespaced (for subgraphs): use trailing token as node id.
        uid_tokens = re.split(r"[^A-Za-z0-9_]+", uid)
        current_node_id = uid_tokens[-1] if uid_tokens else uid
        current_node = self._find_workflow_node(workflow, current_node_id)
        if not isinstance(current_node, dict):
            return ""

        # Workflow schema stores inputs as a list with `name` and optional `link` id.
        inputs = current_node.get("inputs")
        if not isinstance(inputs, list):
            return ""
        link_id = None
        input_name = f"model_{idx}"
        for input_entry in inputs:
            if not isinstance(input_entry, dict):
                continue
            if input_entry.get("name") == input_name:
                link_id = input_entry.get("link")
                break
        if link_id is None:
            return ""

        source_node_id = None
        links = workflow.get("links")
        if isinstance(links, list):
            for link_entry in links:
                if not isinstance(link_entry, list) or len(link_entry) < 4:
                    continue
                if link_entry[0] == link_id:
                    source_node_id = link_entry[1]
                    break
        if source_node_id is None:
            return ""

        source_node, owner_subgraph_name = self._find_workflow_node_and_subgraph(workflow, source_node_id)
        if owner_subgraph_name:
            return owner_subgraph_name

        # If the source is a subgraph wrapper node, prefer the subgraph definition name.
        if isinstance(source_node, dict):
            source_type = str(source_node.get("type") or "").strip()
            definitions = workflow.get("definitions", {}) if isinstance(workflow, dict) else {}
            subgraphs = definitions.get("subgraphs", []) if isinstance(definitions, dict) else []
            if source_type and isinstance(subgraphs, list):
                for subgraph in subgraphs:
                    if not isinstance(subgraph, dict):
                        continue
                    if str(subgraph.get("id") or "").strip() == source_type:
                        sg_name = str(subgraph.get("name") or "").strip()
                        if sg_name:
                            return sg_name

        return self._extract_node_title(source_node)

    def _derive_label(self, idx, kwargs):
        label = str(kwargs.get(f"label_{idx}", "") or "").strip()
        if label:
            return label

        text_val = str(kwargs.get(f"text_{idx}", "") or "").strip()
        if text_val:
            first_line = text_val.splitlines()[0].strip()
            if first_line:
                return first_line[:42]

        return f"slot_{idx}"

    def _normalize_text(self, value):
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        if isinstance(value, (list, tuple)):
            normalized_items = [str(item) for item in value if item is not None]
            return "\n".join(normalized_items)
        return str(value)

    def _emit_selected_index(self, unique_id, index, mode):
        if unique_id is None:
            return
        try:
            from server import PromptServer  # type: ignore[import-not-found]
            node_id = unique_id[0] if isinstance(unique_id, (list, tuple)) and unique_id else unique_id
            PromptServer.instance.send_sync(
                "AUN_random_model_bundle_selected",
                {
                    "node_id": str(node_id),
                    "index": int(index),
                    "mode": str(mode),
                },
            )
        except Exception:
            pass

    def switch(
        self,
        mode,
        slot_count,
        select,
        minimum,
        maximum,
        range,
        prompt=None,
        unique_id=None,
        extra_pnginfo=None,
        **kwargs,
    ):
        base_model = kwargs.get("base_model")
        active_slot_count = max(1, min(int(slot_count or self.MAX_SLOTS), self.MAX_SLOTS))

        model_map = {
            i: kwargs.get(f"model_{i}") for i in builtins.range(1, active_slot_count + 1)
        }
        text_map = {
            i: self._normalize_text(kwargs.get(f"text_{i}"))
            for i in builtins.range(1, active_slot_count + 1)
        }
        label_map = {
            i: self._normalize_text(kwargs.get(f"label_{i}")).strip()
            for i in builtins.range(1, active_slot_count + 1)
        }
        available_indices = [idx for idx, model in model_map.items() if model is not None]

        if mode == "None":
            if base_model is not None:
                self._emit_selected_index(unique_id, 0, mode)
                return (base_model, "", 0, "none")
            if available_indices:
                # Fallback behavior if base_model is not connected.
                fallback_idx = available_indices[0]
                self._emit_selected_index(unique_id, 0, mode)
                return (model_map[fallback_idx], "", 0, "none")
            raise ValueError("Mode is None but no base_model is connected.")

        if not available_indices:
            raise ValueError("No model inputs connected. Connect at least one model_X input.")

        picked = self._pick_index(mode, select, minimum, maximum, range, available_indices, active_slot_count)
        resolved_idx = self._next_filled_from(picked, available_indices, model_map)
        if resolved_idx is None:
            raise ValueError("No connected model found in selectable slots.")

        selected_model = model_map[resolved_idx]
        selected_text = text_map.get(resolved_idx, "")
        if not selected_text:
            selected_text = label_map.get(resolved_idx, "")
        if not selected_text:
            selected_text = self._resolve_connected_title(resolved_idx, prompt, unique_id)
        if not selected_text:
            selected_text = self._resolve_connected_title_from_workflow(resolved_idx, extra_pnginfo, unique_id)
        if not selected_text:
            selected_text = f"slot_{resolved_idx}"

        workflow_title = self._resolve_connected_title_from_workflow(resolved_idx, extra_pnginfo, unique_id)
        prompt_title = self._resolve_connected_title(resolved_idx, prompt, unique_id)

        label = (
            label_map.get(resolved_idx)
            or (workflow_title[:42] if workflow_title else "")
            or (prompt_title[:42] if prompt_title else "")
            or self._derive_label(resolved_idx, kwargs)
        )
        if not label or label.startswith("slot_"):
            if workflow_title:
                label = workflow_title[:42]
        self._emit_selected_index(unique_id, resolved_idx, mode)
        return (selected_model, selected_text, resolved_idx, label)

    @classmethod
    def IS_CHANGED(cls, mode=None, slot_count=None, select=None, minimum=None, maximum=None, range=None, **kwargs):
        if mode in ["Random", "Increment", "Range"]:
            return time.time_ns()
        return (mode, slot_count, select, minimum, maximum, range)


NODE_CLASS_MAPPINGS = {
    "AUNRandomModelBundleSwitch": AUNRandomModelBundleSwitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNRandomModelBundleSwitch": "Model and Text Selector",
}
