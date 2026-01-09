import json
from typing import Any, Iterable

import torch
from server import PromptServer

class AUNShowTextWithTitle:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text": ("STRING", {
                    "forceInput": True, "dynamicPrompts": False,
                    "tooltip": "The text content to be displayed inside the node after execution."
                }),
            },
            "optional": {
                "title": ("STRING", {
                    "forceInput": True, "dynamicPrompts": False,
                    "tooltip": "The text to set as the node's title after execution."
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    INPUT_IS_LIST = True
    RETURN_TYPES = ("STRING",)
    FUNCTION = "show"
    OUTPUT_NODE = True
    OUTPUT_IS_LIST = (True,)

    CATEGORY = "AUN Nodes/Text"
    DESCRIPTION = "Displays text content within the node and dynamically sets the node's title from a text input upon execution. Useful for labeling and annotating parts of a workflow."

    def show(self, text, default = "AUN Show Text", title=None, unique_id=None, extra_pnginfo=None):
        title_text = "" + title[0] if title else default
        display_text = self._sanitize_text_list(text)

        # Send a message to the frontend to update the node's title
        if unique_id is not None:
            PromptServer.instance.send_sync("AUN.set_node_title", {"node_id": unique_id[0], "title": title_text})

        # The 'ui' dictionary sends data to the frontend for display inside the node.
        # The 'result' is the node's actual output.
        return {"ui": {"text": display_text}, "result": (display_text,)}

    def _sanitize_text_list(self, text: Any) -> list[str]:
        if text is None:
            return []
        if isinstance(text, (list, tuple)):
            values = text
        else:
            values = [text]
        sanitized = []
        for value in values:
            sanitized.append(self._stringify_value(value))
        return sanitized

    def _stringify_value(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        if isinstance(value, (int, float, bool)):
            return str(value)
        if isinstance(value, torch.Tensor):
            shape = tuple(value.shape)
            return f"Tensor(shape={shape}, dtype={value.dtype})"
        if isinstance(value, dict):
            try:
                return json.dumps(value, default=self._fallback_repr)
            except TypeError:
                return self._fallback_repr(value)
        return self._fallback_repr(value)

    def _fallback_repr(self, value: Any) -> str:
        try:
            return repr(value)
        except Exception:
            return str(value)

NODE_CLASS_MAPPINGS = {
    "AUNShowTextWithTitle": AUNShowTextWithTitle,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNShowTextWithTitle": "AUN Show Text With Title",
}
