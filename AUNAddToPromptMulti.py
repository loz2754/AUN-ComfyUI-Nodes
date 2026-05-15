class AUNAddToPromptMulti:
    MAX_ADDONS = 10
    
    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "master_prompt": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "dynamicPrompts": True
                }),
                "num_addons": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": cls.MAX_ADDONS,
                    "step": 1,
                    "tooltip": "Number of addon slots to show (1-10)."
                }),
            }
        }
        
        for i in range(1, cls.MAX_ADDONS + 1):
            inputs["required"][f"text_to_add{i}_enabled"] = ("BOOLEAN", {"default": False})
            inputs["required"][f"text_to_add{i}"] = ("STRING", {
                "multiline": True,
                "default": "",
                "dynamicPrompts": True,
                "tooltip": f"Text to add (addon {i})"
            })
            inputs["required"][f"order{i}"] = ("COMBO", {
                "options": ["prompt_first", "addon_first"],
                "default": "prompt_first",
                "tooltip": f"Order for addon {i}"
            })
        
        return inputs


    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "AddonPrompter"
    CATEGORY = "AUN/Prompt Modifiers"
    DESCRIPTION = (
        "Multi-addon prompt builder with switchable parts. Enable/disable each addon individually. "
        "Each addon can be placed before or after the main prompt via the order selector. "
        "Supports 1-10 addons and dynamic prompts. "
        "Double-click or right-click 'Compact mode' to hide configuration widgets and show overlay controls."
    )
    
    def AddonPrompter(self, master_prompt: str, num_addons: int = 1, **kwargs):
        master_prompt_text = str(master_prompt or "").strip()
        num_addons = max(1, min(int(num_addons or 1), self.MAX_ADDONS))
        prefix_parts = []
        suffix_parts = []

        for i in range(1, num_addons + 1):
            enabled = kwargs.get(f"text_to_add{i}_enabled", False)
            text = str(kwargs.get(f"text_to_add{i}", "") or "").strip()
            order = str(kwargs.get(f"order{i}", "prompt_first") or "").strip().lower()
            
            if not enabled or not text:
                continue
            
            # Strip the first line (used as label in compact mode) if multiple lines exist
            lines = text.split("\n")
            if len(lines) > 1:
                addon_text = "\n".join(lines[1:]).strip()
            else:
                addon_text = text  # Single line: use as-is
            
            if order == "addon_first":
                prefix_parts.append(addon_text)
            else:
                suffix_parts.append(addon_text)

        prompt_parts = []
        prompt_parts.extend(prefix_parts)
        if master_prompt_text:
            prompt_parts.append(master_prompt_text)
        prompt_parts.extend(suffix_parts)

        final_prompt = ", ".join(prompt_parts)
        return (final_prompt,)
    
NODE_CLASS_MAPPINGS = {
    "AUNAddToPromptMulti": AUNAddToPromptMulti,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNAddToPromptMulti": "AUN Add To Prompt Multi",
}
