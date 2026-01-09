class AUNMultiMuteIndex:
    @classmethod
    def INPUT_TYPES(cls):
        inputs = {}
        inputs["Index"] = ("INT", {
            "default": 1, "min": 1, "max": 10,
            "tooltip": "Select the group index (1-10) to keep active. Only node IDs from this group remain unmuted; others are muted.",
        })
        for i in range(1, 11):
            inputs[f"node_ids_{i}"] = ("STRING", {
                "default": "0",
                "multiline": False,
                "tooltip": f"Comma-separated node IDs for group {i} (e.g., '5,12,23'). Enable ID badges in settings to see IDs.",
            })
        return {"required": inputs}

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("Selected Index",)
    FUNCTION = "execute"
    CATEGORY = "AUN Nodes/Node Control"
    OUTPUT_NODE = True
    DESCRIPTION = "Control mute state of multiple node groups using an index. Select an index to unmute one group while muting the others."

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
            node_states = {}
            for group_idx, node_ids_str in enumerate(all_inputs, start=1):
                keep_active = (group_idx == index)
                if node_ids_str:
                    try:
                        node_ids = [int(s.strip()) for s in node_ids_str.split(',') if s.strip()]
                        for node_id in node_ids:
                            if node_id > 0:
                                if node_states.get(node_id) is not True:
                                    node_states[node_id] = keep_active
                    except ValueError as e:
                        print(f"[AUNMultiMuteIndex] Invalid node ID string for group {group_idx}: '{node_ids_str}'. Must be comma-separated integers. Error: {e}")

            # Send the final states in batch events
            if node_states:
                # Ensure bypass is cleared so mute alone controls execution
                bypass_updates = [{"node_id": nid, "is_active": True} for nid in node_states.keys()]
                PromptServer.instance.send_sync("AUN_node_bypass_state", {"updates": bypass_updates})
                
                mute_updates = [{"node_id": nid, "is_active": active} for nid, active in node_states.items()]
                PromptServer.instance.send_sync("AUN-node-mute-state", {"updates": mute_updates})
        except Exception as e:
            print(f"[AUNMultiMuteIndex] Could not send mute state: {e}")

        return (Index,)

NODE_CLASS_MAPPINGS = {"AUNMultiMuteIndex": AUNMultiMuteIndex}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNMultiMuteIndex": "AUN Multi Mute Index"}
