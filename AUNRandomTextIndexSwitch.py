import random
import time

lazy_options = {"lazy": True}


class AUNRandomTextIndexSwitch:
    MAX_INPUTS = 20
    MIN_VISIBLE_INPUTS = 2

    def __init__(self):
        self.index = None

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "minimum": ("INT", {
                    "default": 1, "min": 1, "max": cls.MAX_INPUTS,
                    "tooltip": "The minimum index for selection (inclusive)."
                }),
                "maximum": ("INT", {
                    "default": 10, "min": 1, "max": cls.MAX_INPUTS,
                    "tooltip": "The maximum index for selection (inclusive)."
                }),
                "mode": (["Select", "Increment", "Random"], {
                    "default": "Random",
                    "tooltip": "Select mode: Select for fixed index, Increment for cycling through range, Random for random index within range."
                }),
                "select": ("INT", {
                    "default": 1, "min": 1, "max": cls.MAX_INPUTS,
                    "tooltip": "The fixed index value to output when in 'Select' mode."
                }),
                "visible_inputs": ("INT", {
                    "default": cls.MAX_INPUTS,
                    "min": cls.MIN_VISIBLE_INPUTS,
                    "max": cls.MAX_INPUTS,
                    "step": 1,
                    "tooltip": "How many text input sockets to expose on the node (2-20)."
                }),
            },
            "optional": {
            },
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"}
        }
        for i in range(1, cls.MAX_INPUTS + 1):
            inputs["optional"]["text%d" % i] = (
                "STRING",
                {
                    "default": "",
                    "forceInput": True,
                    "tooltip": f"Text input {i}. Only the selected index is output.",
                },
            )
        return inputs

    RETURN_TYPES = ("STRING", "STRING", "INT")
    RETURN_NAMES = ("text", "label", "index")
    FUNCTION = "random_text_switch"
    CATEGORY = "AUN Nodes/Utility"
    OUTPUT_NODE = True
    DESCRIPTION = "Combines random index generation with text selection. Generates an index based on the selected mode (Select: fixed value, Increment: cycling through range, Random: random within range) and uses it to select from up to 20 text inputs. Control how many sockets are visible on the node for cleaner layouts."

    def check_lazy_status(self, minimum, maximum, mode, select, visible_inputs, **kwargs):
        # Since index is generated at runtime, cannot determine which input is needed in advance
        return []

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

    def _clamp_visible_inputs(self, visible_inputs):
        return max(self.MIN_VISIBLE_INPUTS, min(int(visible_inputs or self.MAX_INPUTS), self.MAX_INPUTS))

    def _clamp_range(self, minimum, maximum, visible_inputs):
        max_inputs = self._clamp_visible_inputs(visible_inputs)
        min_val = max(1, min(int(minimum or 1), max_inputs))
        max_val = max(1, min(int(maximum or max_inputs), max_inputs))
        if min_val > max_val:
            min_val, max_val = max_val, min_val
        return min_val, max_val

    def _clamp_index(self, index, min_val, max_val):
        if index is None:
            return min_val
        return max(min_val, min(int(index), max_val))

    def random_text_switch(self, minimum, maximum, mode, select, visible_inputs, **kwargs):
        min_val, max_val = self._clamp_range(minimum, maximum, visible_inputs)
        select_val = self._clamp_index(select, min_val, max_val)

        # Generate the index based on mode
        if mode == "Random":
            index = random.randint(min_val, max_val)
        elif mode == "Increment":
            if self.index is None:
                self.index = min_val - 1
            self.index += 1
            if self.index > max_val:
                self.index = min_val
            index = self.index
        else:  # Select
            index = select_val

        key = "text%d" % index

        # Check if the selected input exists and has a value
        if key not in kwargs or kwargs[key] is None:
            return ("", "Text " + str(index), index)  # Return automatic name as the label if no input

        selected_label = "Text " + str(index)
        node_id = kwargs.get('unique_id')

        # Get the label from workflow data if available
        if node_id and 'extra_pnginfo' in kwargs and kwargs['extra_pnginfo'] is not None:
            workflow_data = kwargs['extra_pnginfo']['workflow']
            nodelist = workflow_data['nodes']
            connected_node_id = None
            for node in nodelist:
                if str(node['id']) == node_id:
                    inputs = node.get('inputs', [])
                    for slot in inputs:
                        if slot.get('name') == key and 'label' in slot:
                            selected_label = slot['label']
                        if slot.get('name') == key and 'link' in slot:
                            link_id = slot['link']
                            for link in workflow_data.get('links', []):
                                if isinstance(link, dict):
                                    if link.get('id') == link_id:
                                        connected_node_id = link.get('origin_id')
                                        break
                                elif isinstance(link, list) and len(link) >= 4:
                                    if str(link[0]) == str(link_id):
                                        connected_node_id = link[1]
                                        break
                    break

            if connected_node_id:
                for node in nodelist:
                    if isinstance(node, dict) and str(node.get('id', '')) == str(connected_node_id):
                        if 'title' in node and node['title']:
                            selected_label = node['title']
                        elif 'type' in node:
                            selected_label = node['type']
                        break

        selected_text = kwargs[key]

        self._record_pginfo(
            kwargs.get('extra_pnginfo'),
            kwargs.get('unique_id'),
            {
                "node": "AUNRandomTextIndexSwitch",
                "mode": mode,
                "minimum": min_val,
                "maximum": max_val,
                "select": select_val,
                "index": index,
                "text": selected_text,
                "label": selected_label,
            }
        )

        return (selected_text, selected_label, index)

    @classmethod
    def IS_CHANGED(cls, minimum=None, maximum=None, mode=None, select=None, **_unused):
        # Force re-execution when random or increment is chosen
        if mode == "Random" or mode == "Increment":
            return time.time()
        return (select,)

NODE_CLASS_MAPPINGS = {
    "AUNRandomTextIndexSwitch": AUNRandomTextIndexSwitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNRandomTextIndexSwitch": "AUN Random Text Index Switch",
}