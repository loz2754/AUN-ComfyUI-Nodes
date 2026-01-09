import random

class AUNAddToPrompt:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "optional": {
                "prompt": ("STRING", {
                    "forceInput": True,
                    "dynamicPrompts": True,
                    "tooltip": "Optional prompt to add to the prompt."
                }),
            },
            "required": {
                "text_to_add": ("STRING", {
                    "multiline": True,
                    "dynamicPrompts": True,
                    "tooltip": "Text to add to the prompt. Accepts dynamic prompts."
                }),
                "delimiter": ("STRING", {
                    "default": ", ",
                    "tooltip": "Delimiter to use between the prompt and the text to add."
                }),
                "order": (["prompt_first", "text_first"], {
                    "default": "prompt_first",
                    "tooltip": "Order to use when adding the text to the prompt."
                }),
                "mode": ("COMBO", {
                    "options": ["on", "off", "random"],
                    "default": "on",
                    "tooltip": "Mode to use when adding the text to the prompt - on = always add, off = never add, random = 50/50 chance"
                }),
            },
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"},
        }
    
    RETURN_TYPES = ("STRING",)
    FUNCTION = "add_to_prompt"
    CATEGORY = "AUN Nodes/Text"
    DESCRIPTION = "Add text to a prompt."

    def _record_pginfo(self, extra_pnginfo, unique_id, payload):
        if not isinstance(extra_pnginfo, dict) or unique_id is None:
            return
        try:
            pginfo = extra_pnginfo.setdefault("aun_pginfo", {})
            if not isinstance(pginfo, dict):
                pginfo = {}
                extra_pnginfo["aun_pginfo"] = pginfo
            pginfo[str(unique_id)] = payload
        except Exception:
            pass

    def add_to_prompt(self, text_to_add, delimiter, order, mode, prompt=None, unique_id=None, extra_pnginfo=None):
        prompt = prompt or ""
        text_to_add = text_to_add or ""
        delimiter = delimiter or ""
        mode_normalized = str(mode or "").strip().lower()
        order_normalized = "text_first" if str(order or "").strip().lower() == "text_first" else "prompt_first"

        add_text = False
        if mode_normalized == "on":
            add_text = True
        elif mode_normalized == "random":
            add_text = random.choice([True, False])

        addition_applied = add_text and bool(text_to_add)
        if addition_applied:
            if order_normalized == "prompt_first":
                result = f"{prompt}{delimiter}{text_to_add}" if (prompt and text_to_add) else (prompt + text_to_add)
            else:
                result = f"{text_to_add}{delimiter}{prompt}" if (text_to_add and prompt) else (text_to_add + prompt)
        else:
            result = prompt

        self._record_pginfo(
            extra_pnginfo,
            unique_id,
            {
                "node": "AUNAddToPrompt",
                "mode": mode_normalized,
                "applied": bool(addition_applied),
                "result": result,
                "addition": text_to_add,
                "order": order_normalized,
                "delimiter": delimiter,
            },
        )

        return (result,)

NODE_CLASS_MAPPINGS = {
    "AUNAddToPrompt": AUNAddToPrompt,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNAddToPrompt": "AUN Add-To-Prompt"
}
