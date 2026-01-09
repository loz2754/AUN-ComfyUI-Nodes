import hashlib
import os
import time
from pathlib import Path
from PIL.PngImagePlugin import PngInfo
import folder_paths
import node_helpers
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageSequence, ImageOps
from comfy.cli_args import args
from server import PromptServer
import re
import comfy

# FramePack-style bucket options and helper (embedded to avoid cross-package imports)
_FRAMEPACK_BUCKET_OPTIONS = {
    (416, 960),
    (448, 864),
    (480, 832),
    (512, 768),
    (544, 704),
    (576, 672),
    (608, 640),
    (640, 608),
    (672, 576),
    (704, 544),
    (768, 512),
    (832, 480),
    (864, 448),
    (960, 416),
}


def _find_nearest_framepack_bucket(h, w, resolution=640):
    """Return (height, width) of the nearest FramePack bucket for aspect ratio, scaled to base resolution."""
    min_metric = float("inf")
    best_bucket = None
    for (bucket_h, bucket_w) in _FRAMEPACK_BUCKET_OPTIONS:
        metric = abs(h * bucket_w - w * bucket_h)
        if metric <= min_metric:
            min_metric = metric
            best_bucket = (bucket_h, bucket_w)

    if best_bucket is None:
        # Fallback: keep original, snapped to 16 multiples
        return (max(16, round(h / 16) * 16), max(16, round(w / 16) * 16))

    if resolution != 640:
        scale_factor = resolution / 640.0
        scaled_height = round(best_bucket[0] * scale_factor / 16) * 16
        scaled_width = round(best_bucket[1] * scale_factor / 16) * 16
        best_bucket = (scaled_height, scaled_width)

    return best_bucket

def clean_filename_for_output(filename_without_ext, max_words=0):
    """Replace symbols with spaces, collapse whitespace, optionally drop a trailing numeric counter,
    and limit to at most max_words. Preserves purely-numeric names and numeric-only multi-word names.
    """
    # Pattern for characters to be replaced by a space (includes _-!£$%^&*|\/?.,{}[]())
    pattern = r'[_\-!£$%^&*|\\\/?.,{}\[\]()]'

    # Replace unwanted characters with a space and normalize whitespace
    cleaned_with_spaces = re.sub(pattern, ' ', filename_without_ext)
    cleaned = re.sub(r'\s+', ' ', cleaned_with_spaces).strip()

    # Tokenize into words
    words = cleaned.split()

    # Drop trailing numeric tokens if there is a preceding token containing letters.
    # This keeps names like "00291-7876545" (both numeric) intact, but trims "MyImage 00012" -> "MyImage".
    while len(words) >= 2 and words[-1].isdigit():
        has_alpha_before = any(re.search(r'[A-Za-z]', w) for w in words[:-1])
        if has_alpha_before:
            words.pop()
        else:
            break

    # Limit to a maximum number of words
    try:
        max_words_int = int(max_words)
    except Exception:
        max_words_int = 0

    if max_words_int > 0 and len(words) > max_words_int:
        words = words[:max_words_int]

    return ' '.join(words)

