"""AUN Load Image Pro — one loader for single files, folders and resizing."""

import os
import random
import re

import folder_paths
import node_helpers
import numpy as np
import torch
from PIL import Image, ImageOps, ImageSequence
from nodes import PreviewImage

from .aun_bundle_shared import BUNDLE
from .aun_load_image_shared import (
    CROP_SIDES,
    INTERPOLATION_METHODS,
    RATIOS,
    SIZE_MODES,
    apply_load_size,
    clean_filename_for_output,
    filter_files_by_search,
    limit_filename_words,
    list_folder_images,
    list_input_images,
    load_predefined_paths,
    parse_indices,
    plan_load_size,
)


def _fingerprint(path, *values):
    """A cheap stamp of a file and the settings that read it."""
    try:
        stat = os.stat(path)
        stamp = f"{stat.st_mtime_ns}:{stat.st_size}"
    except OSError:
        stamp = "missing"
    return "|".join([str(path), stamp, *[str(value) for value in values]])


class AUNImageLoaderPro(PreviewImage):
    """Load one image or a folder batch, then size it before it leaves the node."""

    _node_states = {}

    @classmethod
    def INPUT_TYPES(cls):
        files = list_input_images()
        predefined_paths = load_predefined_paths()
        return {
            "required": {
                "source_mode": (
                    ["Single Image Upload", "Batch from Folder"],
                    {
                        "default": "Single Image Upload",
                        "tooltip": "Load one uploaded image, or cycle through images in a folder.",
                    },
                ),
                "image": (
                    files,
                    {
                        "image_upload": True,
                        "tooltip": "The image to load when Source is Single Image Upload. Upload one with the Load button.",
                    },
                ),
                "path_mode": (
                    ["Pre-defined", "Manual"],
                    {
                        "default": "Pre-defined",
                        "tooltip": "Choose the folder from the pre-defined list, or type a full path.",
                    },
                ),
                "predefined_path": (
                    predefined_paths,
                    {
                        "tooltip": "A folder from predefined_paths.local.json (copy predefined_paths.example.json to start one).",
                    },
                ),
                "manual_path": (
                    "STRING",
                    {
                        "default": "C:/path/to/your/images",
                        "multiline": False,
                        "tooltip": "Full path to the image folder used when Path is Manual.",
                    },
                ),
                "batch_mode": (
                    ["increment", "decrement", "random", "fixed", "range", "search"],
                    {
                        "default": "increment",
                        "tooltip": "How the next image is chosen from the folder. Search filters the list first; Range/Fixed pick by position.",
                    },
                ),
                "range_or_pattern": (
                    "STRING",
                    {
                        "default": "1",
                        "tooltip": "For fixed/range: comma-separated 1-based positions or ranges, e.g. 2,3,4-7,10. For search: wildcards (*,?,[]), regex, plain text, or 'Name [1-5, 7-14]'; separate alternatives with ';'.",
                    },
                ),
                "size": (
                    list(SIZE_MODES),
                    {
                        "default": "off",
                        "tooltip": "How the image is sized. off keeps the file's own pixels; the other choices show only the numbers they read.",
                    },
                ),
                "megapixels": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": 0.01,
                        "max": 64.0,
                        "step": 0.01,
                        "tooltip": "Target total size in megapixels. 1.0 is about 1024 x 1024.",
                    },
                ),
                "longest_side": (
                    "INT",
                    {
                        "default": 1024,
                        "min": 16,
                        "max": 16384,
                        "step": 1,
                        "tooltip": "Length of the longer edge; the other edge follows the image's shape.",
                    },
                ),
                "scale": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": 0.05,
                        "max": 8.0,
                        "step": 0.01,
                        "tooltip": "Multiplier for both edges: 0.5 is half, 2 is double.",
                    },
                ),
                "width": (
                    "INT",
                    {
                        "default": 1024,
                        "min": 16,
                        "max": 16384,
                        "step": 1,
                        "tooltip": "Box width in pixels, or the exact width for Stretch and the cut size for Crop.",
                    },
                ),
                "height": (
                    "INT",
                    {
                        "default": 1024,
                        "min": 16,
                        "max": 16384,
                        "step": 1,
                        "tooltip": "Box height in pixels, or the exact height for Stretch and the cut size for Crop.",
                    },
                ),
                "multiple": (
                    "INT",
                    {
                        "default": 8,
                        "min": 1,
                        "max": 256,
                        "step": 1,
                        "tooltip": "Round the new width and height to a multiple of this. Most models want 8 or 16; 1 keeps exact numbers.",
                    },
                ),
                "method": (
                    list(INTERPOLATION_METHODS),
                    {
                        "default": "lanczos",
                        "tooltip": "How pixels are resampled. lanczos is sharpest for photos; nearest keeps pixel art crisp.",
                    },
                ),
                "enlarge": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "tooltip": "On: a small image is grown to the size asked for. Off: it is only ever made smaller.",
                    },
                ),
                "crop_from": (
                    list(CROP_SIDES),
                    {
                        "default": "center",
                        "tooltip": "For the crop choices: which part of the image is kept. Click the small before picture to pick it.",
                    },
                ),
                "ratio": (
                    list(RATIOS),
                    {
                        "default": "1:1",
                        "tooltip": "Shape to cut for Crop to ratio. width : height uses the Width and Height boxes.",
                    },
                ),
                "base_resolution": (
                    "INT",
                    {
                        "default": 640,
                        "min": 320,
                        "max": 2048,
                        "step": 16,
                        "tooltip": "FramePack bucket scale. 640 matches the original buckets; higher scales them up proportionally.",
                    },
                ),
                "max_num_words": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 32,
                        "step": 1,
                        "tooltip": "Longest the filename outputs may be, in words. 0 keeps the whole name.",
                    },
                ),
                "output_is_list": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "In range, fixed or search batch modes, output every matching image as a list instead of one.",
                    },
                ),
                "preview": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "tooltip": "Show the loaded result under the node. Off skips writing the preview file.",
                    },
                ),
            },
            "optional": {
                "set": (
                    "STRING",
                    {
                        "default": "",
                        "tooltip": "Constant name. When filled, the node sets an OBVPM bundle constant readable by an Unbundle (get) node.",
                    },
                ),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            },
        }

    CATEGORY = "AUN Nodes/Image"
    OUTPUT_NODE = True
    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "STRING", "INT", "INT", "INT", "INT", BUNDLE)
    RETURN_NAMES = (
        "image",
        "mask",
        "filename",
        "cleaned filename",
        "width",
        "height",
        "original_width",
        "original_height",
        "bundle",
    )
    FUNCTION = "load_image"
    DESCRIPTION = (
        "Load a single uploaded image or a folder batch with increment, decrement, random, fixed, range "
        "and search selection, then size it in the same node: megapixels, longest side, scale, fit inside, "
        "fit and pad, crop to fill, crop, crop to ratio, stretch or FramePack bucket. Shows the size going "
        "in and coming out before a run, with a before/after preview and click-to-pick crop. Outputs image, "
        "mask, raw and cleaned filename, size, original size and an OBVPM bundle."
    )

    def __init__(self):
        super().__init__()
        self._state = {}

    # -- state ------------------------------------------------------------

    @classmethod
    def _state_for(cls, unique_id):
        key = str(unique_id) if unique_id is not None else "default"
        if isinstance(unique_id, (list, tuple)):
            key = str(unique_id[0])
        state = cls._node_states.get(key)
        if state is None:
            state = {
                "current_index": 0,
                "last_folder": None,
                "files": [],
                "range_index": 0,
                "last_range": None,
                "last_pattern": None,
                "last_mode": None,
            }
            cls._node_states[key] = state
        return state

    # -- image loading ----------------------------------------------------

    def _load_frames(self, path):
        """PIL frames as (HWC float RGB, HW float alpha or None) pairs."""
        pillow = node_helpers.pillow(Image.open, path)
        frames = []
        for frame in ImageSequence.Iterator(pillow):
            frame = node_helpers.pillow(ImageOps.exif_transpose, frame)
            if frame.mode == "I":
                frame = frame.point(lambda value: value * (1 / 255))
            rgb = np.array(frame.convert("RGB")).astype(np.float32) / 255.0
            alpha = None
            if "A" in frame.getbands():
                alpha = np.array(frame.getchannel("A")).astype(np.float32) / 255.0
            frames.append((rgb, alpha))
        if not frames:
            raise ValueError(f"Failed to read any frames from {path}")
        return frames

    def _size_one(self, path, args):
        """Load one file, size every frame, return (BHWC image, BHW mask, sizes)."""
        frames = self._load_frames(path)
        source_h, source_w = frames[0][0].shape[:2]
        plan_args = {key: value for key, value in args.items() if key != "method"}
        plan = plan_load_size(source_w, source_h, **plan_args)

        images = []
        masks = []
        for rgb, alpha in frames:
            image = torch.from_numpy(rgb)[None]
            if alpha is None:
                mask = torch.zeros((1, rgb.shape[0], rgb.shape[1]), dtype=torch.float32)
            else:
                mask = torch.from_numpy(1.0 - alpha)[None]
            sized_image, sized_mask = apply_load_size(image, mask, plan, args.get("method", "lanczos"))
            images.append(sized_image)
            masks.append(sized_mask)

        return (
            torch.cat(images, dim=0),
            torch.cat(masks, dim=0),
            int(plan["width"]),
            int(plan["height"]),
            int(source_w),
            int(source_h),
        )

    # -- batch selection --------------------------------------------------

    def _pick_from_folder(self, state, folder, batch_mode, pattern, output_is_list):
        """Return (paths, names, position, total) for this run."""
        search = pattern if batch_mode == "search" else ""
        reload_needed = (
            state["last_folder"] != folder
            or state["last_pattern"] != search
            or state["last_mode"] != batch_mode
        )
        if reload_needed:
            state["last_folder"] = folder
            state["last_pattern"] = search
            state["last_mode"] = batch_mode
            state["files"] = filter_files_by_search(
                list_folder_images(folder), search, batch_mode == "search"
            )
            state["current_index"] = 0
            state["range_index"] = 0
            state["last_range"] = None

        files = state["files"]
        if not files:
            if batch_mode == "search" and pattern.strip():
                raise ValueError(f"No images match '{pattern}' in folder: {folder}")
            raise ValueError(f"No valid images found in folder: {folder}")

        total = len(files)
        if output_is_list and batch_mode in ("range", "fixed", "search"):
            indices = (
                list(range(total))
                if batch_mode == "search"
                else parse_indices(pattern, total)
            )
            if not indices:
                raise ValueError("No valid positions for the list output.")
            chosen = [(os.path.join(folder, files[index]), files[index], index) for index in indices]
            return chosen, indices[0] + 1, total

        if batch_mode == "increment":
            index = state["current_index"]
            state["current_index"] = (state["current_index"] + 1) % total
        elif batch_mode == "decrement":
            state["current_index"] = (state["current_index"] - 1 + total) % total
            index = state["current_index"]
        elif batch_mode == "random":
            index = random.SystemRandom().randint(0, total - 1)
        elif batch_mode == "search":
            index = state["current_index"]
            state["current_index"] = (state["current_index"] + 1) % total
        else:  # fixed / range
            indices = parse_indices(pattern, total)
            if not indices:
                raise ValueError("No valid positions given for fixed/range mode.")
            if state["last_range"] != tuple(indices):
                state["range_index"] = 0
                state["last_range"] = tuple(indices)
            index = indices[state["range_index"] % len(indices)]
            if batch_mode == "range":
                state["range_index"] = (state["range_index"] + 1) % len(indices)

        name = files[index]
        return [(os.path.join(folder, name), name, index)], index + 1, total

    # -- run --------------------------------------------------------------

    def load_image(
        self,
        source_mode,
        path_mode,
        predefined_path,
        manual_path,
        batch_mode,
        range_or_pattern,
        image,
        size="off",
        megapixels=1.0,
        longest_side=1024,
        scale=1.0,
        width=1024,
        height=1024,
        multiple=8,
        method="lanczos",
        enlarge=True,
        crop_from="center",
        ratio="1:1",
        base_resolution=640,
        max_num_words=0,
        output_is_list=False,
        preview=True,
        set="",
        unique_id=None,
        prompt=None,
        extra_pnginfo=None,
        **kwargs,
    ):
        args = {
            "size": str(size or "off"),
            "megapixels": float(megapixels),
            "longest_side": int(longest_side),
            "scale": float(scale),
            "width": int(width),
            "height": int(height),
            "multiple": int(multiple),
            "enlarge": bool(enlarge),
            "crop_from": str(crop_from),
            "ratio": str(ratio),
            "base_resolution": int(base_resolution),
            "method": str(method or "lanczos"),
        }

        state = self._state_for(unique_id)
        is_folder = str(source_mode) == "Batch from Folder"
        position = None
        total = None

        if is_folder:
            folder = str(manual_path) if str(path_mode) == "Manual" else str(predefined_path)
            chosen, position, total = self._pick_from_folder(
                state, folder, str(batch_mode), str(range_or_pattern), bool(output_is_list)
            )
            list_mode = bool(output_is_list) and str(batch_mode) in ("range", "fixed", "search")
        else:
            path = folder_paths.get_annotated_filepath(image)
            chosen = [(path, os.path.basename(path), 0)]
            list_mode = False

        images = []
        masks = []
        filenames = []
        cleaned = []
        widths = []
        heights = []
        original_widths = []
        original_heights = []

        for path, name, _index in chosen:
            sized, mask, out_w, out_h, src_w, src_h = self._size_one(path, args)
            raw = os.path.splitext(name)[0]
            images.append(sized)
            masks.append(mask)
            filenames.append(limit_filename_words(raw, max_num_words))
            cleaned.append(clean_filename_for_output(raw, max_num_words))
            widths.append(out_w)
            heights.append(out_h)
            original_widths.append(src_w)
            original_heights.append(src_h)

        self.OUTPUT_IS_LIST = (
            (True, True, True, True, True, True, True, True, True)
            if list_mode
            else (False, False, False, False, False, False, False, False, False)
        )

        ui_images = []
        if preview:
            prefix = "AUNLoadImagePro"
            if list_mode:
                for index, sized in enumerate(images):
                    result = self.save_images(sized, f"{prefix}_{index + 1}", prompt, extra_pnginfo)
                    ui_images.extend(result.get("ui", {}).get("images", []))
            else:
                result = self.save_images(images[0], prefix, prompt, extra_pnginfo)
                ui_images = result.get("ui", {}).get("images", [])

        if list_mode:
            bundle = {
                "image": images,
                "mask": masks,
                "filename": filenames,
                "cleaned_filename": cleaned,
                "width": widths,
                "height": heights,
                "original_width": original_widths,
                "original_height": original_heights,
            }
            result = (
                images,
                masks,
                filenames,
                cleaned,
                widths,
                heights,
                original_widths,
                original_heights,
                bundle,
            )
        else:
            bundle = {
                "image": images[0],
                "mask": masks[0],
                "filename": filenames[0],
                "cleaned_filename": cleaned[0],
                "width": widths[0],
                "height": heights[0],
                "original_width": original_widths[0],
                "original_height": original_heights[0],
            }
            result = (
                images[0],
                masks[0],
                filenames[0],
                cleaned[0],
                widths[0],
                heights[0],
                original_widths[0],
                original_heights[0],
                bundle,
            )

        ui = {
            "images": ui_images,
            "animated": [len(images[0]) > 1 if not list_mode else False],
            # Every ui value is a list: ComfyUI concatenates them, so a bare
            # string would arrive as its characters and a bare int fails.
            "aun_filename": [filenames[0]] if not list_mode else list(filenames),
            "aun_sizes": [
                [original_widths[0], original_heights[0], widths[0], heights[0]]
            ]
            if not list_mode
            else [
                [original_widths[i], original_heights[i], widths[i], heights[i]]
                for i in range(len(images))
            ],
            "aun_position": [position, total] if is_folder else [],
            "aun_count": [len(filenames)],
        }
        return {"ui": ui, "result": result}

    # -- cache / validation ----------------------------------------------

    @classmethod
    def IS_CHANGED(
        cls,
        source_mode,
        path_mode,
        manual_path=None,
        image=None,
        batch_mode="increment",
        range_or_pattern="1",
        output_is_list=False,
        **kwargs,
    ):
        if str(source_mode) == "Single Image Upload":
            try:
                path = folder_paths.get_annotated_filepath(image)
            except Exception:
                return float("NaN")
            return _fingerprint(path, source_mode, batch_mode, kwargs)
        if str(batch_mode) in ("increment", "decrement", "random", "range", "search") or output_is_list:
            return float("NaN")
        folder = str(manual_path) if str(path_mode) == "Manual" else str(kwargs.get("predefined_path", ""))
        return _fingerprint(folder, path_mode, batch_mode, range_or_pattern, kwargs)

    @classmethod
    def VALIDATE_INPUTS(cls, source_mode, path_mode, manual_path, image, batch_mode="increment", range_or_pattern="1", **kwargs):
        if str(source_mode) == "Single Image Upload":
            if not folder_paths.exists_annotated_filepath(image):
                return f"Invalid image file: {image}"
        elif str(path_mode) == "Manual":
            if not os.path.isdir(str(manual_path)):
                return f"Manual path is not a valid folder: {manual_path}"

        if str(batch_mode) == "search" and range_or_pattern:
            from .aun_load_image_shared import _parse_name_range_query, _split_or_clauses

            for clause in _split_or_clauses(str(range_or_pattern).strip()):
                if _parse_name_range_query(clause) is None and any(
                    char in clause for char in ".^$+{}|()\\"
                ):
                    try:
                        re.compile(clause)
                    except re.error as exc:
                        return f"Invalid regex pattern '{clause}': {exc}"
        return True


NODE_CLASS_MAPPINGS = {"AUNImageLoaderPro": AUNImageLoaderPro}

NODE_DISPLAY_NAME_MAPPINGS = {"AUNImageLoaderPro": "AUN Load Image Pro"}
