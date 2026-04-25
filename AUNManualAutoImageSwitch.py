import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont


class AUNManualAutoImageSwitch:
    @staticmethod
    def _parse_hex_color(value, fallback):
        color = str(value or "").strip().lstrip("#")
        if len(color) == 6:
            try:
                return tuple(int(color[index:index + 2], 16) for index in (0, 2, 4))
            except ValueError:
                return fallback
        return fallback

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {"tooltip": "Image to pass through when Name Mode is Auto."}),
                "Filename": ("STRING", {
                    "multiline": False,
                    "default": "",
                    "forceInput": False,
                    "tooltip": "The automatically generated filename."
                }),
                "width": ("INT", {
                    "default": 512,
                    "min": 1,
                    "max": 8192,
                    "step": 1,
                    "tooltip": "Width of the blank image returned when Name Mode is Manual."
                }),
                "height": ("INT", {
                    "default": 512,
                    "min": 1,
                    "max": 8192,
                    "step": 1,
                    "tooltip": "Height of the blank image returned when Name Mode is Manual."
                }),
                "ManualName": ("STRING", {
                    "multiline": False,
                    "default": "",
                    "forceInput": False,
                    "tooltip": "A manually specified name to use instead of the automatic filename."
                }),
                "name_mode": (["Auto", "Manual"], {
                    "default": "Auto",
                    "tooltip": "Auto passes through the image and Filename. Manual returns a blank image and uses ManualName."
                }),
                "show_overlay": ("BOOLEAN", {
                    "default": True,
                    "label_on": "Overlay On",
                    "label_off": "Overlay Off",
                    "tooltip": "Show a centered placeholder label on the blank Manual-mode image."
                }),
                "overlay_text": ("STRING", {
                    "default": "No image loaded",
                    "multiline": False,
                    "tooltip": "Centered text shown on the blank Manual-mode image."
                }),
                "background_color": ("STRING", {
                    "default": "181818",
                    "multiline": False,
                    "tooltip": "Blank image background color as hex, for example 181818 or #181818."
                }),
                "text_color": ("STRING", {
                    "default": "E6E6E6",
                    "multiline": False,
                    "tooltip": "Overlay text color as hex, for example E6E6E6 or #E6E6E6."
                }),
                "box_color": ("STRING", {
                    "default": "000000",
                    "multiline": False,
                    "tooltip": "Overlay box color as hex, for example 000000 or #000000."
                }),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "BOOLEAN", "IMAGE")
    RETURN_NAMES = ("Filename", "ManualName", "Name Mode", "image")
    FUNCTION = "output"
    CATEGORY = "AUN Nodes/Image"
    DESCRIPTION = "Replaces the manual/auto subgraph with one node. Auto passes through the input image and filename. Manual returns a blank image sized from width/height and uses the manual name. TIP: Double-click the node or right-click and select the AUN menu option to show overlay controls."

    @staticmethod
    def _to_bool(value):
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"manual", "man", "m", "1", "true", "yes", "on"}:
                return True
            if normalized in {"auto", "a", "0", "false", "no", "off"}:
                return False
        return bool(value)

    @staticmethod
    def _blank_image(width, height, show_overlay=True, overlay_text="No image loaded", background_color="181818", text_color="E6E6E6", box_color="000000", like_image=None):
        dtype = torch.float32
        device = "cpu"

        if like_image is not None and hasattr(like_image, "dtype"):
            dtype = like_image.dtype
        if like_image is not None and hasattr(like_image, "device"):
            device = like_image.device

        width = int(width)
        height = int(height)

        canvas = Image.new(
            "RGB",
            (width, height),
            color=AUNManualAutoImageSwitch._parse_hex_color(background_color, (24, 24, 24)),
        )

        if show_overlay and str(overlay_text or "").strip():
            draw = ImageDraw.Draw(canvas)
            label = str(overlay_text).strip()

            font_size = max(12, min(width, height) // 12)
            try:
                font = ImageFont.truetype("DejaVuSans.ttf", font_size)
            except Exception:
                font = ImageFont.load_default()

            text_bbox = draw.textbbox((0, 0), label, font=font)
            text_width = text_bbox[2] - text_bbox[0]
            text_height = text_bbox[3] - text_bbox[1]
            text_x = max(0, (width - text_width) // 2)
            text_y = max(0, (height - text_height) // 2)

            padding = max(8, font_size // 3)
            box = (
                max(0, text_x - padding),
                max(0, text_y - padding),
                min(width, text_x + text_width + padding),
                min(height, text_y + text_height + padding),
            )
            draw.rounded_rectangle(
                box,
                radius=max(6, padding // 2),
                fill=AUNManualAutoImageSwitch._parse_hex_color(box_color, (0, 0, 0)),
            )
            draw.text(
                (text_x, text_y),
                label,
                font=font,
                fill=AUNManualAutoImageSwitch._parse_hex_color(text_color, (230, 230, 230)),
            )

        image_np = np.asarray(canvas).astype(np.float32) / 255.0
        image_tensor = torch.from_numpy(image_np).unsqueeze(0)
        return image_tensor.to(dtype=dtype, device=device)

    @classmethod
    def IS_CHANGED(cls, image, Filename, width, height, ManualName, name_mode, show_overlay, overlay_text, background_color, text_color, box_color):
        return float("nan")

    def output(self, image, Filename, width, height, ManualName, name_mode, show_overlay=True, overlay_text="No image loaded", background_color="181818", text_color="E6E6E6", box_color="000000"):
        resolved_mode = self._to_bool(name_mode)
        selected_filename = ManualName if resolved_mode else Filename
        output_image = self._blank_image(
            width,
            height,
            show_overlay=show_overlay,
            overlay_text=overlay_text,
            background_color=background_color,
            text_color=text_color,
            box_color=box_color,
            like_image=image,
        ) if resolved_mode else image
        return selected_filename, ManualName, resolved_mode, output_image


NODE_CLASS_MAPPINGS = {
    "AUNManualAutoImageSwitch": AUNManualAutoImageSwitch,
}


NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNManualAutoImageSwitch": "Manual/Auto Image Switch",
}