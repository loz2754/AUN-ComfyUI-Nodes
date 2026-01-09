class AUNSingleLabelSwitch:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "state": ("BOOLEAN", {
                    "default": False,
                    "label_on": "On 🟢",
                    "label_off": "Off 🔴",
                    "tooltip": "Toggle label switch between on and off states."}),
                "label": ("STRING", {
                    "default": "label",
                    "tooltip": "Text label to be switched on or off."
                })
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("Label",)
    FUNCTION = "execute"
    CATEGORY = "AUN Nodes/Text"
    DESCRIPTION = "Simple boolean toggle with text label. Useful for adding the same text to more than one node."

    def execute(self, state, label ):
        if state:
            return (label,)
        else:
            return ("")
        

NODE_CLASS_MAPPINGS = {"AUNSingleLabelSwitch": AUNSingleLabelSwitch}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNSingleLabelSwitch": "AUN Single Label Switch"}
