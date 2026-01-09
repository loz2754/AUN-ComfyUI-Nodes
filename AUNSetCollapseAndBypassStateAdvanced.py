class AUNSetCollapseAndBypassStateAdvanced:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "node_ids": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "tooltip": "Comma-separated node IDs to control (e.g., '5,12,23')."
                }),
                "combined": ("BOOLEAN", {
                    "default": False,
                    "label_on": "Combined On",
                    "label_off": "Combined Off",
                    "tooltip": "When ON, set Collapse and Bypass/Mute together (based on 'Use Mute'). When OFF, use the individual toggles below.",
                }),
                "use_mute": ("BOOLEAN", {
                    "default": False,
                    "label_on": "Use Mute",
                    "label_off": "Use Bypass",
                    "tooltip": "If ON, control Mute instead of Bypass for the targeted nodes.",
                }),
                "collapse": ("BOOLEAN", {
                    "default": False,
                    "label_on": "Collapsed ▶",
                    "label_off": "Expanded ▼",
                    "tooltip": "Collapsed (▶) hides node body; Expanded (▼) shows it when Combined Off.",
                }),
                "active": ("BOOLEAN", {
                    "default": True,
                    "label_on": "Active",
                    "label_off": "Disabled",
                    "tooltip": "When OFF, the nodes are disabled (Bypassed or Muted depending on 'Use Mute'). When ON, nodes are active.",
                }),
            }
        }

    FUNCTION = "set_state"
    CATEGORY = "AUN Nodes/Node Control"
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    DESCRIPTION = "Set collapse and bypass or mute state for multiple nodes. Has a combined override or separate toggles."
    OUTPUT_NODE = True

    def set_state(self, node_ids, combined, use_mute, collapse, active):
        try:
            from server import PromptServer

            # Parse node ids
            node_id_list = []
            for s in node_ids.split(','):
                s = s.strip()
                if not s:
                    continue
                try:
                    node_id_list.append(int(s))
                except ValueError:
                    print(f"[AUNSetCollapseAndBypassStateAdvanced] Invalid node id '{s}' - skipping")

            if not node_id_list:
                return ()

            # Determine states
            if combined:
                collapse_state = True
                is_active_state = False
            else:
                collapse_state = bool(collapse)
                is_active_state = bool(active)

            for node_id in node_id_list:
                if bool(combined):
                    # Combined: collapse then disable via chosen mode only
                    PromptServer.instance.send_sync("AUN_set_collapse_state", {"node_id": node_id, "collapse": True})
                    if bool(use_mute):
                        PromptServer.instance.send_sync("AUN-node-mute-state", {"node_id": node_id, "is_active": False})
                    else:
                        PromptServer.instance.send_sync("AUN_node_bypass_state", {"node_id": node_id, "is_active": False})
                else:
                    # Non-combined: enable/disable via chosen mode first
                    if bool(use_mute):
                        PromptServer.instance.send_sync("AUN-node-mute-state", {"node_id": node_id, "is_active": is_active_state})
                        # Clear bypass to active to avoid leftover bypass state
                        PromptServer.instance.send_sync("AUN_node_bypass_state", {"node_id": node_id, "is_active": True})
                    else:
                        PromptServer.instance.send_sync("AUN_node_bypass_state", {"node_id": node_id, "is_active": is_active_state})
                        # Clear mute to active to avoid leftover mute state
                        PromptServer.instance.send_sync("AUN-node-mute-state", {"node_id": node_id, "is_active": True})
                    # Then adjust collapse/expand
                    PromptServer.instance.send_sync("AUN_set_collapse_state", {"node_id": node_id, "collapse": collapse_state})

            mode = "mute" if bool(use_mute) else "bypass"
            #print(f"[AUNSetCollapseAndBypassStateAdvanced] Set nodes {node_id_list} collapse={collapse_state} active={is_active_state} via {mode}")

        except Exception as e:
            print(f"[AUNSetCollapseAndBypassStateAdvanced] Error sending events: {e}")

        return ()


NODE_CLASS_MAPPINGS = {
    "AUNSetCollapseAndBypassStateAdvanced": AUNSetCollapseAndBypassStateAdvanced,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNSetCollapseAndBypassStateAdvanced": "AUN Collapse & Bypass/Mute (Advanced)",
}
