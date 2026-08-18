class AUNKeywordPresetSelector:
    MAX_INPUTS = 20
    MIN_VISIBLE_INPUTS = 2

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "visible_inputs": ("INT", {
                    "default": 5,
                    "min": cls.MIN_VISIBLE_INPUTS,
                    "max": cls.MAX_INPUTS,
                    "step": 1,
                    "tooltip": "How many keyword/preset pairs are active (2-20). Slot N uses keywordN/presetN."
                }),
                "case_sensitive": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If enabled, keyword matching is case-sensitive."
                }),
            },
            "optional": {
                "reference_phrase": ("STRING", {
                    "default": "",
                    "forceInput": True,
                    "multiline": True,
                    "tooltip": "Text to scan for keywords. Keywords are matched as substrings."
                }),
            },
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

        inputs["optional"]["preset_default"] = (
            "STRING",
            {
                "default": "",
                "multiline": True,
                "placeholder": "enter_default_values",
                "tooltip": "Default preset value. Output when no keyword matches.",
            },
        )

        for i in range(1, cls.MAX_INPUTS + 1):
            inputs["optional"]["keyword%d" % i] = (
                "STRING",
                {
                    "default": "",
                    "tooltip": "Keyword %d to match against the reference phrase. Matched as a substring." % i,
                },
            )
            inputs["optional"]["preset%d" % i] = (
                "STRING",
                {
                    "default": "",
                    "multiline": True,
                    "tooltip": "Preset value %d to output when keyword %d matches." % (i, i),
                },
            )

        return inputs

    RETURN_TYPES = ("STRING", "STRING", "INT")
    RETURN_NAMES = ("selected_value", "matched_keyword", "matched_index")
    FUNCTION = "select_preset"
    CATEGORY = "AUN Nodes/Prompts"
    DESCRIPTION = (
        "Select a preset value based on keyword matching in a reference phrase. "
        "Keywords are matched as substrings (case-insensitive by default). "
        "First match wins (top-to-bottom order). Useful for automating workflow "
        "selection based on text analysis."
    )

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def select_preset(self, visible_inputs, case_sensitive,
                      reference_phrase="", unique_id=None, extra_pnginfo=None, **kwargs):
        visible_inputs = max(self.MIN_VISIBLE_INPUTS, min(int(visible_inputs or 5), self.MAX_INPUTS))
        search = reference_phrase if case_sensitive else reference_phrase.lower()

        for i in range(1, visible_inputs + 1):
            keyword = kwargs.get("keyword%d" % i, "")
            if not keyword:
                continue
            match_kw = keyword if case_sensitive else keyword.lower()
            if match_kw in search:
                preset_val = kwargs.get("preset%d" % i, "")
                return (preset_val, keyword, i)

        fallback_val = kwargs.get("preset_default", "")
        return (fallback_val, "", 0)


NODE_CLASS_MAPPINGS = {
    "AUNKeywordPresetSelector": AUNKeywordPresetSelector,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNKeywordPresetSelector": "AUN Keyword Preset Selector",
}
