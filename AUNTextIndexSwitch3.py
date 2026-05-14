import comfy.utils

class AUNTextIndexSwitch3:

    MAX_SLOTS = 20

    @classmethod
    def INPUT_TYPES(cls):
        required= {
            "index": ("INT", {
                "default": 1, "min": 1, "max": cls.MAX_SLOTS, "step": 1, 
                "tooltip": "Selects which text input to output."
            }),
            "slot_count": ("INT", {
                "default": 2, "min": 1, "max": cls.MAX_SLOTS, "step": 1,
                "tooltip": "Number of visible text slots",
            }),
        }
        # Move text widgets to required so ComfyUI always saves their values
        for i in range(1, cls.MAX_SLOTS + 1):
            required[f"text{i}"] = ("STRING", {
                "multiline": True, 
                "default": f"Slot {i}", 
                "dynamicPrompts": True})
            
        return {
            "required": required, 
            "optional": {}, 
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"}} 

    RETURN_TYPES = ("STRING", "STRING","INT",)
    RETURN_NAMES = ("text", "label", "index")
    FUNCTION = "index_switch"
    CATEGORY = "AUN Nodes/Text"
    DESCRIPTION = (
        "Select one of up to 20 text inputs based on an index. Use slot_count to add/remove slots. "
        "Also outputs the label of the selected input.\n\n"
        "Label behavior:\n"
        "• If a node is connected to the input: label = connected node's title\n"
        "• If no node is connected: label = first line of the text input (first line is removed from text output)"
    )

    def index_switch(self, index, slot_count, unique_id=None, extra_pnginfo=None, **kwargs):
        # Clamp slot_count to valid range
        slot_count = max(1, min(20, int(slot_count)))
        
        # Store slot_count and index in extra_pnginfo for persistence
        self._record_pginfo(
            extra_pnginfo,
            unique_id,
            {
                "node": "AUNTextIndexSwitch3",
                "slot_count": slot_count,
                "index": int(index),
            }
        )
        
        # Build text list from only the active slots
        texts = [kwargs.get(f"text{i}", "") for i in range(1, slot_count + 1)]
        
        # Clamp index to valid range within slot_count
        clamped_index = max(1, min(slot_count, int(index)))
        key = f"text{clamped_index}"
        idx = clamped_index - 1
        selected_label = key
        node_id = unique_id

        print(f"Processing node_id: {node_id}, looking for input: {key}")

        if node_id and extra_pnginfo is not None:
            workflow_data = extra_pnginfo.get('workflow', {})
            nodelist = workflow_data.get('nodes', [])
            connected_node_id = None
            
            for node in nodelist:
                if not isinstance(node, dict):
                    continue
                if str(node.get('id')) != str(node_id):
                    continue
                
                print(f"Found our node: {node.get('title', 'No title')}")
                inputs = node.get('inputs', [])
                
                # Handle both dict and list formats for inputs
                input_list = []
                if isinstance(inputs, dict):
                    input_list = list(inputs.values())
                elif isinstance(inputs, list):
                    input_list = inputs
                
                for slot in input_list:
                    if not isinstance(slot, dict):
                        continue
                    
                    if slot.get('name') != key:
                        continue
                    
                    # Check for label first
                    if 'label' in slot:
                        selected_label = slot['label']
                    
                    # Check for link connection
                    if 'link' in slot:
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
                    break  # Exit slot loop after finding matching slot
                break  # Exit node loop after finding current node

            if connected_node_id:
                for node in nodelist:
                    if not isinstance(node, dict):
                        continue
                    if str(node.get('id', '')) != str(connected_node_id):
                        continue
                    
                    if 'title' in node and node['title']:
                        selected_label = node['title']
                    elif 'type' in node:
                        selected_label = node['type']
                    break
            else:
                # No connected node: use first line of text as label
                selected_text = texts[idx].strip()
                if selected_text:
                    lines = selected_text.split('\n')
                    first_line = lines[0].strip()
                    if first_line:
                        selected_label = first_line
                        # Remove first line from text output
                        texts[idx] = '\n'.join(lines[1:]).lstrip()

        return (texts[idx], selected_label, clamped_index)
    
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

NODE_CLASS_MAPPINGS = {
    "AUNTextIndexSwitch3": AUNTextIndexSwitch3,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNTextIndexSwitch3": "AUN Text Index Switch 3",
}
