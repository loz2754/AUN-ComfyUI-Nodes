import os

import hashlib

import json
import mimetypes
import re

import folder_paths
from .logger import logger

import numpy as np
from PIL import Image
import torch


class AnyType(str):
    """A special class that is always equal in not equal comparisons."""

    def __ne__(self, __value: object) -> bool:
        return False


any = AnyType("*")


VIDEO_FORMATS_DIRECTORY = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "video_formats"
)

VIDEO_FORMATS: list[str] = []
try:
    if os.path.isdir(VIDEO_FORMATS_DIRECTORY):
        for filename in os.listdir(VIDEO_FORMATS_DIRECTORY):
            filepath = os.path.join(VIDEO_FORMATS_DIRECTORY, filename)
            if not os.path.isfile(filepath):
                continue
            if not filename.lower().endswith(".json"):
                continue
            try:
                with open(filepath, "r", encoding="utf-8") as file:
                    data = json.load(file)
                extension = data.get("extension")
                if extension and extension not in VIDEO_FORMATS:
                    VIDEO_FORMATS.append(str(extension))
            except Exception:
                # Avoid breaking imports due to a bad format file
                continue
except Exception:
    # Avoid breaking imports if the folder is missing/unreadable
    VIDEO_FORMATS = []


ACCEPTED_UPLOAD_VIDEO_EXTENSIONS = ["webm", "mp4", "mkv", "ogg"] + VIDEO_FORMATS
ACCEPTED_BROWSER_VIDEO_EXTENSIONS = ["webm", "mp4", "ogg"]

ACCEPTED_ANIMATED_IMAGE_EXTENSIONS = ["gif", "webp", "apng", "mjpeg"]
ACCEPTED_STILL_IMAGE_EXTENSIONS = ["gif", "webp", "png", "jpg", "jpeg", "jfif"]

ALL_ACCEPTED_IMAGE_EXTENSIONS = (
    ACCEPTED_STILL_IMAGE_EXTENSIONS + ACCEPTED_ANIMATED_IMAGE_EXTENSIONS
)
ALL_ACCEPTED_UPLOAD_VISUAL_EXTENSIONS = (
    ACCEPTED_UPLOAD_VIDEO_EXTENSIONS + ALL_ACCEPTED_IMAGE_EXTENSIONS
)
ALL_ACCEPTED_BROWSER_VISUAL_EXTENSIONS = (
    ACCEPTED_BROWSER_VIDEO_EXTENSIONS + ALL_ACCEPTED_IMAGE_EXTENSIONS
)
ACCEPTED_IMAGE_AND_VIDEO_EXTENSIONS_COMPENDIUM = (
    ALL_ACCEPTED_IMAGE_EXTENSIONS
    + ALL_ACCEPTED_UPLOAD_VISUAL_EXTENSIONS
    + ALL_ACCEPTED_BROWSER_VISUAL_EXTENSIONS
)


mimetypes.add_type("image/webp", ".webp")


def get_sha256(file_path: str) -> str:
    """Given a file path, finds a matching .sha256 file or creates one from file contents."""
    file_no_ext = os.path.splitext(file_path)[0]
    hash_file = file_no_ext + ".sha256"

    if os.path.exists(hash_file):
        try:
            with open(hash_file, "r", encoding="utf-8") as f:
                return f.read().strip()
        except OSError as e:
            print(f"AUN: Error reading existing hash file: {e}")

    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)

    try:
        with open(hash_file, "w", encoding="utf-8") as f:
            f.write(sha256_hash.hexdigest())
    except OSError as e:
        print(f"AUN: Error writing hash to {hash_file}: {e}")

    return sha256_hash.hexdigest()


def map_to_range(value, input_min, input_max, output_min, output_max):
    input_range = input_max - input_min
    if input_range == 0:
        return output_min

    normalized_value = (value - input_min) / input_range

    if output_min <= output_max:
        output_range = output_max - output_min
        mapped_value = output_min + (normalized_value * output_range)
    else:
        output_range = output_min - output_max
        mapped_value = output_min - (normalized_value * output_range)

    if output_min <= output_max:
        return max(min(mapped_value, output_max), output_min)
    else:
        return min(max(mapped_value, output_max), output_min)


def convert_relative_comfyui_path_to_full_path(relative_path: str = "output") -> str:
    try:
        path = folder_paths.get_directory_by_type(relative_path)
        if path:
            return path

        paths = folder_paths.get_folder_paths(relative_path)
        if paths:
            return paths[0]
    except Exception:
        pass

    return os.path.join(folder_paths.base_path, relative_path)


def resolve_file_path(in_file_path: str) -> str:
    if os.path.isabs(in_file_path):
        return in_file_path
    return convert_relative_comfyui_path_to_full_path(in_file_path)


def get_clean_filename(file_path: str) -> str:
    base_name = os.path.basename(file_path)
    name, _ = os.path.splitext(base_name)
    return name


def get_leaf_directory(path: str) -> str:
    if os.path.isdir(path):
        return os.path.basename(os.path.normpath(path))
    return os.path.basename(os.path.dirname(path))


def get_file_extension_without_dot(filename: str) -> str:
    _, extension = os.path.splitext(filename)
    return extension[1:].lower()


def is_video(filename: str) -> bool:
    mime_type, _ = mimetypes.guess_type(filename)
    return bool(mime_type and mime_type.startswith("video"))


def tensor2pil(image: torch.Tensor) -> list[Image.Image]:
    batch_count = image.size(0) if len(image.shape) > 3 else 1
    if batch_count > 1:
        out: list[Image.Image] = []
        for i in range(batch_count):
            out.extend(tensor2pil(image[i]))
        return out

    return [
        Image.fromarray(
            np.clip(255.0 * image.cpu().numpy().squeeze(), 0, 255).astype(np.uint8)
        )
    ]
