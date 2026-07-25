import numpy as np
import torch
from nodes import PreviewImage


COLOR_MAP = {
    "white": (255, 255, 255),
    "black": (0, 0, 0),
    "red": (255, 50, 50),
    "green": (50, 255, 50),
    "blue": (50, 50, 255),
    "yellow": (255, 255, 50),
    "cyan": (50, 255, 255),
    "magenta": (255, 50, 255),
    "orange": (255, 165, 50),
    "#222222": (34, 34, 34),
    "#000000": (0, 0, 0),
    "#444444": (68, 68, 68),
    "#666666": (102, 102, 102),
    "#888888": (136, 136, 136),
    "#AAAAAA": (170, 170, 170),
}

FONT_COLORS = ("white", "black", "red", "green", "blue", "yellow", "cyan", "magenta", "orange")
BG_COLORS = ("#222222", "#000000", "#444444", "#666666", "#888888", "#AAAAAA", "white", "black")


class AUNImageTitleMultiPreview(PreviewImage):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {
                    "tooltip": "Single image (1,H,W,C) or batched images (B,H,W,C).",
                }),
                "show_labels": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "When disabled, images pass through without any label overlay."
                }),
            },
            "optional": {
                "filenames": ("STRING", {
                    "forceInput": True,
                    "multiline": True,
                    "default": "",
                    "tooltip": "Filename for each image in the batch, one per line. Leave empty for no text in the label bar."
                }),
                "label_position": (["bottom", "top"], {
                    "default": "bottom",
                    "tooltip": "Place the label bar below or above the image."
                }),
                "font_scale": ("FLOAT", {
                    "default": 0.035, "min": 0.005, "max": 0.2, "step": 0.001,
                    "tooltip": "Font size as fraction of image height (e.g., 0.035 = 3.5%). Consistent text sizing across different resolutions."
                }),
                "label_height_scale": ("FLOAT", {
                    "default": 1.8, "min": 1.0, "max": 5.0, "step": 0.1,
                    "tooltip": "Label bar height as a multiple of the computed font pixel size."
                }),
                "font_color": (FONT_COLORS, {
                    "default": "white",
                    "tooltip": "Colour of the label text."
                }),
                "bg_color": (BG_COLORS, {
                    "default": "#222222",
                    "tooltip": "Background colour of the label bar."
                }),
                "text_align": (["center", "left", "right"], {
                    "default": "center",
                    "tooltip": "Horizontal alignment of the label text within the bar."
                }),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "preview"
    OUTPUT_NODE = True
    CATEGORY = "AUN Nodes/Image"
    DESCRIPTION = (
        "Preview one or more images with optional filename labels drawn "
        "outside the image. For batched images, newline-separate filenames "
        "to label each frame. "
        "Double-click the node or use the right-click menu to toggle "
        "between compact and full view."
    )

    def preview(
        self,
        images,
        show_labels,
        filenames="",
        label_position="bottom",
        font_scale=0.035,
        label_height_scale=1.8,
        font_color="white",
        bg_color="#222222",
        text_align="center",
        prompt=None,
        extra_pnginfo=None,
        **_,
    ):
        labels = filenames.split("\n") if filenames else []
        num_labels = len(labels)
        bg_color_rgb = _parse_color(bg_color)
        font_color_rgb = _parse_color(font_color)

        result_tensors = []
        if images.dim() == 3:
            images = images.unsqueeze(0)

        for i in range(images.shape[0]):
            img_tensor = images[i : i + 1]
            label_text = labels[i] if i < num_labels else ""

            if show_labels:
                from PIL import Image, ImageDraw, ImageFont
                img_np = img_tensor.squeeze(0).cpu().numpy()
                img_pil = Image.fromarray(
                    np.clip(img_np * 255, 0, 255).astype(np.uint8)
                )
                w, h = img_pil.size
                pixel_font = max(8, int(h * font_scale))
                pixel_label_height = int(pixel_font * label_height_scale)
                canvas = Image.new("RGB", (w, h + pixel_label_height), bg_color_rgb)
                if label_position == "bottom":
                    canvas.paste(img_pil, (0, 0))
                    draw_y = h
                else:
                    canvas.paste(img_pil, (0, pixel_label_height))
                    draw_y = 0

                if label_text:
                    draw = ImageDraw.Draw(canvas)
                    try:
                        font = ImageFont.truetype("DejaVuSans.ttf", pixel_font)
                    except Exception:
                        font = ImageFont.load_default()
                    text = _truncate_text(draw, label_text, font, w - 10)
                    bbox = draw.textbbox((0, 0), text, font=font)
                    tw = bbox[2] - bbox[0]
                    th = bbox[3] - bbox[1]
                    if text_align == "left":
                        x = 5
                    elif text_align == "right":
                        x = w - tw - 5
                    else:
                        x = (w - tw) // 2
                    y = draw_y + (pixel_label_height - th) // 2 - bbox[1]
                    draw.text((x, y), text, fill=font_color_rgb, font=font)

                out_np = np.array(canvas).astype(np.float32) / 255.0
                result_tensors.append(torch.from_numpy(out_np)[None,])
            else:
                result_tensors.append(img_tensor)

        output = torch.cat(result_tensors, dim=0) if result_tensors else images
        return self.save_images(
            output, "AUNImageTitleMulti", prompt, extra_pnginfo
        )


def _parse_color(color_str):
    if color_str in COLOR_MAP:
        return COLOR_MAP[color_str]
    if color_str.startswith("#") and len(color_str) == 7:
        try:
            return (
                int(color_str[1:3], 16),
                int(color_str[3:5], 16),
                int(color_str[5:7], 16),
            )
        except ValueError:
            pass
    return (255, 255, 255)


def _truncate_text(draw, text, font, max_width):
    if draw.textbbox((0, 0), text, font=font)[2] <= max_width:
        return text
    lo, hi = 0, len(text)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        w = draw.textbbox((0, 0), text[:mid] + "...", font=font)[2]
        if w <= max_width:
            lo = mid
        else:
            hi = mid - 1
    return text[:lo] + "..." if lo > 0 else ""


NODE_CLASS_MAPPINGS = {
    "AUNImageTitleMultiPreview": AUNImageTitleMultiPreview
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNImageTitleMultiPreview": "AUN Image Title Multi Preview"
}
