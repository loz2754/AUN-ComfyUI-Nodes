from __future__ import annotations

from nodes import PreviewImage
from server import PromptServer


class AUNTitleImagePreview(PreviewImage):
    DEFAULT_TITLE = "AUN Image Preview"
    DEFAULT_PREFIX = "AUNTitlePreview"
    
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {
                    "tooltip": "Image tensor to preview inside this node."
                }),
            },
            "optional": {
                "title": ("STRING", {
                    "forceInput": True,
                    "default": cls.DEFAULT_TITLE,
                    "multiline": False,
                    "tooltip": "Optional text mirrored to the node's title; defaults to AUN Image Preview."
                }),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = tuple()
    RETURN_NAMES = tuple()
    FUNCTION = "preview"
    OUTPUT_NODE = True
    CATEGORY = "AUN Nodes/Image"
    DESCRIPTION = (
        "Minimal companion for AUNImageSingleBatch3 that mirrors the provided title and "
        "shows the connected image directly inside the node."
    )

    def preview(
        self,
        image,
        title=None,
        prompt=None,
        extra_pnginfo=None,
        unique_id=None,
        **_,
    ):
        resolved_title = title.strip() if isinstance(title, str) else ""
        resolved_title = resolved_title or self.DEFAULT_TITLE

        self._update_node_title(unique_id, resolved_title)
        preview_payload = self._build_preview_payload(image, prompt, extra_pnginfo)
        ui_block = dict(preview_payload.get("ui", {}))
        ui_block["title"] = resolved_title
        preview_payload["ui"] = ui_block

        return preview_payload

    def _update_node_title(self, unique_id, title: str) -> None:
        node_id = self._normalize_unique_id(unique_id)
        if node_id is None:
            return
        try:
            PromptServer.instance.send_sync(
                "AUN.set_node_title",
                {"node_id": node_id, "title": title},
            )
        except Exception:
            pass

    def _normalize_unique_id(self, unique_id):
        if unique_id is None:
            return None
        if isinstance(unique_id, (list, tuple)):
            return unique_id[0]
        return unique_id

    def _build_preview_payload(self, image, prompt, extra_pnginfo):
        if image is None:
            return {"ui": {"images": []}}
        preview = super().save_images(image, self.DEFAULT_PREFIX, prompt, extra_pnginfo)
        if "ui" not in preview:
            preview["ui"] = {"images": []}
        elif "images" not in preview["ui"]:
            preview["ui"]["images"] = []
        return preview



NODE_CLASS_MAPPINGS = {
    "AUNTitleImagePreview": AUNTitleImagePreview,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNTitleImagePreview": "AUN Title Image Preview",
}
