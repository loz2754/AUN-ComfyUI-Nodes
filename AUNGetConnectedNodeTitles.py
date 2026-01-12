class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True
    def __ne__(self, _):
        return False

any_type = AlwaysEqualProxy("*")

class AUNGetConnectedNodeTitles:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "index": (
                    "INT",
                    {
                        "default": 1,
                        "min": 1,
                        "max": 10,
                        "step": 1,
                        "tooltip": "Select which node title to output as 'selected_title'.",
                    },
                ),
            },
            "optional": {
                "node_1": (any_type, {"default": "node 1", "tooltip": "Connect any node to read its title from the workflow."}),
                "node_2": (any_type, {"default": "node 2", "tooltip": "Connect any node to read its title from the workflow."}),
                "node_3": (any_type, {"default": "node 3", "tooltip": "Connect any node to read its title from the workflow."}),
                "node_4": (any_type, {"default": "node 4", "tooltip": "Connect any node to read its title from the workflow."}),
                "node_5": (any_type, {"default": "node 5", "tooltip": "Connect any node to read its title from the workflow."}),
                "node_6": (any_type, {"default": "node 6", "tooltip": "Connect any node to read its title from the workflow."}),
                "node_7": (any_type, {"default": "node 7", "tooltip": "Connect any node to read its title from the workflow."}),
                "node_8": (any_type, {"default": "node 8", "tooltip": "Connect any node to read its title from the workflow."}),
                "node_9": (any_type, {"default": "node 9", "tooltip": "Connect any node to read its title from the workflow."}),
                "node_10": (any_type, {"default": "node 10", "tooltip": "Connect any node to read its title from the workflow."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = tuple("STRING" for _ in range(10)) + ("STRING",)
    RETURN_NAMES = tuple(f"label{i}_out" for i in range(1, 11)) + ("selected_title",)
    FUNCTION = "multi_out"
    CATEGORY = "AUN Nodes/Utility"
    OUTPUT_NODE = True
    DESCRIPTION = "Gets the titles of up to 10 connected nodes. If a node is not connected, the output is an empty string."

    def multi_out(self, index, unique_id=None, extra_pnginfo=None, **kwargs):
        # Initialize labels as empty strings
        labels = ["" for _ in range(10)]

        if unique_id and extra_pnginfo is not None:
            workflow_data = extra_pnginfo.get('workflow', {})
            nodelist = workflow_data.get('nodes', [])
            if nodelist:
                links = workflow_data.get('links', [])
                my_node = next((node for node in nodelist if str(node.get('id')) == str(unique_id)), None)

                if my_node:
                    inputs = my_node.get('inputs', [])
                    for idx in range(10):
                        slot_name = f"node_{idx+1}"
                        input_slot = next((slot for slot in inputs if slot.get('name') == slot_name), None)
                        
                        if input_slot and 'link' in input_slot and input_slot.get('link') is not None:
                            link_id = input_slot['link']
                            connected_node_id = None
                            for link in links:
                                if isinstance(link, dict) and link.get('id') == link_id:
                                    connected_node_id = link.get('origin_id')
                                    break
                                elif isinstance(link, list) and len(link) >= 2 and str(link[0]) == str(link_id):
                                    connected_node_id = link[1]
                                    break
                            if connected_node_id:
                                connected_node = next((node for node in nodelist if str(node.get('id', '')) == str(connected_node_id)), None)
                                if connected_node:
                                    labels[idx] = connected_node.get('title') or connected_node.get('type', '')

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
    "AUNGetConnectedNodeTitles": AUNGetConnectedNodeTitles,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNGetConnectedNodeTitles": "AUN Get Connected Node Titles",
}
