import comfy.utils

class AUNTextIndexSwitch3:
    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "index": ("INT", {"default": 1, "min": 1, "max": 10, "step": 1, "tooltip": "Selects which text input to output."}),
                "text1": ("STRING", {"default": "", "multiline": True, "tooltip": "Input for index 1."}),
                "text2": ("STRING", {"default": "", "multiline": True, "tooltip": "Input for index 2."}),
                "text3": ("STRING", {"default": "", "multiline": True, "tooltip": "Input for index 3."}),
                "text4": ("STRING", {"default": "", "multiline": True, "tooltip": "Input for index 4."}),
                "text5": ("STRING", {"default": "", "multiline": True, "tooltip": "Input for index 5."}),
                "text6": ("STRING", {"default": "", "multiline": True, "tooltip": "Input for index 6."}),
                "text7": ("STRING", {"default": "", "multiline": True, "tooltip": "Input for index 7."}),
                "text8": ("STRING", {"default": "", "multiline": True, "tooltip": "Input for index 8."}),
                "text9": ("STRING", {"default": "", "multiline": True, "tooltip": "Input for index 9."}),
                "text10": ("STRING", {"default": "", "multiline": True, "tooltip": "Input for index 10."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"}
        }
        return inputs

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("text", "label")
    FUNCTION = "index_switch"
    CATEGORY = "AUN Nodes/Text"
    DESCRIPTION = "Select one of ten text inputs based on an index. Also outputs the label of the selected input."

    def index_switch(self, index, text1, text2, text3, text4, text5, text6, text7, text8, text9, text10, unique_id=None, extra_pnginfo=None):
        texts = [text1, text2, text3, text4, text5, text6, text7, text8, text9, text10]
        key = f"text{index}"
        idx = max(1, min(10, index)) - 1
        selected_label = key
        node_id = unique_id

        print(f"Processing node_id: {node_id}, looking for input: {key}")

        if node_id and extra_pnginfo is not None:
            workflow_data = extra_pnginfo.get('workflow', {})
            nodelist = workflow_data.get('nodes', [])
            connected_node_id = None
            for node in nodelist:
                if str(node.get('id')) == str(node_id):
                    print(f"Found our node: {node.get('title', 'No title')}")
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

        return (texts[idx], selected_label)

NODE_CLASS_MAPPINGS = {
    "AUNTextIndexSwitch3": AUNTextIndexSwitch3,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNTextIndexSwitch3": "AUN Text Index Switch 3",
}
