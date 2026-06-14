class AUNMultiBypassIndex:
    @classmethod
    def INPUT_TYPES(cls):
        inputs = {}
        inputs["slot_count"] = ("INT", {
            "default": 20, "min": 2, "max": 20, "step": 1,
            "tooltip": "Number of active slots (2-20). Extra slots are hidden."
        })
        inputs["Index"] = ("INT", {
            "default": 1, "min": 1, "max": 20,
            "tooltip": "Select the index (1-20) to activate. Only node IDs from this set of nodes will be active; others will be bypassed."
        })
        for i in range(1, 21):
            inputs[f"node_ids_{i}"] = ("STRING", {
                "default": "0", "multiline": False,
                "tooltip": f"Comma-separated node IDs for set {i} (e.g., '5,12,23'). Enable ID badges in settings to see IDs."
            })
        return {"required": inputs}

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("Selected Index",)
    FUNCTION = "execute"
    CATEGORY = "AUN Nodes/Node Control"
    OUTPUT_NODE = True
    DESCRIPTION = "Control bypass state of node(s) by ID, using an index. Select an index to activate one node-set while bypassing others."

    def execute(self, Index, slot_count,
                      node_ids_1, node_ids_2, node_ids_3,
                      node_ids_4, node_ids_5, node_ids_6,
                      node_ids_7, node_ids_8, node_ids_9,
                      node_ids_10, node_ids_11, node_ids_12,
                      node_ids_13, node_ids_14, node_ids_15,
                      node_ids_16, node_ids_17, node_ids_18,
                      node_ids_19, node_ids_20):
        try:
            from server import PromptServer

            all_inputs = [
                node_ids_1, node_ids_2, node_ids_3,
                node_ids_4, node_ids_5, node_ids_6,
                node_ids_7, node_ids_8, node_ids_9,
                node_ids_10, node_ids_11, node_ids_12,
                node_ids_13, node_ids_14, node_ids_15,
                node_ids_16, node_ids_17, node_ids_18,
                node_ids_19, node_ids_20,
            ]

            slot_count = max(2, min(20, int(slot_count)))
            index = max(1, min(slot_count, int(Index)))

            node_states = {}
            for group_idx in range(slot_count):
                node_ids_str = all_inputs[group_idx]
                is_active = (group_idx + 1 == index)
                if node_ids_str:
                    try:
                        node_ids = [int(s.strip()) for s in node_ids_str.split(',') if s.strip()]
                        for node_id in node_ids:
                            if node_id > 0:
                                if node_states.get(node_id) is not True:
                                    node_states[node_id] = is_active
                    except ValueError as e:
                        print(f"[AUNMultiBypassIndex] Invalid node ID string for set {group_idx + 1}: '{node_ids_str}'. Must be comma-separated integers. Error: {e}")

            if node_states:
                mute_clear = [{"node_id": nid, "is_active": True} for nid in node_states.keys()]
                PromptServer.instance.send_sync("AUN-node-mute-state", {"updates": mute_clear})

                bypass_updates = [{"node_id": nid, "is_active": active} for nid, active in node_states.items()]
                PromptServer.instance.send_sync("AUN_node_bypass_state", {"updates": bypass_updates})

        except Exception as e:
            print(f"[AUNMultiBypassIndex] Could not send bypass state: {e}")

        return (index,)

NODE_CLASS_MAPPINGS = {"AUNMultiBypassIndex": AUNMultiBypassIndex}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNMultiBypassIndex": "AUN Multi Bypass Index"}
