class AUNSetCollapseAndMuteStateAdvanced:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "node_ids": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "tooltip": "Comma-separated node IDs to control (e.g., '5,12,23').",
                }),
                "combined": ("BOOLEAN", {
                    "default": False,
                    "label_on": "Combined On",
                    "label_off": "Combined Off",
                    "tooltip": "When ON, collapse and mute together. When OFF, use the individual toggles below.",
                }),
                "collapse": ("BOOLEAN", {
                    "default": False,
                    "label_on": "Collapsed ▶",
                    "label_off": "Expanded ▼",
                    "tooltip": "Collapsed (▶) hides node body; Expanded (▼) shows it when Combined Off.",
                }),
                "active": ("BOOLEAN", {
                    "default": True,
                    "label_on": "Unmuted",
                    "label_off": "Muted",
                    "tooltip": "When OFF, nodes are muted. When ON, nodes are unmuted.",
                }),
            }
        }

    FUNCTION = "set_state"
    CATEGORY = "AUN Nodes/Node Control"
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    DESCRIPTION = "Set collapse and mute state for multiple nodes. Has a combined override or separate toggles."
    OUTPUT_NODE = True

    def set_state(self, node_ids, combined, collapse, active):
        try:
            from server import PromptServer

            node_id_list = []
            for s in node_ids.split(','):
                s = s.strip()
                if not s:
                    continue
                try:
                    node_id_list.append(int(s))
                except ValueError:
                    print(f"[AUNSetCollapseAndMuteStateAdvanced] Invalid node id '{s}' - skipping")

            if not node_id_list:
                return ()

            if combined:
                collapse_state = True
                is_active_state = False
            else:
                collapse_state = bool(collapse)
                is_active_state = bool(active)

            for node_id in node_id_list:
                if bool(combined):
                    PromptServer.instance.send_sync("AUN_set_collapse_state", {"node_id": node_id, "collapse": True})
                    PromptServer.instance.send_sync("AUN-node-mute-state", {"node_id": node_id, "is_active": False})
                    PromptServer.instance.send_sync("AUN_node_bypass_state", {"node_id": node_id, "is_active": True})
                else:
                    PromptServer.instance.send_sync("AUN-node-mute-state", {"node_id": node_id, "is_active": is_active_state})
                    PromptServer.instance.send_sync("AUN_node_bypass_state", {"node_id": node_id, "is_active": True})
                    PromptServer.instance.send_sync("AUN_set_collapse_state", {"node_id": node_id, "collapse": collapse_state})

            #print(f"[AUNSetCollapseAndMuteStateAdvanced] Set nodes {node_id_list} collapse={collapse_state} active={is_active_state}")

        except Exception as e:
            print(f"[AUNSetCollapseAndMuteStateAdvanced] Error sending events: {e}")

        return ()


NODE_CLASS_MAPPINGS = {
    "AUNSetCollapseAndMuteStateAdvanced": AUNSetCollapseAndMuteStateAdvanced,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNSetCollapseAndMuteStateAdvanced": "AUN Collapse & Mute (Advanced)",
}
