class AUNStringListBuilder:
    MAX_INPUTS = 20

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "num_inputs": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": cls.MAX_INPUTS,
                    "step": 1,
                    "tooltip": "Number of string inputs to include in the list (1-20)."
                }),
            }
        }

        for i in range(1, cls.MAX_INPUTS + 1):
            inputs["required"][f"string_{i}"] = ("STRING", {
                "multiline": True,
                "default": "",
                "dynamicPrompts": True,
                "tooltip": f"String {i}. Supports multiline text and dynamic prompts."
            })

        return inputs

    RETURN_TYPES = ("AUN_STRING_LIST",)
    RETURN_NAMES = ("string_list",)
    FUNCTION = "build_list"
    CATEGORY = "AUN Nodes/Text"
    DESCRIPTION = "Compile multiple multiline strings into a string list. Connect the output to a String List Index node to select by index."

    def build_list(self, num_inputs, **kwargs):
        num_inputs = max(1, min(int(num_inputs or 1), self.MAX_INPUTS))
        result = []
        for i in range(1, num_inputs + 1):
            val = kwargs.get(f"string_{i}", "")
            result.append(str(val or ""))
        return (result,)

NODE_CLASS_MAPPINGS = {
    "AUNStringListBuilder": AUNStringListBuilder,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNStringListBuilder": "String List Builder",
}
