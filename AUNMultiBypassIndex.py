class AUNMultiBypassIndex:
    @classmethod
    def INPUT_TYPES(cls):
        inputs = {}
        inputs["Index"] = ("INT", {
            "default": 1, "min": 1, "max": 10,
            "tooltip": "Select the group index (1-10) to activate. Only node IDs from this group will be active; others will be bypassed."
        })
        # Inputs for node IDs 1-10
        for i in range(1, 11):
            inputs[f"node_ids_{i}"] = ("STRING", {
                "default": "0", "multiline": False,
                "tooltip": f"Comma-separated node IDs for group {i} (e.g., '5,12,23'). Enable ID badges in settings to see IDs."
            })
        return {"required": inputs}

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("Selected Index",)
    FUNCTION = "execute"
    CATEGORY = "AUN Nodes/Node Control"
    OUTPUT_NODE = True
    DESCRIPTION = "Control bypass state of multiple node groups using an index. Select an index to activate one group while bypassing others."

    def execute(self, Index,
                      node_ids_1, node_ids_2, node_ids_3,
                      node_ids_4, node_ids_5, node_ids_6,
                      node_ids_7, node_ids_8, node_ids_9,
                      node_ids_10):
        try:
            from server import PromptServer

            all_inputs = [
                node_ids_1, node_ids_2, node_ids_3,
                node_ids_4, node_ids_5, node_ids_6,
                node_ids_7, node_ids_8, node_ids_9,
                node_ids_10,
            ]

            index = Index
            # Collect desired states for each node ID, prioritizing True (Active)
            # if a node appears in multiple groups.
            node_states = {}
            for group_idx, node_ids_str in enumerate(all_inputs, start=1):
                is_active = (group_idx == index)
                if node_ids_str:
                    try:
                        # Split string by comma, strip whitespace, and convert to int
                        node_ids = [int(s.strip()) for s in node_ids_str.split(',') if s.strip()]
                        for node_id in node_ids:
                            if node_id > 0:
                                # If already set to True, don't overwrite with False
                                if node_states.get(node_id) is not True:
                                    node_states[node_id] = is_active
                    except ValueError as e:
                        print(f"[AUNMultiBypassIndex] Invalid node ID string for group {group_idx}: '{node_ids_str}'. Error: {e}")

            # Send the final states in a single batch event
            if node_states:
                updates = [{"node_id": nid, "is_active": active} for nid, active in node_states.items()]
                PromptServer.instance.send_sync("AUN_node_bypass_state", {"updates": updates})

        except Exception as e:
            print(f"[AUNMultiBypassIndex] Could not send bypass state: {e}")

        return (Index,)

NODE_CLASS_MAPPINGS = {"AUNMultiBypassIndex": AUNMultiBypassIndex}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNMultiBypassIndex": "AUN Multi Bypass Index"}