class AUNImageLoadResize:
    @classmethod
    def INPUT_TYPES(cls):
        input_dir = folder_paths.get_input_directory()
        files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
        return {"required":
                    {
                    "image": (sorted(files), {
                        "image_upload": True,
                        "tooltip": "Select image file from input directory or upload new image."
                    }),
                    "resize": ("BOOLEAN", {
                        "default": False,
                        "tooltip": "Enable automatic resizing to specified dimensions. Maintains aspect ratio."
                    }),
                    "use_framepack_bucket": ("BOOLEAN", {
                        "default": False,
                        "tooltip": "If enabled (with resize), choose nearest FramePack bucket based on aspect ratio and base resolution."
                    }),
                    "base_resolution": ("INT", {
                        "default": 640, "min": 320, "max": 2048, "step": 16,
                        "tooltip": "Base resolution for bucket scaling. 640 matches original; higher scales proportionally."
                    }),
                    "width": ("INT", {
                        "default": 512, "min": 0, "max": 2048, "step": 8,
                        "tooltip": "Target width for resizing (8-pixel increments). Only used if resize is enabled."
                    }),
                    "height": ("INT", {
                        "default": 512, "min": 0, "max": 2048,"step": 8,
                        "tooltip": "Target height for resizing (8-pixel increments). Only used if resize is enabled."
                    }),
                    "method": (["stretch", "keep proportion", "fill / crop", "pad"], {
                        "default": "keep proportion",
                        "tooltip": "Resize strategy: stretch to exact size, keep aspect ratio, fill then crop, or pad to fit."
                    }),
                    "crop_position": (["center", "left", "right", "top", "bottom"], {
                        "default": "center",
                        "tooltip": "When using fill / crop, choose which edge or center anchors the crop window."
                    }),
                    "interpolation": (["nearest", "bilinear", "bicubic", "area", "nearest-exact", "lanczos"], {
                        "default": "lanczos",
                        "tooltip": "Interpolation filter used during resizing."
                    }),
                    "max_num_words": ("INT", {
                        "default": 0, "min": 0, "max": 32, "step": 1,
                        "tooltip": "Maximum number of words to keep for both filename outputs. Set to 0 for no limit."
                    }),
                    },
                "hidden": {"prompt": "PROMPT"}
                }

    CATEGORY = "AUN Nodes/Image"
    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "STRING", "INT", "INT")
    RETURN_NAMES = ("IMAGE", "MASK", "filename", "cleaned filename", "width", "height")
    FUNCTION = "load_image"
    DESCRIPTION = "Load images with optional automatic resizing. Supports FramePack nearest-bucket sizing, maintains aspect ratio, and provides filename information for workflow organization."

    def load_image(self, image, resize, use_framepack_bucket, base_resolution, width, height, method="keep proportion", crop_position="center", interpolation="lanczos", max_num_words=0, divisible_by=8, prompt=None):

        image_path = folder_paths.get_annotated_filepath(image)
        filename = image.rsplit('.', 1)[0]  # get image name
        img = node_helpers.pillow(Image.open, image_path)

        output_images = []
        output_masks = []
        final_w, final_h = None, None

        # Helpers for resizing using torch / comfy
        def _interp_nchw(t, tw, th, mode):
            # t: (N,C,H,W)
            if mode == "lanczos":
                return comfy.utils.lanczos(t, tw, th)
            if mode in ("bilinear", "bicubic"):
                return F.interpolate(t, size=(th, tw), mode=mode, align_corners=False)
            else:
                # nearest, nearest-exact, area
                return F.interpolate(t, size=(th, tw), mode=mode)

        def _resize_nchw(t, target_w, target_h, mode, strat, crop_anchor="center"):
            # t: (N,C,H,W) -> (N,C,h,w)
            _, _, oh, ow = t.shape
            # Defaults
            tgt_w = target_w if target_w and target_w > 0 else ow
            tgt_h = target_h if target_h and target_h > 0 else oh

            if strat == 'keep proportion' or strat == 'pad':
                ratio = min(tgt_w / ow, tgt_h / oh)
                new_w = max(1, int(round(ow * ratio)))
                new_h = max(1, int(round(oh * ratio)))
                out = _interp_nchw(t, new_w, new_h, mode)
                if strat == 'pad':
                    pad_left = (tgt_w - new_w) // 2
                    pad_right = tgt_w - new_w - pad_left
                    pad_top = (tgt_h - new_h) // 2
                    pad_bottom = tgt_h - new_h - pad_top
                    if pad_left > 0 or pad_right > 0 or pad_top > 0 or pad_bottom > 0:
                        out = F.pad(out, (pad_left, pad_right, pad_top, pad_bottom), value=0.0)
                return out
            elif strat.startswith('fill'):
                ratio = max(tgt_w / ow, tgt_h / oh)
                new_w = max(1, int(round(ow * ratio)))
                new_h = max(1, int(round(oh * ratio)))
                out = _interp_nchw(t, new_w, new_h, mode)
                
                dx = max(0, new_w - tgt_w)
                dy = max(0, new_h - tgt_h)
                anchor = (crop_anchor or "center").lower()

                if anchor == "left":
                    x = 0
                elif anchor == "right":
                    x = dx
                else:
                    x = dx // 2

                if anchor == "top":
                    y = 0
                elif anchor == "bottom":
                    y = dy
                else:
                    y = dy // 2

                return out[:, :, y:y+tgt_h, x:x+tgt_w]
            else:  # stretch
                return _interp_nchw(t, tgt_w, tgt_h, mode)

        W, H = img.size

        # Determine target dimensions based on options
        if not resize:
            target_w, target_h = W, H
            effective_method = 'stretch'
        else:
            if use_framepack_bucket:
                bucket_h, bucket_w = _find_nearest_framepack_bucket(H, W, resolution=base_resolution)
                target_w, target_h = bucket_w, bucket_h
            else:
                target_w = width if width and width > 0 else W
                target_h = height if height and height > 0 else H
                if divisible_by > 1:
                    target_w = target_w - (target_w % divisible_by)
                    target_h = target_h - (target_h % divisible_by)

            # For bucket + keep proportion, prefer padding to hit exact bucket dims
            effective_method = method
            if use_framepack_bucket and method == 'keep proportion':
                effective_method = 'pad'

        for i in ImageSequence.Iterator(img):
            i = node_helpers.pillow(ImageOps.exif_transpose, i)

            if i.mode == 'I':
                i = i.point(lambda i: i * (1 / 255))
            pil_rgb = i.convert("RGB")

            # To torch (NCHW)
            rgb_np = np.array(pil_rgb).astype(np.float32) / 255.0  # (H,W,3)
            rgb_t = torch.from_numpy(rgb_np).permute(2, 0, 1).unsqueeze(0)  # (1,3,H,W)

            # Build/resize mask to match output size
            if 'A' in i.getbands():
                alpha_np = np.array(i.getchannel('A')).astype(np.float32) / 255.0  # (H,W)
                # Invert to match other nodes' convention (1 is keep, 0 is masked), original code used 1 - alpha
                mask_t = 1.0 - torch.from_numpy(alpha_np).unsqueeze(0).unsqueeze(0)  # (1,1,H,W)
            else:
                # placeholder, will be resized to final dims later
                mask_t = None

            if resize:
                # Ensure valid target sizes (avoid zeros)
                tgt_w = max(1, int(target_w))
                tgt_h = max(1, int(target_h))
                # Resize color
                rgb_out = _resize_nchw(rgb_t, tgt_w, tgt_h, interpolation, effective_method, crop_position)
                # Resize mask with bilinear for smooth edges (or same method if preferred)
                if mask_t is None:
                    mask_out = torch.zeros((1, 1, rgb_out.shape[2], rgb_out.shape[3]), dtype=torch.float32)
                else:
                    mask_out = _resize_nchw(mask_t, tgt_w, tgt_h, 'bilinear', effective_method, crop_position)
            else:
                rgb_out = rgb_t
                if mask_t is None:
                    mask_out = torch.zeros((1, 1, rgb_out.shape[2], rgb_out.shape[3]), dtype=torch.float32)
                else:
                    mask_out = mask_t

            # Save and track final size
            final_h, final_w = rgb_out.shape[2], rgb_out.shape[3]
            output_images.append(rgb_out.permute(0, 2, 3, 1))  # to (1,H,W,3)
            output_masks.append(mask_out.squeeze(1))          # to (1,H,W)

        output_image = torch.cat(output_images, dim=0)
        output_mask = torch.cat(output_masks, dim=0)

        cleaned_filename = clean_filename_for_output(filename, max_num_words)
        
        # Apply word limit to raw filename if requested, preserving original separators
        if max_num_words > 0:
            parts = re.split(r'([_\s\-]+)', filename)
            words_seen = 0
            new_parts = []
            for p in parts:
                if p and not re.match(r'^[_\s\-]+$', p):
                    words_seen += 1
                if words_seen > max_num_words:
                    break
                new_parts.append(p)
            filename = "".join(new_parts).rstrip("_ -")

        return (output_image, output_mask, filename, cleaned_filename, final_w or width, final_h or height)


    # @classmethod
    # def IS_CHANGED(cls, image):
    #     image_path = folder_paths.get_annotated_filepath(image)
    #     m = hashlib.sha256()
    #     with open(image_path, 'rb') as f:
    #         m.update(f.read())
    #     return m.digest().hex()

    @classmethod
    def VALIDATE_INPUTS(cls, image):
        if not folder_paths.exists_annotated_filepath(image):
            return "Invalid image file: {}".format(image)

        return True
    
NODE_CLASS_MAPPINGS = {
    "AUNImageLoadResize": AUNImageLoadResize,

}

# A dictionary that contains the friendly/humanly readable titles for the nodes
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNImageLoadResize": "AUN Load & Resize Image",

}
