import re


class AUNCollapseConnectionsController:
    """Control the 'collapse connections' behavior (compact socket lines) for nodes by ID.

    Toggling a slot collapses/expands the targeted nodes instantly on the canvas. Requires the
    '⚠ EXPERIMENTAL — Global collapse connections' setting (Settings → AUN) to be enabled;
    otherwise the node does nothing (its overlay informs the user).
    """

    CATEGORY = "AUN Nodes/Node Control"
    FUNCTION = "execute"
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    OUTPUT_NODE = True
    DESCRIPTION = (
        "Control 'collapse connections' (compact socket lines) for nodes by ID. "
        "Slot switches apply instantly on the canvas; double-click the node for compact mode. "
        "Requires the experimental 'Global collapse connections' setting to be enabled."
    )

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "slot_count": ("INT", {
                    "default": 3, "min": 1, "max": 20, "step": 1,
                    "tooltip": "Number of control slots to show (1-20)."
                }),
            }
        }

        def slot_tooltip(text, slot_index):
            return text if slot_index == 1 else ""

        label_tooltip = "Descriptive label for slot 1 (other slots follow the same layout)."
        targets_tooltip = (
            "Target node IDs for slot 1 (comma, semicolon, or newline separated). "
            "Use '!' or '-' prefix for exclusion (e.g. '5, !12')."
        )
        switch_tooltip = "Toggle state for slot 1. ▶ = collapse the targeted nodes' connections, ▼ = expand them."

        for i in range(1, 21):
            inputs["required"][f"label_{i}"] = ("STRING", {
                "default": "",
                "tooltip": slot_tooltip(label_tooltip, i)
            })
            inputs["required"][f"targets_{i}"] = ("STRING", {
                "default": "0",
                "tooltip": slot_tooltip(targets_tooltip, i)
            })
            inputs["required"][f"switch_{i}"] = ("BOOLEAN", {
                "default": False,
                "label_on": "Collapsed ▶",
                "label_off": "Expanded ▼",
                "tooltip": slot_tooltip(switch_tooltip, i)
            })

        # AllSwitch at the bottom to match other multi-nodes
        inputs["required"]["AllSwitch"] = ("BOOLEAN", {
            "default": False,
            "label_on": "All ▶",
            "label_off": "Individual",
            "tooltip": "ON = collapse all targeted nodes. OFF = use individual slot switches."
        })

        return inputs

    def execute(self, slot_count, AllSwitch, **kwargs):
        try:
            from server import PromptServer
        except Exception as e:
            print(f"[AUNCollapseConnectionsController] Could not import PromptServer: {e}")
            return ()

        # If only one slot is active, AllSwitch is redundant and hidden in UI
        if slot_count == 1:
            AllSwitch = False

        # Resolve states for each target to handle overlaps (Active wins)
        id_states = {}

        for i in range(1, 21):
            if i > slot_count:
                continue
            switch = kwargs.get(f"switch_{i}", False) or AllSwitch
            targets_str = kwargs.get(f"targets_{i}", "0")

            if targets_str and targets_str != "0":
                targets = [s.strip() for s in re.split(r"[,\n;]+", targets_str) if s.strip()]
                for t in targets:
                    # Prioritize True (Active) across overlapping slots
                    if id_states.get(t) is not True:
                        id_states[t] = switch

        # Reconstruct target groups from resolved states
        target_groups = []

        active_ids = [tid for tid, active in id_states.items() if active]
        inactive_ids = [tid for tid, active in id_states.items() if not active]

        if active_ids: target_groups.append({"type": "ID", "targets": active_ids, "is_active": True})
        if inactive_ids: target_groups.append({"type": "ID", "targets": inactive_ids, "is_active": False})

        try:
            PromptServer.instance.send_sync("AUN_set_collapse_connections", {
                "groups": target_groups,
                "slot_count": int(slot_count),
            })
        except Exception as e:
            print(f"[AUNCollapseConnectionsController] Error sending event: {e}")
        return ()


NODE_CLASS_MAPPINGS = {"AUNCollapseConnectionsController": AUNCollapseConnectionsController}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNCollapseConnectionsController": "Collapse Connections Controller"}
