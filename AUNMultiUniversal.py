import json
import random
import re
from server import PromptServer

class AUNMultiUniversal:
    @classmethod
    def INPUT_TYPES(cls):
        # Define the base required inputs
        inputs = {
            "required": {
                "mode": (["Bypass", "Mute", "Collapse", "Bypass+Collapse"], {
                    "default": "Bypass",
                    "tooltip": "Choose how to disable nodes: Bypass (🔴), Mute (🔇), or Collapse (▶)."
                }),
                "slot_count": ("INT", {
                    "default": 3, "min": 1, "max": 20, "step": 1,
                    "tooltip": "Number of control slots to show (1-20)."
                }),
                "toggle_restriction": (["default", "max one", "always one", "iterate", "random"], {
                    "default": "default",
                    "tooltip": "Logic for toggles: 'max one' allows only one active, 'always one' ensures at least one is active, 'iterate' cycles through slots, 'random' picks a random slot on each run."
                }),
                "show_outputs": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Show boolean output pins for each slot."
                }),
            },
            "hidden": {"unique_id": "UNIQUE_ID"}
        }
        
        # Pre-define 20 slots in required to ensure proper validation and widget behavior
        for i in range(1, 21):
            inputs["required"][f"label_{i}"] = ("STRING", {
                "default": "",
                "tooltip": f"Descriptive label for slot {i}."
            })
            inputs["required"][f"targets_{i}"] = ("STRING", {
                "default": "0",
                "tooltip": f"Target node IDs or Titles for slot {i} (comma, semicolon, or newline separated). Use '!' or '-' prefix for exclusion (e.g. 'image, !load')."
            })
            inputs["required"][f"switch_{i}"] = ("BOOLEAN", {
                "default": False, 
                "label_on": "Active 🟢", 
                "label_off": "Bypass 🔴",
                "tooltip": f"Toggle state for slot {i}. 🟢 = active, 🔴 = controlled by mode."
            })
            inputs["required"][f"target_type_{i}"] = (["ID", "Title"], {
                "default": "ID",
                "tooltip": f"Targeting method for slot {i}: ID (numeric) or Title (display name)."
            })
            
        # AllSwitch at the bottom to match other multi-nodes
        inputs["required"]["AllSwitch"] = ("BOOLEAN", {
            "default": False, 
            "label_on": "All 🟢", 
            "label_off": "Individual",
            "tooltip": "ON = all groups active (🟢). OFF = use individual group switches."
        })
            
        return inputs

    RETURN_TYPES = ("STRING",) + ("BOOLEAN",) * 20
    RETURN_NAMES = ("Labels",) + tuple(f"Switch {i}" for i in range(1, 21))
    FUNCTION = "execute"
    CATEGORY = "AUN Nodes/Node Control"
    OUTPUT_NODE = True
    DESCRIPTION = (
        "AUN Node Controller: Consolidates Bypass, Mute, and Collapse logic into one dynamic node. "
        "Set the mode and number of slots, then manage multiple node groups instantly. "
        "TIP: Double-click the node or right-click and select 'Compact mode' to hide configuration widgets."
    )

    # Class-level storage for iteration state
    _iteration_states = {}

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Force re-execution if in iterate or random mode
        if kwargs.get("toggle_restriction") in ["iterate", "random"]:
            return float("NaN")
        return False

    def execute(self, mode, slot_count, toggle_restriction, show_outputs, AllSwitch, unique_id=None, **kwargs):
        try:
            # If only one slot is active, AllSwitch is redundant and hidden in UI
            if slot_count == 1:
                AllSwitch = False

            # Handle Iteration/Random Logic
            if unique_id is not None:
                active_slot = -1
                if toggle_restriction == "iterate":
                    current_idx = self._iteration_states.get(unique_id, 0)
                    active_slot = (current_idx % slot_count) + 1
                    self._iteration_states[unique_id] = active_slot
                elif toggle_restriction == "random":
                    active_slot = random.randint(1, slot_count)
                
                if active_slot != -1:
                    # Override switches: only the chosen one is True
                    for i in range(1, 21):
                        kwargs[f"switch_{i}"] = (i == active_slot)
                    
                    # Tell frontend to update the UI switches
                    PromptServer.instance.send_sync("AUN_update_switches", {
                        "node_id": unique_id,
                        "active_slot": active_slot
                    })

            # Collect active groups
            active_labels = []
            
            # Resolve states for each target to handle overlaps (Active wins)
            id_states = {}
            title_states = {}
            
            # Track individual switch states for outputs
            switch_states = []

            for i in range(1, 21):
                # Only process targets for slots within the count
                if i <= slot_count:
                    label = kwargs.get(f"label_{i}", "").strip()
                    switch = kwargs.get(f"switch_{i}", False) or AllSwitch
                    target_type = kwargs.get(f"target_type_{i}", "ID")
                    targets_str = kwargs.get(f"targets_{i}", "0")

                    switch_states.append(switch)

                    if switch:
                        if label:
                            active_labels.append(label)

                    if targets_str and targets_str != "0":
                        targets = [s.strip() for s in re.split(r'[,\n;]+', targets_str) if s.strip()]
                        for t in targets:
                            if target_type == "ID":
                                # Prioritize True (Active)
                                if id_states.get(t) is not True:
                                    id_states[t] = switch
                            else:
                                # Prioritize True (Active)
                                if title_states.get(t) is not True:
                                    title_states[t] = switch
                else:
                    switch_states.append(False)

            # Reconstruct target groups from resolved states
            target_groups = []
            
            active_ids = [tid for tid, active in id_states.items() if active]
            inactive_ids = [tid for tid, active in id_states.items() if not active]
            active_titles = [t for t, active in title_states.items() if active]
            inactive_titles = [t for t, active in title_states.items() if not active]

            if active_ids: target_groups.append({"type": "ID", "targets": active_ids, "is_active": True})
            if inactive_ids: target_groups.append({"type": "ID", "targets": inactive_ids, "is_active": False})
            if active_titles: target_groups.append({"type": "Title", "targets": active_titles, "is_active": True})
            if inactive_titles: target_groups.append({"type": "Title", "targets": inactive_titles, "is_active": False})

            # Send updates to frontend
            if target_groups:
                PromptServer.instance.send_sync("AUN_universal_update", {
                    "mode": mode,
                    "groups": target_groups
                })

            return (" ".join(active_labels), *switch_states)

        except Exception as e:
            print(f"[AUNMultiUniversal] Error: {e}")
            # Return empty string and 20 False for switches
            return ("",) + (False,) * 20

NODE_CLASS_MAPPINGS = {"AUNMultiUniversal": AUNMultiUniversal}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNMultiUniversal": "AUN Node Controller"}
