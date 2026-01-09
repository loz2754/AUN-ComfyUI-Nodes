import comfy.utils

class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True
    def __ne__(self, _):
        return False        

lazy_options = {"lazy": True}
any_type = AlwaysEqualProxy("*")

class AUNGetNodeTitles:
    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "index": ("INT", {"default": 1, "min": 1, "max": 10, "step": 1, "tooltip": "Select which node title to output as 'selected_title'."}),
                **{f"text{i}": ("STRING", {"default": "", "tooltip": "Default text to use if no node is connected to the corresponding input."}) for i in range(1, 11)}
            },
            "optional": {
                **{f"node_{i}": (any_type, {"default": f"node {i}", "tooltip": "Connect any node here to get its title."}) for i in range(1, 11)}
            },
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"}
        }
        return inputs

    RETURN_TYPES = tuple("STRING" for _ in range(10)) + ("STRING",)
    RETURN_NAMES = tuple(f"label{i}_out" for i in range(1, 11)) + ("selected_title",)
    FUNCTION = "multi_out"
    CATEGORY = "AUN Nodes/Utility"
    OUTPUT_NODE = True
    DESCRIPTION = "This node retrieves the titles of up to 10 connected nodes. It's useful for dynamically labeling outputs or creating descriptive filenames based on the nodes used in your workflow. You can select one of the titles to be output separately."

    def multi_out(self, index, unique_id=None, extra_pnginfo=None, **kwargs):
        # Use the text input as the default label
        labels = [kwargs.get(f"text{i}", f"text{i}") for i in range(1, 11)]

        if unique_id and extra_pnginfo is not None:
            workflow_data = extra_pnginfo.get('workflow', {})
            nodelist = workflow_data.get('nodes', [])
            if nodelist:
                links = workflow_data.get('links', [])
                my_node = None
                for node in nodelist:
                    if str(node.get('id')) == str(unique_id):
                        my_node = node
                        break
                if my_node:
                    inputs = my_node.get('inputs', [])
                    for idx in range(10):
                        slot_name = f"node_{idx+1}"
                        for slot in inputs:
                            if slot.get('name') == slot_name:
                                if 'link' in slot and slot.get('link') is not None:
                                    link_id = slot['link']
                                    connected_node_id = None
                                    for link in links:
                                        if isinstance(link, dict) and link.get('id') == link_id:
                                            connected_node_id = link.get('origin_id')
                                            break
                                        elif isinstance(link, list) and len(link) >= 2 and str(link[0]) == str(link_id):
                                            connected_node_id = link[1]
                                            break
                                    if connected_node_id:
                                        for node in nodelist:
                                            if str(node.get('id', '')) == str(connected_node_id):
                                                if 'title' in node and node['title']:
                                                    labels[idx] = node['title']
                                                elif 'type' in node:
                                                    labels[idx] = node['type']
                                                break
                                break

        # Clamp index to be safe (1-10) and convert to 0-based
        selected_idx = max(1, min(10, index)) - 1
        selected_label = labels[selected_idx]

        return tuple(labels) + (selected_label,)

    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        import time
        # Always return a different value to force re-execution
        return time.time()

NODE_CLASS_MAPPINGS = {
    "AUNGetNodeTitles": AUNGetNodeTitles,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNGetNodeTitles": "AUN Get Node Titles",
}
