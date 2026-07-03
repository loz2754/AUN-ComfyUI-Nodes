import comfy.utils

class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False        

lazy_options = {"lazy": True}
any_type = AlwaysEqualProxy("*")

class AUNAnyIndexSwitch:
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
                    "tooltip": "Index number (1-20) to select which input to output. Values above the visible count are clamped."
                }),
                "visible_inputs": ("INT", {
                    "default": cls.MAX_INPUTS,
                    "min": cls.MIN_VISIBLE_INPUTS,
                    "max": cls.MAX_INPUTS,
                    "step": 1,
                    "tooltip": "How many input sockets to display on the node (2-20)."
                }),
                "label_mode": (["Node Title", "Slot Label"], {
                    "default": "Node Title",
                    "tooltip": "Choose label source: 'Node Title' shows the connected node's title, 'Slot Label' shows the connected output slot's label.",
                }),
            },
            "optional": {
            },
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"}
        }
        for i in range(1, cls.MAX_INPUTS + 1):
            inputs["optional"]["value%d" % i] = (
                any_type,
                {
                    "tooltip": f"Input {i} (any type). Only the selected index is output.",
                    **lazy_options,
                },
            )
        return inputs

    RETURN_TYPES = (any_type, "STRING")
    RETURN_NAMES = ("output", "label")
    FUNCTION = "index_switch"
    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "Switch between up to 20 inputs of any type based on index number. Useful for dynamic routing of models, latents, images, or any other type. The label output can show the connected node's title or the connected output slot's label."

    def _clamp_visible_inputs(self, visible_inputs):
        return max(self.MIN_VISIBLE_INPUTS, min(int(visible_inputs or self.MAX_INPUTS), self.MAX_INPUTS))

    def _clamp_index(self, index, visible_inputs):
        max_inputs = self._clamp_visible_inputs(visible_inputs)
        return max(1, min(int(index or 1), max_inputs))

    def check_lazy_status(self, index, visible_inputs, **kwargs):
        selected_index = self._clamp_index(index, visible_inputs)
        key = f"value{selected_index}"
        
        if key in kwargs and kwargs[key] is None:
            return [key]
        return []

    def index_switch(self, index, visible_inputs, label_mode="Node Title", **kwargs):
        selected_index = self._clamp_index(index, visible_inputs)
        key = "value%d" % selected_index
        
        if key not in kwargs or kwargs[key] is None:
            return (None, key)
        
        selected_label = key
        node_id = kwargs.get('unique_id')
        connected_origin_slot = None

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
                            connected_origin_slot = None
                            for link in workflow_data.get('links', []):
                                if isinstance(link, dict):
                                    if link.get('id') == link_id:
                                        connected_node_id = link.get('origin_id')
                                        connected_origin_slot = link.get('origin_slot')
                                        break
                                elif isinstance(link, list) and len(link) >= 5:
                                    if str(link[0]) == str(link_id):
                                        connected_node_id = link[1]
                                        connected_origin_slot = link[2]
                                        break
                    break
        
        if connected_node_id:
            for node in nodelist:
                if isinstance(node, dict) and str(node.get('id', '')) == str(connected_node_id):
                    if label_mode == "Slot Label" and connected_origin_slot is not None:
                        outputs = node.get('outputs', [])
                        if isinstance(outputs, list) and connected_origin_slot < len(outputs):
                            output_slot = outputs[connected_origin_slot]
                            selected_label = output_slot.get('label') or output_slot.get('name', key)
                        else:
                            selected_label = key
                    else:
                        if 'title' in node and node['title']:
                            selected_label = node['title']
                        elif 'type' in node:
                            selected_label = node['type']
                    break
        
        return (kwargs[key], selected_label)        
        
NODE_CLASS_MAPPINGS = {
    "AUNAnyIndexSwitch": AUNAnyIndexSwitch,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNAnyIndexSwitch": "AUN Any Index Switch",
}
