class AUNCollapseConnectionsController:
    """Hide the input/output slots of chosen nodes to reduce link lines between them.

    Toggling a slot hides or restores the target nodes' input/output slots instantly on the canvas.
    Requires the '⚠ EXPERIMENTAL — Global collapse connections' setting (Settings → AUN) to be
    enabled; otherwise the node does nothing (its overlay informs the user).
    """

    CATEGORY = "AUN Nodes/Node Control"
    FUNCTION = "execute"
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    OUTPUT_NODE = True
    DESCRIPTION = (
        "Hide the input/output slots of chosen nodes to reduce link lines between them. "
        "Toggled nodes take effect instantly on the canvas — their connection lines collapse into a "
        "single point and expand back anytime. Target nodes by Node ID, or use 'All Graph' to hide "
        "connections for every node with 2 or more slots at once. Requires the experimental "
        "'Global collapse connections' setting (Settings → AUN) to be enabled."
    )

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "slot_count": ("INT", {
                    "default": 3, "min": 1, "max": 20, "step": 1,
                    "tooltip": "How many control slots to show (1-20)."
                }),
            }
        }

        def slot_tooltip(text, slot_index):
            return text if slot_index == 1 else ""

        label_tooltip = "Name for slot 1 (other slots follow the same layout)."
        targets_tooltip = (
            "The node IDs slot 1 controls, separated by commas (e.g. '5, 12')."
        )
        switch_tooltip = "Turn slot 1 on to hide the target nodes' input/output slots, or off to show them again."

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
            "tooltip": "On = hide slots for all targeted nodes at once. Off = control each slot individually."
        })

        # AllNodes toggle at the very bottom
        inputs["required"]["AllNodes"] = ("BOOLEAN", {
            "default": False,
            "label_on": "All Graph ▶",
            "label_off": "Slot only",
            "tooltip": "On = hide the input/output slots of every node in the graph with 2 or more connection slots. Off = only nodes targeted by the slots are affected."
        })

        return inputs

    def execute(self, slot_count, AllSwitch, AllNodes, **kwargs):
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
                targets = [s.strip() for s in targets_str.split(",") if s.strip()]
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
                "all_nodes": bool(AllNodes),
            })
        except Exception as e:
            print(f"[AUNCollapseConnectionsController] Error sending event: {e}")
        return ()


NODE_CLASS_MAPPINGS = {"AUNCollapseConnectionsController": AUNCollapseConnectionsController}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNCollapseConnectionsController": "Collapse Connections"}
