"""Shared helpers for AUN image loading nodes.

Powers ``AUNImageLoaderPro``:

- ``plan_load_size`` / ``apply_load_size`` — size planning as plain numbers and
  the tensor pass that carries it out. The planner is mirrored in
  ``web/aun_load_size.js`` so the node can show the size before a run;
  ``tools/check_load_size_parity.py`` holds both to the same answers.
- filename cleaning (``clean_filename_for_output``)
- folder listing, search patterns and index ranges for batch loading
- FramePack nearest-bucket sizing

The size maths follows the same rules as AusBoss's ``plan_load_size``
(MIT licensed, https://github.com/ausboss/ComfyUI-ausboss-nodes).
"""

import math
import os
import re

import folder_paths
import numpy as np
import torch
import torch.nn.functional as F

try:
    import comfy.utils as comfy_utils
except Exception:  # pragma: no cover - ComfyUI always ships comfy.utils
    comfy_utils = None

from .aun_input_files_shared import list_input_images  # noqa: F401  (re-exported)

__all__ = [
    "SIZE_MODES",
    "CROP_SIDES",
    "RATIOS",
    "INTERPOLATION_METHODS",
    "plan_load_size",
    "apply_load_size",
    "clean_filename_for_output",
    "load_predefined_paths",
    "list_folder_images",
    "filter_files_by_search",
    "parse_indices",
    "find_nearest_framepack_bucket",
    "list_input_images",
]

# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------

SIZE_MODES = (
    "off",
    "megapixels",
    "longest side",
    "scale",
    "fit inside",
    "fit + pad",
    "crop to fill",
    "crop",
    "crop to ratio",
    "stretch",
    "framepack bucket",
)

CROP_SIDES = (
    "center",
    "top",
    "bottom",
    "left",
    "right",
    "top left",
    "top right",
    "bottom left",
    "bottom right",
)

RATIOS = (
    "1:1",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
    "16:9",
    "9:16",
    "5:4",
    "4:5",
    "21:9",
    "9:21",
    "2:1",
    "1:2",
    "width : height",
)

INTERPOLATION_METHODS = (
    "lanczos",
    "bicubic",
    "bilinear",
    "nearest",
    "nearest-exact",
    "area",
)

_IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".bmp", ".webp", ".gif", ".tif", ".tiff")


# ---------------------------------------------------------------------------
# FramePack buckets
# ---------------------------------------------------------------------------

_FRAMEPACK_BUCKET_OPTIONS = (
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
)


def find_nearest_framepack_bucket(height, width, resolution=640):
    """Return (height, width) of the nearest FramePack bucket for an aspect ratio."""
    min_metric = float("inf")
    best_bucket = None
    for bucket_h, bucket_w in _FRAMEPACK_BUCKET_OPTIONS:
        metric = abs(height * bucket_w - width * bucket_h)
        if metric <= min_metric:
            min_metric = metric
            best_bucket = (bucket_h, bucket_w)

    if best_bucket is None:
        return (
            max(16, _round_half_up(height / 16) * 16),
            max(16, _round_half_up(width / 16) * 16),
        )

    if resolution != 640:
        scale_factor = resolution / 640.0
        scaled_height = max(16, _round_half_up(best_bucket[0] * scale_factor / 16) * 16)
        scaled_width = max(16, _round_half_up(best_bucket[1] * scale_factor / 16) * 16)
        best_bucket = (scaled_height, scaled_width)

    return best_bucket


# ---------------------------------------------------------------------------
# Size planning
# ---------------------------------------------------------------------------


def _round_half_up(value):
    """Round half up; Python's round() would round .5 toward even."""
    return int(math.floor(float(value) + 0.5))


def _nearest_multiple(value, step):
    """Nearest multiple, never below one step."""
    step = max(1, int(step))
    return max(step, _round_half_up(int(value) / step) * step)


