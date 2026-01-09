import json
import random
import re
from server import PromptServer

class AUNMultiGroupUniversal:
    @classmethod
    def INPUT_TYPES(cls):
        # Define the base required inputs
        inputs = {
            "required": {
                "mode": (["Bypass", "Mute", "Collapse", "Bypass+Collapse"], {
                    "default": "Bypass",
                    "tooltip": "Choose how to disable nodes in groups: Bypass (🔴), Mute (🔇), or Collapse (▶)."
                }),
                "slot_count": ("INT", {
                    "default": 3, "min": 1, "max": 20, "step": 1,
                    "tooltip": "Number of control slots to show (1-20)."
                }),
                "toggle_restriction": (["default", "max one", "always one", "iterate", "random"], {
                    "default": "default",
                    "tooltip": "Logic for toggles: 'max one' allows only one active, 'always one' ensures at least one is active, 'iterate' cycles through slots, 'random' picks a random slot on each run."
                }),
                "use_all_groups": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If enabled, shows a toggle for every group in the graph instead of using manual slots."
                }),
                "show_outputs": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Show boolean output pins for each slot."
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "all_groups_state": "STRING"
            }
        }
        
        # Pre-define 20 slots in required to ensure proper validation and widget behavior
        for i in range(1, 21):
            inputs["required"][f"group_name_{i}"] = ("STRING", {
                "default": "",
                "tooltip": f"Group name(s) for slot {i} (newline, comma, or semicolon separated). Use '!' or '-' prefix for exclusion (e.g. 'image, !load')."
            })
            inputs["required"][f"switch_{i}"] = ("BOOLEAN", {
                "default": False, 
                "label_on": "Active 🟢", 
                "label_off": "Bypass 🔴",
                "tooltip": f"Toggle state for slot {i}. 🟢 = active, 🔴 = controlled by mode."
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
    RETURN_NAMES = ("Active Groups",) + tuple(f"Switch {i}" for i in range(1, 21))
    FUNCTION = "execute"
    CATEGORY = "AUN Nodes/Node Control"
    OUTPUT_NODE = True
    DESCRIPTION = (
        "AUN Group Controller: Consolidates Bypass, Mute, and Collapse logic for ComfyUI Groups into one dynamic node. "
        "Set the mode and number of slots, then manage multiple groups instantly. "
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

    def execute(self, mode, slot_count, toggle_restriction, use_all_groups, show_outputs, AllSwitch, unique_id=None, all_groups_state="", **kwargs):
        try:
            if use_all_groups:
                state_value = kwargs.get("all_groups_state", all_groups_state)
                active_names = []
                inactive_names = []

                def _collect(target, entries):
                    if not entries:
                        return
                    for entry in entries:
                        if isinstance(entry, str):
                            trimmed = entry.strip()
                            if trimmed:
                                target.append(trimmed)

                if isinstance(state_value, dict):
                    _collect(active_names, state_value.get("active"))
                    _collect(inactive_names, state_value.get("inactive"))
                else:
                    state_str = str(state_value or "").strip()
                    if state_str:
                        try:
                            state_data = json.loads(state_str)
                            if isinstance(state_data, dict):
                                _collect(active_names, state_data.get("active"))
                                _collect(inactive_names, state_data.get("inactive"))
                            elif isinstance(state_data, list):
                                _collect(active_names, state_data)
                        except json.JSONDecodeError:
                            _collect(active_names, re.split(r"[,\n;]+", state_str))

                # Deduplicate while preserving order
                def _dedupe(seq):
                    seen = set()
                    ordered = []
                    for item in seq:
                        if item not in seen:
                            seen.add(item)
                            ordered.append(item)
                    return ordered

                active_names = _dedupe(active_names)
                active_set = set(active_names)
                inactive_names = [name for name in _dedupe(inactive_names) if name not in active_set]

                target_groups = []
                if active_names:
                    target_groups.append({"type": "Group", "targets": active_names, "is_active": True})
                if inactive_names:
                    target_groups.append({"type": "Group", "targets": inactive_names, "is_active": False})

                if target_groups:
                    PromptServer.instance.send_sync("AUN_universal_update", {
                        "mode": mode,
                        "groups": target_groups
                    })

                return (", ".join(active_names), *(False,) * 20)

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
            active_groups = []
            
            # Resolve states for each target to handle overlaps (Active wins)
            group_states = {}
            
            # Track individual switch states for outputs
            switch_states = []

            for i in range(1, 21):
                # Only process targets for slots within the count
                if i <= slot_count:
                    name_str = kwargs.get(f"group_name_{i}", "").strip()
                    switch = kwargs.get(f"switch_{i}", False) or AllSwitch

                    switch_states.append(switch)

                    if name_str:
                        names = [s.strip() for s in re.split(r'[,\n;]+', name_str) if s.strip()]
                        for name in names:
                            # Prioritize True (Active)
                            if group_states.get(name) is not True:
                                group_states[name] = switch
                            if switch:
                                active_groups.append(name)
                else:
                    switch_states.append(False)

            # Reconstruct target groups from resolved states
            target_groups = []
            
            active_names = [name for name, active in group_states.items() if active]
            inactive_names = [name for name, active in group_states.items() if not active]

            if active_names: target_groups.append({"type": "Group", "targets": active_names, "is_active": True})
            if inactive_names: target_groups.append({"type": "Group", "targets": inactive_names, "is_active": False})

            # Send updates to frontend
            if target_groups:
                PromptServer.instance.send_sync("AUN_universal_update", {
                    "mode": mode,
                    "groups": target_groups
                })

            return (", ".join(list(set(active_groups))), *switch_states)

        except Exception as e:
            print(f"[AUNMultiGroupUniversal] Error: {e}")
            # Return empty string and 20 False for switches
            return ("",) + (False,) * 20


# Register the node
NODE_CLASS_MAPPINGS = {
    "AUNMultiGroupUniversal": AUNMultiGroupUniversal,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNMultiGroupUniversal": "AUN Group Controller",
}
