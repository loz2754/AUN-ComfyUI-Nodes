class AUNStringListIndex:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "string_list": ("AUN_STRING_LIST", {
                    "forceInput": True,
                    "tooltip": "String list from a String List Builder node."
                }),
                "index": ("INT", {
                    "default": 1,
                    "min": 1,
                    "step": 1,
                    "tooltip": "1-based index to select which string to output."
                }),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("string",)
    FUNCTION = "select_by_index"
    CATEGORY = "AUN Nodes/Text"
    DESCRIPTION = "Select a string from a string list by 1-based index. Connect a String List Builder to the input."

    def select_by_index(self, string_list, index):
        if not isinstance(string_list, list) or len(string_list) == 0:
            return ("",)
        index = max(1, min(int(index or 1), len(string_list)))
        return (str(string_list[index - 1] or ""),)

NODE_CLASS_MAPPINGS = {
    "AUNStringListIndex": AUNStringListIndex,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNStringListIndex": "String List Index",
}