def _multiple_below(value, step):
    """Largest multiple not above ``value``, never below one pixel."""
    step = max(1, int(step))
    return max(1, (int(value) // step) * step)


def _multiple_inside(value, step):
    """Round down to a multiple; leave a value smaller than one step alone."""
    value = int(value)
    step = max(1, int(step))
    return (value // step) * step if value >= step else value


def _crop_start(spare, side, low, high):
    """Where a cut starts along one edge with ``spare`` pixels to lose."""
    if low in side:
        return 0
    if high in side:
        return int(spare)
    return int(spare) // 2


def _ratio_terms(ratio, width, height):
    if ratio == "width : height":
        return max(1, int(width)), max(1, int(height))
    across, _, down = str(ratio or "1:1").partition(":")
    try:
        across_n = int(across)
        down_n = int(down)
    except (TypeError, ValueError):
        return 1, 1
    return max(1, across_n), max(1, down_n)


def plan_load_size(
    source_width,
    source_height,
    size="off",
    megapixels=1.0,
    longest_side=1024,
    scale=1.0,
    width=1024,
    height=1024,
    multiple=8,
    enlarge=True,
    crop_from="center",
    ratio="1:1",
    base_resolution=640,
):
    """What one picture is resized to, and where it is cropped or padded.

    Returns a dict with ``resize_width``/``resize_height`` (what the picture is
    interpolated to), ``crop_x``/``crop_y`` (where a crop starts), pad amounts
    and the final ``width``/``height``.

    ``multiple`` rounds a size that is being changed and is never applied while
    ``size`` is off. ``enlarge`` off keeps a picture from coming out larger
    than it went in.
    """
    source_w = max(1, int(source_width))
    source_h = max(1, int(source_height))
    size = str(size or "off")
    if size not in SIZE_MODES:
        raise ValueError(f"size must be one of {SIZE_MODES}, got '{size}'.")

    plan = {
        "resize_width": source_w,
        "resize_height": source_h,
        "crop_x": 0,
        "crop_y": 0,
        "pad_left": 0,
        "pad_top": 0,
        "pad_right": 0,
        "pad_bottom": 0,
        "width": source_w,
        "height": source_h,
    }
    if size == "off":
        return plan

    step = max(1, int(multiple))
    side = crop_from if crop_from in CROP_SIDES else "center"
    box_w = max(1, int(width))
    box_h = max(1, int(height))

    def cut(resize_w, resize_h, out_w, out_h):
        plan.update(
            resize_width=int(resize_w),
            resize_height=int(resize_h),
            crop_x=_crop_start(int(resize_w) - int(out_w), side, "left", "right"),
            crop_y=_crop_start(int(resize_h) - int(out_h), side, "top", "bottom"),
            width=int(out_w),
            height=int(out_h),
        )
        return plan

    def pad_to(canvas_w, canvas_h):
        canvas_w, canvas_h = max(1, int(canvas_w)), max(1, int(canvas_h))
        fit = min(canvas_w / source_w, canvas_h / source_h)
        if not enlarge:
            fit = min(fit, 1.0)
        resize_w = min(canvas_w, max(1, _round_half_up(source_w * fit)))
        resize_h = min(canvas_h, max(1, _round_half_up(source_h * fit)))
        left = (canvas_w - resize_w) // 2
        top = (canvas_h - resize_h) // 2
        plan.update(
            resize_width=resize_w,
            resize_height=resize_h,
            pad_left=left,
            pad_top=top,
            pad_right=canvas_w - resize_w - left,
            pad_bottom=canvas_h - resize_h - top,
            width=canvas_w,
            height=canvas_h,
        )
        return plan

    if size == "crop":
        out_w = _multiple_inside(min(box_w, source_w), step)
        out_h = _multiple_inside(min(box_h, source_h), step)
        return cut(source_w, source_h, max(1, out_w), max(1, out_h))

    if size == "crop to ratio":
        across, down = _ratio_terms(ratio, box_w, box_h)
        if source_w * down >= source_h * across:
            out_w = min(source_w, max(1, _round_half_up(source_h * across / down)))
            out_h = source_h
        else:
            out_h = min(source_h, max(1, _round_half_up(source_w * down / across)))
            out_w = source_w
        out_w = max(1, _multiple_inside(out_w, step))
        out_h = max(1, _multiple_inside(out_h, step))
        return cut(source_w, source_h, out_w, out_h)

    if size == "crop to fill":
        canvas_w, canvas_h = box_w, box_h
        if not enlarge:
            grow = max(canvas_w / source_w, canvas_h / source_h)
            if grow > 1.0:
                canvas_w = max(1, int(math.floor(canvas_w / grow + 1e-6)))
                canvas_h = max(1, int(math.floor(canvas_h / grow + 1e-6)))
            canvas_w = min(_multiple_below(canvas_w, step), max(step, source_w))
            canvas_h = min(_multiple_below(canvas_h, step), max(step, source_h))
        else:
            canvas_w = _nearest_multiple(canvas_w, step)
            canvas_h = _nearest_multiple(canvas_h, step)
        cover = max(canvas_w / source_w, canvas_h / source_h)
        resize_w = max(canvas_w, math.ceil(source_w * cover - 1e-6))
        resize_h = max(canvas_h, math.ceil(source_h * cover - 1e-6))
        return cut(resize_w, resize_h, canvas_w, canvas_h)

    if size == "stretch":
        return cut(
            _multiple_below(box_w, step),
            _multiple_below(box_h, step),
            _multiple_below(box_w, step),
            _multiple_below(box_h, step),
        )

    if size == "framepack bucket":
        resolution = max(64, int(base_resolution))
        bucket_h, bucket_w = find_nearest_framepack_bucket(source_h, source_w, resolution)
        return pad_to(bucket_w, bucket_h)

    if size == "fit + pad":
        canvas_w = _nearest_multiple(box_w, step) if enlarge else min(_multiple_below(box_w, step), max(step, source_w))
        canvas_h = _nearest_multiple(box_h, step) if enlarge else min(_multiple_below(box_h, step), max(step, source_h))
        return pad_to(canvas_w, canvas_h)

    # megapixels / longest side / scale / fit inside — the picture's shape is kept.
    if size == "megapixels":
        amount = float(megapixels)
        if amount <= 0.0:
            target_w, target_h = source_w, source_h
        else:
            factor = math.sqrt(amount * 1e6 / (source_w * source_h))
            target_w = max(1, _round_half_up(source_w * factor))
            target_h = max(1, _round_half_up(source_h * factor))
        box_w = max(1, target_w)
        box_h = max(1, target_h)
    elif size == "longest side":
        edge = int(longest_side)
        if edge <= 0:
            target_w, target_h = source_w, source_h
        else:
            factor = edge / max(source_w, source_h)
            target_w = max(1, _round_half_up(source_w * factor))
            target_h = max(1, _round_half_up(source_h * factor))
        box_w = max(1, target_w)
        box_h = max(1, target_h)
    elif size == "scale":
        factor = float(scale)
        if factor <= 0.0:
            target_w, target_h = source_w, source_h
        else:
            target_w = max(1, _round_half_up(source_w * factor))
            target_h = max(1, _round_half_up(source_h * factor))
        box_w = max(1, target_w)
        box_h = max(1, target_h)
    else:  # fit inside
        fit = min(box_w / source_w, box_h / source_h)
        target_w = max(1, _round_half_up(source_w * fit))
        target_h = max(1, _round_half_up(source_h * fit))

    if size == "fit inside":
        # Rounding may leave the box; step down when it would.
        out_w = _nearest_multiple(target_w, step)
        if out_w > box_w:
            out_w = _multiple_below(box_w, step)
        out_h = _nearest_multiple(target_h, step)
        if out_h > box_h:
            out_h = _multiple_below(box_h, step)
    else:
        out_w = _nearest_multiple(target_w, step)
        out_h = _nearest_multiple(target_h, step)
    if not enlarge:
        if out_w > source_w:
            out_w = _multiple_below(source_w, step)
        if out_h > source_h:
            out_h = _multiple_below(source_h, step)
    return cut(out_w, out_h, out_w, out_h)


# ---------------------------------------------------------------------------
# Resampling
# ---------------------------------------------------------------------------


def _lanczos(tensor, width, height):
    if comfy_utils is not None and hasattr(comfy_utils, "lanczos"):
        return comfy_utils.lanczos(tensor, width, height)
    # Fallback: bilinear through torch, still float and antialiased.
    return F.interpolate(tensor, size=(height, width), mode="bilinear", align_corners=False, antialias=True)


def resample_batch(batch, width, height, method):
    """Resize an NCHW float batch. Returns it untouched when the size matches."""
    width, height = int(width), int(height)
    if width <= 0 or height <= 0:
        raise ValueError("Resize needs a target above 0x0.")
    if int(batch.shape[-1]) == width and int(batch.shape[-2]) == height:
        return batch
    method = str(method or "lanczos")
    if method not in INTERPOLATION_METHODS:
        raise ValueError(f"method must be one of {INTERPOLATION_METHODS}, got '{method}'.")
    tensor = batch.float()
    if method == "lanczos":
        return _lanczos(tensor, width, height).clamp_(0.0, 1.0)
    if method in ("bilinear", "bicubic"):
        downscale = width < int(tensor.shape[-1]) or height < int(tensor.shape[-2])
        result = F.interpolate(
            tensor,
            size=(height, width),
            mode=method,
            align_corners=False,
            antialias=downscale,
        )
        return result.clamp_(0.0, 1.0) if method == "bicubic" else result
    return F.interpolate(tensor, size=(height, width), mode=method)


def apply_load_size(image, mask, plan, method="lanczos"):
    """Run a plan on a BHWC picture and its BHW mask.

    The mask is always resampled bilinear so its edges stay smooth.
    """
    out_w = int(plan["width"])
    out_h = int(plan["height"])
    resize_w = int(plan["resize_width"])
    resize_h = int(plan["resize_height"])

    nchw = image.permute(0, 3, 1, 2).contiguous().float()
    mask_nchw = mask.unsqueeze(1).contiguous().float()

    if (int(nchw.shape[-1]), int(nchw.shape[-2])) != (resize_w, resize_h):
        nchw = resample_batch(nchw, resize_w, resize_h, method)
        mask_nchw = resample_batch(mask_nchw, resize_w, resize_h, "bilinear")

    pad_left = int(plan.get("pad_left", 0))
    pad_top = int(plan.get("pad_top", 0))
    pad_right = int(plan.get("pad_right", 0))
    pad_bottom = int(plan.get("pad_bottom", 0))
    if pad_left or pad_top or pad_right or pad_bottom:
        canvas = torch.zeros(
            (nchw.shape[0], nchw.shape[1], out_h, out_w),
            dtype=nchw.dtype,
            device=nchw.device,
        )
        canvas[:, :, pad_top : pad_top + resize_h, pad_left : pad_left + resize_w] = nchw
        nchw = canvas
        mask_canvas = torch.zeros(
            (mask_nchw.shape[0], 1, out_h, out_w),
            dtype=mask_nchw.dtype,
            device=mask_nchw.device,
        )
        mask_canvas[:, :, pad_top : pad_top + resize_h, pad_left : pad_left + resize_w] = mask_nchw
        mask_nchw = mask_canvas
    elif (resize_w, resize_h) != (out_w, out_h):
        crop_x = max(0, int(plan.get("crop_x", 0)))
        crop_y = max(0, int(plan.get("crop_y", 0)))
        nchw = nchw[:, :, crop_y : crop_y + out_h, crop_x : crop_x + out_w].contiguous()
        mask_nchw = mask_nchw[:, :, crop_y : crop_y + out_h, crop_x : crop_x + out_w].contiguous()

    image_out = nchw.permute(0, 2, 3, 1).contiguous()
    mask_out = mask_nchw.squeeze(1).clamp(0.0, 1.0).contiguous()
    return image_out, mask_out


# ---------------------------------------------------------------------------
# Filenames
# ---------------------------------------------------------------------------


def clean_filename_for_output(filename_without_ext, max_words=0):
    """Replace symbols with spaces, collapse whitespace and limit word count.

    A trailing numeric counter is dropped when the name has letters, so
    ``MyImage_00012`` reads ``MyImage`` while ``00291-7876545`` stays whole.
    """
    pattern = r'[_\-!£$%^&*|\\\/?.,{}\[\]()]'
    cleaned = re.sub(r"\s+", " ", re.sub(pattern, " ", filename_without_ext)).strip()
    words = cleaned.split()

    while len(words) >= 2 and words[-1].isdigit():
        if any(re.search(r"[A-Za-z]", word) for word in words[:-1]):
            words.pop()
        else:
            break

    try:
        limit = int(max_words)
    except Exception:
        limit = 0
    if limit > 0 and len(words) > limit:
        words = words[:limit]
    return " ".join(words)


def limit_filename_words(filename, max_words):
    """Trim the raw filename to ``max_words`` words, keeping its separators."""
    try:
        limit = int(max_words)
    except Exception:
        limit = 0
    if limit <= 0:
        return filename
    parts = re.split(r"([_\s\-]+)", filename)
    seen = 0
    kept = []
    for part in parts:
        if part and not re.match(r"^[_\s\-]+$", part):
            seen += 1
        if seen > limit:
            break
        kept.append(part)
    return "".join(kept).rstrip("_ -")


# ---------------------------------------------------------------------------
# Folders, search patterns and indices
# ---------------------------------------------------------------------------


def load_predefined_paths():
    """Read the node's folder list: local file, legacy name, example, defaults."""
    base_dir = os.path.dirname(__file__)
    local_file = os.path.join(base_dir, "predefined_paths.local.json")
    legacy_file = os.path.join(base_dir, "predefined_paths.json")
    example_file = os.path.join(base_dir, "predefined_paths.example.json")

    try:
        default_paths = [os.path.normpath(folder_paths.get_input_directory())]
    except Exception:
        default_paths = []

    def _read(path):
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as handle:
                paths = __import__("json").load(handle)
            if isinstance(paths, list):
                return paths
            print(f"[AUNNodes] ERROR: {os.path.basename(path)} is not a valid list. Ignoring.")
            return None
        except Exception as exc:
            print(f"[AUNNodes] ERROR: Could not read {os.path.basename(path)}: {exc}.")
            return None

    for candidate in (local_file, legacy_file, example_file):
        paths = _read(candidate)
        if paths is not None:
            return paths

    if default_paths:
        try:
            with open(local_file, "w", encoding="utf-8") as handle:
                __import__("json").dump(default_paths, handle, indent=4)
            print(f"[AUNNodes] Created {os.path.basename(local_file)} with safe defaults.")
        except Exception as exc:
            print(f"[AUNNodes] ERROR: Could not create {os.path.basename(local_file)}: {exc}")
    return default_paths


def _natural_sort_key(value):
    """Human order: 'John 2' < 'John 10' < 'John 101'."""
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", value)]


def list_folder_images(folder):
    """Image files in a folder, naturally sorted."""
    if not folder or not os.path.isdir(folder):
        raise FileNotFoundError(f"Folder not found: {folder}")
    return sorted(
        [
            name
            for name in os.listdir(folder)
            if name.lower().endswith(_IMAGE_EXTENSIONS) and not name.startswith(".")
        ],
        key=_natural_sort_key,
    )


def _parse_numeric_ranges(ranges_str):
    """Parse '7-14' or '1-5, 7-14, 20' into [(lo, hi), ...]. None when invalid."""
    ranges = []
    for part in ranges_str.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            bits = part.split("-")
            if len(bits) != 2:
                return None
            try:
                low, high = int(bits[0].strip()), int(bits[1].strip())
            except ValueError:
                return None
            ranges.append((min(low, high), max(low, high)))
        else:
            try:
                number = int(part)
            except ValueError:
                return None
            ranges.append((number, number))
    return ranges or None


def _parse_name_range_query(pattern):
    """Parse 'Name [min-max]' / 'Name [1-5, 7-14]' / '[7-14]'."""
    match = re.match(r"^(?P<name>.*?)\s*\[\s*(?P<ranges>[\d\s,\-]+)\s*\]\s*$", pattern)
    if not match:
        return None
    ranges = _parse_numeric_ranges(match.group("ranges"))
    if ranges is None:
        return None
    return match.group("name").strip(), ranges


def _split_or_clauses(pattern):
    """Split on ';' for OR queries. Drops empty clauses."""
    return [clause.strip() for clause in pattern.split(";") if clause.strip()]


def _matches_single_pattern(filename, pattern):
    """Match one clause against a filename without its extension."""
    name_range = _parse_name_range_query(pattern)
    if name_range is not None:
        name_part, ranges = name_range
        if name_part and name_part.lower() not in filename.lower():
            return False
        tail = re.search(r"(\d+)\s*$", filename)
        if not tail:
            return False
        try:
            number = int(tail.group(1))
        except ValueError:
            return False
        return any(low <= number <= high for low, high in ranges)

    import fnmatch

    if any(char in pattern for char in "*?[]"):
        return fnmatch.fnmatch(filename.lower(), pattern.lower())
    if any(char in pattern for char in ".^$+{}|()\\"):
        try:
            return re.search(pattern, filename, re.IGNORECASE) is not None
        except re.error:
            return pattern.lower() in filename.lower()
    return pattern.lower() in filename.lower()


def filter_files_by_search(files, search_pattern, search_enabled):
    """Filter files by name-range queries, wildcards, regex or plain text.

    Separate clauses with ';' for OR. Order is preserved and there are no
    duplicates.
    """
    if not search_enabled or not str(search_pattern or "").strip():
        return files

    clauses = _split_or_clauses(str(search_pattern).strip())
    if not clauses:
        return files
    if len(clauses) == 1:
        single = clauses[0]
        return [name for name in files if _matches_single_pattern(os.path.splitext(name)[0], single)]
    return [
        name
        for name in files
        if any(_matches_single_pattern(os.path.splitext(name)[0], clause) for clause in clauses)
    ]


def parse_indices(indices_str, num_files):
    """1-based comma/range string -> 0-based sorted unique indices."""
    indices = set()
    if not str(indices_str or "").strip():
        return [0] if num_files > 0 else []
    for part in str(indices_str).split(","):
        part = part.strip()
        if "-" in part:
            try:
                start, end = map(int, part.split("-"))
                indices.update(range(min(start, end), max(start, end) + 1))
            except Exception:
                continue
        elif part.isdigit():
            indices.add(int(part))
    valid = [index - 1 for index in sorted(indices) if 1 <= index <= num_files]
    if not valid and num_files > 0:
        return [0]
    return valid
