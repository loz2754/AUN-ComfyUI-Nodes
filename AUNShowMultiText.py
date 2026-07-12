class AUNShowMultiText:
    MAX_INPUTS = 20

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {},
            "optional": {},
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }
        for i in range(1, cls.MAX_INPUTS + 1):
            inputs["optional"][f"input_{i}"] = ("STRING", {
                "forceInput": True,
                "tooltip": f"Text input {i} to display.",
            })
        return inputs

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "show_multi"
    OUTPUT_NODE = True
    CATEGORY = "AUN Nodes/Text"
    DESCRIPTION = (
        "Displays string values from multiple connected inputs, each with a caption "
        "taken from the connected node's output slot name. Useful for inspecting "
        "multiple text values in one place."
        "\n\nRight-click → \"Collapse Connections\" or double-click to hide slot labels and converge connection lines."
    )

    def show_multi(self, unique_id=None, extra_pnginfo=None, **kwargs):
        captions = {}
        if unique_id is not None and extra_pnginfo is not None:
            workflow_data = extra_pnginfo.get('workflow', {})
            nodelist = workflow_data.get('nodes', [])
            links = workflow_data.get('links', [])

            my_node = next(
                (node for node in nodelist if str(node.get('id')) == str(unique_id)),
                None
            )
            if my_node:
                inputs_data = my_node.get('inputs', [])
                input_list = []
                if isinstance(inputs_data, dict):
                    input_list = list(inputs_data.values())
                elif isinstance(inputs_data, list):
                    input_list = inputs_data

                for slot in input_list:
                    if not isinstance(slot, dict):
                        continue
                    slot_name = slot.get('name', '')
                    if not slot_name.startswith('input_'):
                        continue
                    link_id = slot.get('link')
                    if link_id is None:
                        continue

                    for link in links:
                        link_id_val = None
                        origin_node_id = None
                        origin_slot_idx = None
                        if isinstance(link, dict):
                            link_id_val = link.get('id')
                            origin_node_id = link.get('origin_id')
                            origin_slot_idx = link.get('origin_slot')
                        elif isinstance(link, list) and len(link) >= 5:
                            link_id_val = link[0]
                            origin_node_id = link[1]
                            origin_slot_idx = link[2]

                        if str(link_id_val) == str(link_id):
                            src_node = next(
                                (n for n in nodelist if str(n.get('id')) == str(origin_node_id)),
                                None
                            )
                            if src_node:
                                outputs = src_node.get('outputs', [])
                                if isinstance(outputs, list) and origin_slot_idx < len(outputs):
                                    out_slot = outputs[origin_slot_idx]
                                    if isinstance(out_slot, dict):
                                        caption = out_slot.get('label') or out_slot.get('name', slot_name)
                                        captions[slot_name] = caption
                            break

        entries = []
        for i in range(1, self.MAX_INPUTS + 1):
            key = f"input_{i}"
            value = kwargs.get(key)
            if value is not None and value != "":
                caption = captions.get(key, f"Input {i}")
                entries.append({"caption": caption, "value": str(value)})

        return {"ui": {"entries": entries}}


NODE_CLASS_MAPPINGS = {
    "AUNShowMultiText": AUNShowMultiText,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNShowMultiText": "Show Multi Text",
}
