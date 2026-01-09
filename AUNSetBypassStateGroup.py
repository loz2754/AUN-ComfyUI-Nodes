class AUNSetBypassStateGroup:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "group_titles": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": False,
                        "tooltip": "Select multiple groups using the UI.",
                    },
                ),
            }
        }

    FUNCTION = "set_bypass_state_group"
    CATEGORY = "AUN Nodes/Node Control"
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    OUTPUT_NODE = True
    DESCRIPTION = "Set the bypass state of all nodes in selected groups (multi-select)."

    def set_bypass_state_group(self, group_titles):
        # The core logic is now handled in the JavaScript file for instant feedback.
        # This method remains for compatibility.
        return ()


# Register the node
NODE_CLASS_MAPPINGS = {
    "AUNSetBypassStateGroup": AUNSetBypassStateGroup,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNSetBypassStateGroup": "AUN Group Bypasser (Multi)",
}
