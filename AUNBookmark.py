class AUNBookmark:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "shortcut_key": ("STRING", {"default": "1", "tooltip": "The key to press to jump to this bookmark. Single character (e.g. '1', 'a')."}),
                "zoom": ("FLOAT", {"default": 1.0, "min": 0.01, "max": 10.0, "step": 0.001, "tooltip": "The zoom level to apply when jumping to this bookmark (0.01 to 10.0)."}),
            },
        }
    DESCRIPTION = "A bookmark node for AUN with precision zoom."
    RETURN_TYPES = ()
    FUNCTION = "do_nothing"
    CATEGORY = "AUN Nodes/Utility"

    def do_nothing(self, **kwargs):
        return ()

NODE_CLASS_MAPPINGS = {
    "AUNBookmark": AUNBookmark
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNBookmark": "AUN Bookmark"
}
