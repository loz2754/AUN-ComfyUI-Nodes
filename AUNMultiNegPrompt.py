class AUNMultiNegPrompt:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "negative1": ("STRING", {"default": "negative 1", "multiline": True, "tooltip": "Negative prompt option 1."}),
                "negative2": ("STRING", {"default": "negative 2", "multiline": True, "tooltip": "Negative prompt option 2."}),
                "negative3": ("STRING", {"default": "negative 3", "multiline": True, "tooltip": "Negative prompt option 3."}),
                "negative4": ("STRING", {"default": "negative 4", "multiline": True, "tooltip": "Negative prompt option 4."}),
                "negative5": ("STRING", {"default": "negative 5", "multiline": True, "tooltip": "Negative prompt option 5."}),
                "negative6": ("STRING", {"default": "negative 6", "multiline": True, "tooltip": "Negative prompt option 6."}),
                "negative7": ("STRING", {"default": "negative 7", "multiline": True, "tooltip": "Negative prompt option 7."}),
                "negative8": ("STRING", {"default": "negative 8", "multiline": True, "tooltip": "Negative prompt option 8."}),
                "negative9": ("STRING", {"default": "negative 9", "multiline": True, "tooltip": "Negative prompt option 9."}),
                "negative10": ("STRING", {"default": "negative 10", "multiline": True, "tooltip": "Negative prompt option 10."}),
                "which_negative": ("INT", {"default": 1, "min": 1, "max": 10, "step": 1, "tooltip": "Select which negative prompt (1-10) to output."})
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("negative",)
    FUNCTION = "select_negative"
    CATEGORY = "AUN Nodes/Text"
    DESCRIPTION = "Selects one of the 10 negative prompts to use."

    def select_negative(self, negative1, negative2, negative3, negative4, negative5, negative6, negative7, negative8, negative9, negative10, which_negative):
        mapping = {
            1: negative1,
            2: negative2,
            3: negative3,
            4: negative4,
            5: negative5,
            6: negative6,
            7: negative7,
            8: negative8,
            9: negative9,
            10: negative10
        }
        return (mapping.get(which_negative, negative1),)

NODE_CLASS_MAPPINGS = {"AUNMultiNegPrompt": AUNMultiNegPrompt}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNMultiNegPrompt": "AUN Negative Prompt Selector"}
