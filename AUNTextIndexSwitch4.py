import random
import time

class AUNTextIndexSwitch4:
    MAX_SLOTS = 20
    _rng = random.SystemRandom()
    index = None
    range_index = 0

    @classmethod
    def INPUT_TYPES(cls):
        required = {
            "minimum": ("INT", {
                "default": 1,
                "min": 1,
                "max": cls.MAX_SLOTS,
                "tooltip": "The minimum index for selection (inclusive)."
            }),
            "maximum": ("INT", {
                "default": 10,
                "min": 1,
                "max": cls.MAX_SLOTS,
                "tooltip": "The maximum index for selection (inclusive)."
            }),
            "mode": (["Select", "Increment", "Random", "Range"], {
                "default": "Select",
                "tooltip": "Select mode: Select for fixed index, Increment for cycling through range, Random for random index within range, Range for selecting from a list of indices."
            }),
            "index": ("INT", {
                "default": 1,
                "min": 1,
                "max": cls.MAX_SLOTS,
                "step": 1,
                "tooltip": "Current or target index, constrained by slot_count)."
            }),
            "slot_count": ("INT", {
                "default": 2,
                "min": 1,
                "max": cls.MAX_SLOTS,
                "step": 1,
                "tooltip": "Number of visible text slots."
            }),
            "range": ("STRING", {
                "default": "1,2,5-8,12",
                "multiline": False,
                "tooltip": "A comma-separated list of indices or ranges to select from in Range mode (e.g. 1, 2, 5-8, 12)."
            }),
        }

        for i in range(1, cls.MAX_SLOTS + 1):
            required[f"text{i}"] = ("STRING", {
                "multiline": True,
                "default": f"Slot {i}",                
                "dynamicPrompts": True
            })

        return {
            "required": required,
            "optional": {},
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"}
        }

    RETURN_TYPES = ("STRING", "STRING", "INT")
    RETURN_NAMES = ("text", "label", "index")
    FUNCTION = "text_index_switch"
    CATEGORY = "AUN Nodes/Text"
    OUTPUT_NODE = True
    DESCRIPTION = ("Switch between up to 20 text inputs based on index number. Useful for dynamic prompt selection with control over how many sockets are visible on the node."
    " Inputs take the title of the connected node, which is also used as the label. Otherwise, the first line of the text input is used as the label and removed from the output."
    )

    def _clamp_slot_count(self, slot_count):
        return max(1, min(int(slot_count or 2), self.MAX_SLOTS))

    def _clamp_range(self, minimum, maximum, slot_count):
        max_slots = self._clamp_slot_count(slot_count)
        min_val = max(1, min(int(minimum or 1), max_slots))
        max_val = max(1, min(int(maximum or max_slots), max_slots))
        if min_val > max_val:
            min_val, max_val = max_val, min_val
        return min_val, max_val

    def _clamp_index(self, index, min_val, max_val):
        try:
            idx = int(index)
        except Exception:
            return min_val
        return max(min_val, min(idx, max_val))

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
                    valid_indices.extend(range(start, end + 1))
                else:
                    valid_indices.append(int(part))
        except Exception:
            pass

        valid_indices = [idx for idx in valid_indices if min_val <= idx <= max_val]
        valid_indices = sorted(set(valid_indices))
        if not valid_indices:
            valid_indices = [min_val]
        return valid_indices

    def _record_pginfo(self, extra_pnginfo, unique_id, payload):
        if not isinstance(extra_pnginfo, dict) or unique_id is None:
            return
        try:
            pginfo = extra_pnginfo.setdefault("aun_pginfo", {})
            if not isinstance(pginfo, dict):
                pginfo = {}
                extra_pnginfo["aun_pginfo"] = pginfo
            pginfo[str(unique_id)] = payload
        except Exception:
            pass

    def _emit_selected_index(self, unique_id, index, mode):
        if unique_id is None:
            return
        try:
            from server import PromptServer
            PromptServer.instance.send_sync(
                "AUN_random_text_index_selected",
                {
                    "node_id": str(unique_id),
                    "index": int(index),
                    "mode": str(mode),
                },
            )
        except Exception:
            pass

    def text_index_switch(self, minimum, maximum, mode, index, slot_count, range, unique_id=None, extra_pnginfo=None, **kwargs):
        
        slot_count = self._clamp_slot_count(slot_count)
        min_val, max_val = self._clamp_range(minimum, maximum, slot_count)
        index_val = self._clamp_index(index, 1, slot_count)

        if mode == "Random":
            final_index = self._rng.randint(min_val, max_val)
        elif mode == "Increment":
            if self.index is None:
                self.index = min_val - 1
            self.index += 1
            if self.index > max_val:
                self.index = min_val
            final_index = self.index
        elif mode == "Range":
            valid_indices = self._parse_range_string(range, min_val, max_val)
            if self.range_index >= len(valid_indices):
                self.range_index = 0
            final_index = valid_indices[self.range_index]
            self.range_index = (self.range_index + 1) % len(valid_indices)
        else:
            final_index = index_val

        key = f"text{final_index}"
        selected_text = kwargs.get(key, "") or ""
        selected_label = key
        connected_node_id = None

        if unique_id is not None and isinstance(extra_pnginfo, dict):
            workflow_data = extra_pnginfo.get("workflow", {})
            nodelist = workflow_data.get("nodes", [])
            for node in nodelist:
                if not isinstance(node, dict):
                    continue
                if str(node.get("id")) != str(unique_id):
                    continue

                inputs = node.get("inputs", [])
                input_list = []
                if isinstance(inputs, dict):
                    input_list = list(inputs.values())
                elif isinstance(inputs, list):
                    input_list = inputs

                for slot in input_list:
                    if not isinstance(slot, dict):
                        continue
                    if slot.get("name") != key:
                        continue

                    if "label" in slot:
                        selected_label = slot["label"]
                    if "link" in slot:
                        link_id = slot["link"]
                        for link in workflow_data.get("links", []):
                            if isinstance(link, dict):
                                if link.get("id") == link_id:
                                    connected_node_id = link.get("origin_id")
                                    break
                            elif isinstance(link, list) and len(link) >= 4:
                                if str(link[0]) == str(link_id):
                                    connected_node_id = link[1]
                                    break
                    break
                break

            if connected_node_id:
                for node in nodelist:
                    if not isinstance(node, dict):
                        continue
                    if str(node.get("id", "")) != str(connected_node_id):
                        continue
                    if node.get("title"):
                        selected_label = node["title"]
                    elif node.get("type"):
                        selected_label = node["type"]
                    break
            else:
                lines = selected_text.split("\n")
                first_line = lines[0].strip() if lines else ""
                if first_line:
                    selected_label = first_line
                    selected_text = "\n".join(lines[1:]).lstrip()

        self._emit_selected_index(unique_id, final_index, mode)

        self._record_pginfo(
            extra_pnginfo,
            unique_id,
            {
                "node": "AUNTextIndexSwitch4",
                "slot_count": slot_count,
                "index": final_index,
            },
        )

        return (selected_text, selected_label, final_index)

    @classmethod
    def IS_CHANGED(cls, minimum=None, maximum=None, mode=None, range=None, slot_count=None, index=None, **kwargs):
        if mode in ("Random", "Increment", "Range"):
            return time.time_ns()
        return (index, mode, slot_count, minimum, maximum, range)


NODE_CLASS_MAPPINGS = {
    "AUNTextIndexSwitch4": AUNTextIndexSwitch4,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNTextIndexSwitch4": "Text Index Switch 4",
}
