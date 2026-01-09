import os
import re
from typing import Dict
from .model_utils import get_short_name

class AUNModelShorten:
    """
    Takes a full model name string and outputs a shortened version suitable for filenames.
    Uses the same logic as AUN Extract Model Name.
    """

    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "Takes a full model name string and outputs a shortened version suitable for filenames."
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("short_name",)
    FUNCTION = "shorten_name"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "full_model_name": ("STRING", {"default": "", "multiline": False, "tooltip": "The full model name to shorten."}),
            },
        }

    def shorten_name(self, full_model_name: str):
        if not full_model_name:
            return ("",)

        short = get_short_name(full_model_name)
        return (short,)

NODE_CLASS_MAPPINGS = {
    "AUNModelShorten": AUNModelShorten,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNModelShorten": "AUN Model Name Shorten",
}
