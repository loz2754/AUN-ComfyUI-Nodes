import json
from typing import Any

import torch


class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False


lazy_options = {"lazy": True}
any_type = AlwaysEqualProxy("*")


class AUNAnyIndexSwitch:
    MAX_INPUTS = 20
    MIN_VISIBLE_INPUTS = 2

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "index": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": cls.MAX_INPUTS,
                    "step": 1,
                    "tooltip": "Index number (1-20) used to select the active input. Values above the visible count are clamped."
                }),
                "visible_inputs": ("INT", {
                    "default": cls.MIN_VISIBLE_INPUTS,
                    "min": cls.MIN_VISIBLE_INPUTS,
                    "max": cls.MAX_INPUTS,
                    "step": 1,
                    "tooltip": "How many input sockets to expose on the node."
                }),
            },
            "optional": {}
        }
        for i in range(cls.MAX_INPUTS):
            inputs["optional"][f"value{i + 1}"] = (any_type, lazy_options)
        return inputs

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("value",)
    FUNCTION = "index_switch"
    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "Switch between up to 20 'anytype' inputs with a configurable number of visible sockets."

    def check_lazy_status(self, index, visible_inputs, **kwargs):
        max_inputs = max(self.MIN_VISIBLE_INPUTS, min(int(visible_inputs or self.MIN_VISIBLE_INPUTS), self.MAX_INPUTS))
        selected_index = max(1, min(int(index or 1), max_inputs))
        key = f"value{selected_index}"
        if key not in kwargs:
            return []
        return [key]

    def index_switch(self, index, visible_inputs, **kwargs):
        max_inputs = max(self.MIN_VISIBLE_INPUTS, min(int(visible_inputs or self.MIN_VISIBLE_INPUTS), self.MAX_INPUTS))
        selected_index = max(1, min(int(index or 1), max_inputs))
        key = f"value{selected_index}"
        value = kwargs.get(key)
        return (value,)


NODE_CLASS_MAPPINGS = {
    "AUNAnyIndexSwitch": AUNAnyIndexSwitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNAnyIndexSwitch": "AUN Any Index Switch",
}
