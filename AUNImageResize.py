import torch
import torch.nn.functional as F
import comfy

from .AUNImageLoadResize import _find_nearest_framepack_bucket


class AUNImageResize:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {
                    "forceInput": True,
                    "tooltip": "Image tensor to resize."
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
                    "default": 512, "min": 0, "max": 2048, "step": 8,
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
            },
            "optional": {
                "mask": ("MASK", {
                    "tooltip": "Optional mask tensor resized alongside the image."
                })
            }
        }

    CATEGORY = "AUN Nodes/Image"
    RETURN_TYPES = ("IMAGE", "MASK", "INT", "INT")
    RETURN_NAMES = ("IMAGE", "MASK", "width", "height")
    FUNCTION = "resize_image"
    DESCRIPTION = "Resize an input image tensor using the same strategies as AUN Load & Resize Image, including FramePack buckets and fill/crop anchoring, but without handling file I/O."

    def resize_image(
        self,
        image,
        resize,
        use_framepack_bucket,
        base_resolution,
        width,
        height,
        method="keep proportion",
        crop_position="center",
        interpolation="lanczos",
        mask=None,
        divisible_by=8,
    ):
        if image is None:
            raise ValueError("Image input is required.")

        if image.dim() == 3:
            image = image.unsqueeze(0)

        rgb_t = image.to(torch.float32).permute(0, 3, 1, 2).contiguous()
        batch, _, orig_h, orig_w = rgb_t.shape

        if mask is not None:
            mask_t = mask.to(torch.float32)
            if mask_t.dim() == 3:
                mask_t = mask_t.unsqueeze(1)
            elif mask_t.dim() == 2:
                mask_t = mask_t.unsqueeze(0).unsqueeze(0)
            elif mask_t.dim() == 4 and mask_t.shape[1] != 1:
                mask_t = mask_t[:, :1]
        else:
            mask_t = torch.zeros((batch, 1, orig_h, orig_w), dtype=torch.float32, device=rgb_t.device)

        def _interp_nchw(tensor, target_w, target_h, mode):
            if mode == "lanczos":
                return comfy.utils.lanczos(tensor, target_w, target_h)
            if mode in ("bilinear", "bicubic"):
                return F.interpolate(tensor, size=(target_h, target_w), mode=mode, align_corners=False)
            return F.interpolate(tensor, size=(target_h, target_w), mode=mode)

        def _resize_nchw(tensor, target_w, target_h, mode, strategy, crop_anchor="center"):
            _, _, old_h, old_w = tensor.shape
            tgt_w = target_w if target_w and target_w > 0 else old_w
            tgt_h = target_h if target_h and target_h > 0 else old_h

            if strategy in ("keep proportion", "pad"):
                ratio = min(tgt_w / old_w, tgt_h / old_h)
                new_w = max(1, int(round(old_w * ratio)))
                new_h = max(1, int(round(old_h * ratio)))
                out = _interp_nchw(tensor, new_w, new_h, mode)
                if strategy == "pad":
                    pad_left = (tgt_w - new_w) // 2
                    pad_right = tgt_w - new_w - pad_left
                    pad_top = (tgt_h - new_h) // 2
                    pad_bottom = tgt_h - new_h - pad_top
                    if pad_left > 0 or pad_right > 0 or pad_top > 0 or pad_bottom > 0:
                        out = F.pad(out, (pad_left, pad_right, pad_top, pad_bottom), value=0.0)
                return out

            if strategy.startswith("fill"):
                ratio = max(tgt_w / old_w, tgt_h / old_h)
                new_w = max(1, int(round(old_w * ratio)))
                new_h = max(1, int(round(old_h * ratio)))
                out = _interp_nchw(tensor, new_w, new_h, mode)
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

                return out[:, :, y:y + tgt_h, x:x + tgt_w]

            return _interp_nchw(tensor, tgt_w, tgt_h, mode)

        if not resize:
            target_w, target_h = orig_w, orig_h
            effective_method = "stretch"
        else:
            if use_framepack_bucket:
                bucket_h, bucket_w = _find_nearest_framepack_bucket(orig_h, orig_w, resolution=base_resolution)
                target_w, target_h = bucket_w, bucket_h
            else:
                target_w = width if width and width > 0 else orig_w
                target_h = height if height and height > 0 else orig_h
                if divisible_by > 1:
                    target_w = max(divisible_by, target_w - (target_w % divisible_by))
                    target_h = max(divisible_by, target_h - (target_h % divisible_by))

            effective_method = method
            if use_framepack_bucket and method == "keep proportion":
                effective_method = "pad"

        tgt_w = max(1, int(target_w))
        tgt_h = max(1, int(target_h))

        if resize:
            rgb_out = _resize_nchw(rgb_t, tgt_w, tgt_h, interpolation, effective_method, crop_position)
            mask_out = _resize_nchw(mask_t, tgt_w, tgt_h, "bilinear", effective_method, crop_position)
        else:
            rgb_out = rgb_t
            mask_out = mask_t

        final_h, final_w = rgb_out.shape[2], rgb_out.shape[3]
        output_image = rgb_out.permute(0, 2, 3, 1).contiguous()
        output_mask = mask_out.squeeze(1)

        return (output_image, output_mask, final_w, final_h)


NODE_CLASS_MAPPINGS = {
    "AUNImageResize": AUNImageResize,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNImageResize": "AUN Resize Image",
}
