import math
import random

PRESETS: dict[str, tuple[int, int]] = {
    "512x512": (512, 512),
    "512x682": (512, 682),
    "512x768": (512, 768),
    "640x1536": (640, 1536),
    "720x720": (720, 720),
    "768x1024": (768, 1024),
    "768x1344": (768, 1344),
    "832x1216": (832, 1216),
    "896x1152": (896, 1152),
    "910x512": (910, 512),
    "952x512": (952, 512),
    "1024x512": (1024, 512),
    "1024x1024": (1024, 1024),
    "1224x512": (1224, 512),
}

ASPECT_RATIOS: dict[str, tuple[int, int]] = {
    "1:1 (Square)": (1, 1),
    "2:3 (Portrait Photo)": (2, 3),
    "3:2 (Photo)": (3, 2),
    "3:4 (Portrait Standard)": (3, 4),
    "4:3 (Standard)": (4, 3),
    "9:16 (Portrait Widescreen)": (9, 16),
    "16:9 (Widescreen)": (16, 9),
    "21:9 (Ultrawide)": (21, 9),
}

ASPECT_RATIO_NAMES = ["custom", *PRESETS.keys(), *ASPECT_RATIOS.keys()]

ASPECT_MODE_OPTIONS = ["Random", "Swap", "Original"]

MEGAPIXELS_WIDGET = ("FLOAT", {"default": 1.0, "min": 0.1, "max": 16.0, "step": 0.1, "tooltip": "Target total megapixels used when a ratio is selected."})

MULTIPLE_WIDGET = ("INT", {"default": 8, "min": 8, "max": 128, "step": 8, "tooltip": "Nearest multiple to round computed resolution to. Used with ratio."})


def resolve_dimensions(width: int, height: int, aspect_ratio: str, megapixels: float = 1.0, multiple: int = 8) -> tuple[int, int]:
    if aspect_ratio in ASPECT_RATIOS:
        w_ratio, h_ratio = ASPECT_RATIOS[aspect_ratio]
        total_pixels = megapixels * 1024 * 1024
        scale = math.sqrt(total_pixels / (w_ratio * h_ratio))
        width = round(w_ratio * scale / multiple) * multiple
        height = round(h_ratio * scale / multiple) * multiple
    elif aspect_ratio in PRESETS:
        width, height = PRESETS[aspect_ratio]
    return width, height


def apply_aspect_mode(width: int, height: int, aspect_mode: str) -> tuple[int, int]:
    if aspect_mode == "Random":
        if random.SystemRandom().random() < 0.5:
            width, height = height, width
    elif aspect_mode == "Swap":
        width, height = height, width
    return width, height


def aspect_mode_from_image(ref_image, width: int, height: int, aspect_ratio: str = "") -> str:
    """Return 'Original' or 'Swap' so the final canvas matches ref_image orientation."""
    try:
        ref_h, ref_w = int(ref_image.shape[1]), int(ref_image.shape[2])
    except Exception:
        return "Original"
    ref_portrait = ref_h > ref_w

    base_w, base_h = int(width), int(height)
    ar = (aspect_ratio or "").strip()
    if ar in PRESETS:
        base_w, base_h = PRESETS[ar]
    elif ar in ASPECT_RATIOS:
        rw, rh = ASPECT_RATIOS[ar]
        base_w, base_h = rw, rh
    base_portrait = base_h > base_w

    return "Original" if (ref_portrait == base_portrait) else "Swap"
