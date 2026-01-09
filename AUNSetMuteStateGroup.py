class AUNSetMuteStateGroup:
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

    FUNCTION = "set_mute_state_group"
    CATEGORY = "AUN Nodes/Node Control"
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    OUTPUT_NODE = True
    DESCRIPTION = "Enable or disable (mute) all nodes within one or more selected groups. This node provides a UI with toggles for each group in the graph."

    def set_mute_state_group(self, group_titles):
        # The core logic is now handled in the JavaScript file for instant feedback.
        # This method remains for compatibility.
        return ()


# Register the node
NODE_CLASS_MAPPINGS = {
    "AUNSetMuteStateGroup": AUNSetMuteStateGroup,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNSetMuteStateGroup": "AUN Group Muter (Multi)",
}
