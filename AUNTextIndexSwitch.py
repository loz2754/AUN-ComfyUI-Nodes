import comfy.utils
#from typing import Iterator, List, Tuple, Dict, Any, Union, Optional
#import numpy as np

class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False        

lazy_options = {"lazy": True}
any_type = AlwaysEqualProxy("*")

class AUNTextIndexSwitch:
    MAX_INPUTS = 20
    MIN_VISIBLE_INPUTS = 2

    def __init__(self):
        pass    

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "index": ("INT", {
                    "default": 1, "min": 1, "max": cls.MAX_INPUTS, "step": 1,
                    "tooltip": "Index number (1-20) to select which text input to output. Values above the visible count are clamped."
                }),
                "visible_inputs": ("INT", {
                    "default": cls.MAX_INPUTS,
                    "min": cls.MIN_VISIBLE_INPUTS,
                    "max": cls.MAX_INPUTS,
                    "step": 1,
                    "tooltip": "How many text input sockets to display on the node (2-20)."
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
                    **lazy_options,
                },
            )
        return inputs

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("text", "label")
    FUNCTION = "index_switch"
    CATEGORY = "AUN Nodes/Text"
    DESCRIPTION = "Switch between up to 20 text inputs based on index number. Useful for dynamic prompt selection with control over how many sockets are visible on the node. Inputs take the title of the connected node, which is also used as the label."

    def _clamp_visible_inputs(self, visible_inputs):
        return max(self.MIN_VISIBLE_INPUTS, min(int(visible_inputs or self.MAX_INPUTS), self.MAX_INPUTS))

    def _clamp_index(self, index, visible_inputs):
        max_inputs = self._clamp_visible_inputs(visible_inputs)
        return max(1, min(int(index or 1), max_inputs))

    def check_lazy_status(self, index, visible_inputs, **kwargs):
        # Only check for the input that matches the current index
        selected_index = self._clamp_index(index, visible_inputs)
        key = f"text{selected_index}"
        
        # Only return the key if it exists in kwargs but is None
        if key in kwargs and kwargs[key] is None:
            return [key]
        return []

    def index_switch(self, index, visible_inputs, **kwargs):
        selected_index = self._clamp_index(index, visible_inputs)
        key = "text%d" % selected_index
        
        # Check if the selected input exists
        if key not in kwargs or kwargs[key] is None:
            return ("", key)  # Return the key as the label
        
        selected_label = key
        node_id = kwargs.get('unique_id')
        
        #print(f"Processing node_id: {node_id}, looking for input: {key}")

        if node_id and 'extra_pnginfo' in kwargs and kwargs['extra_pnginfo'] is not None:
            workflow_data = kwargs['extra_pnginfo']['workflow']
            nodelist = workflow_data['nodes']
            # First get our input slot info
            connected_node_id = None
            for node in nodelist:
                if str(node['id']) == node_id:
                    #print(f"Found our node: {node.get('title', 'No title')}")
                    inputs = node.get('inputs', [])
                    for slot in inputs:
                        if slot.get('name') == key and 'label' in slot:
                            selected_label = slot['label']
                        # Check if this input is connected to another node
                        if slot.get('name') == key and 'link' in slot:
                            link_id = slot['link']
                            # Find the link to get the connected node
                            for link in workflow_data.get('links', []):
                                # Try different ways to access link data based on common structures
                                if isinstance(link, dict):
                                    if link.get('id') == link_id:
                                        connected_node_id = link.get('origin_id')
                                        break
                                elif isinstance(link, list) and len(link) >= 4:
                                    # Some workflows use list format [id, origin_id, origin_slot, target_id, target_slot]
                                    if str(link[0]) == str(link_id):
                                        connected_node_id = link[1]
                                        break
                    break
        
        # If we found a connected node, get its title
        if connected_node_id:
            for node in nodelist:
                if isinstance(node, dict) and str(node.get('id', '')) == str(connected_node_id):
                    if 'title' in node and node['title']:
                        selected_label = node['title']
                    elif 'type' in node:  # Fallback to node type if title not available
                        selected_label = node['type']
                    break
        
        return (kwargs[key], selected_label)        
        
NODE_CLASS_MAPPINGS = {
    "AUNTextIndexSwitch": AUNTextIndexSwitch,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNTextIndexSwitch": "AUN Text Index Switch",
}
