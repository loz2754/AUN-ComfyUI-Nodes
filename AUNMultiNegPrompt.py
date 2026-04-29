class AUNMultiNegPrompt:
    MAX_INPUTS = 20
    MIN_VISIBLE_INPUTS = 2

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
            },
        }
        for i in range(1, 11):
            inputs["required"][f"negative{i}"] = (
                "STRING",
                {
                    "default": "",
                    "multiline": True,
                    "tooltip": f"Negative prompt option {i}.",
                },
            )

        inputs["required"].update({
                "which_negative": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": cls.MAX_INPUTS,
                    "step": 1,
                    "tooltip": "Select which negative prompt (1-20) to output. Connect the index output of a text index switch here.",
                }),
                "visible_inputs": ("INT", {
                    "default": 10,
                    "min": cls.MIN_VISIBLE_INPUTS,
                    "max": cls.MAX_INPUTS,
                    "step": 1,
                    "tooltip": "How many negative prompt fields to show on the node (2-20).",
                }),
        })

        for i in range(11, cls.MAX_INPUTS + 1):
            inputs["required"][f"negative{i}"] = (
                "STRING",
                {
                    "default": "",
                    "multiline": True,
                    "tooltip": f"Negative prompt option {i}.",
                },
            )
        return inputs

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("negative",)
    FUNCTION = "select_negative"
    CATEGORY = "AUN Nodes/Text"
    DESCRIPTION = "Selects one of up to 20 manually entered negative prompts using an index input, with a configurable number of visible fields."

    def _clamp_visible_inputs(self, visible_inputs):
        return max(self.MIN_VISIBLE_INPUTS, min(int(visible_inputs or self.MAX_INPUTS), self.MAX_INPUTS))

    def _clamp_index(self, which_negative, visible_inputs):
        max_inputs = self._clamp_visible_inputs(visible_inputs)
        return max(1, min(int(which_negative or 1), max_inputs))

    def select_negative(
        self,
        negative1,
        negative2,
        negative3,
        negative4,
        negative5,
        negative6,
        negative7,
        negative8,
        negative9,
        negative10,
        which_negative,
        visible_inputs,
        negative11,
        negative12,
        negative13,
        negative14,
        negative15,
        negative16,
        negative17,
        negative18,
        negative19,
        negative20,
    ):
        index = self._clamp_index(which_negative, visible_inputs)
        negatives = [
            negative1,
            negative2,
            negative3,
            negative4,
            negative5,
            negative6,
            negative7,
            negative8,
            negative9,
            negative10,
            negative11,
            negative12,
            negative13,
            negative14,
            negative15,
            negative16,
            negative17,
            negative18,
            negative19,
            negative20,
        ]
        return (negatives[index - 1],)

NODE_CLASS_MAPPINGS = {"AUNMultiNegPrompt": AUNMultiNegPrompt}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNMultiNegPrompt": "AUN Negative Prompt Selector"}
