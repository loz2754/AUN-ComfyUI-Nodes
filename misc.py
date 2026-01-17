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


class GetTempDirectory:
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("temp_dir",)
    FUNCTION = "get_dir"

    @classmethod
    def INPUT_TYPES(cls):
        return {}

    def get_dir(self):
        return (folder_paths.get_temp_directory(),)
    
    
class GetOutputDirectory:
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("output_dir",)
    FUNCTION = "get_dir"

    @classmethod
    def INPUT_TYPES(cls):
        return {}

    def get_dir(self):
        return (folder_paths.get_output_directory(),)
    
    
class GetComfyDirectory:
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("comfy_dir",)
    FUNCTION = "get_dir"

    @classmethod
    def INPUT_TYPES(cls):
        return {}

    def get_dir(self):
        return (folder_paths.base_path,)

class SubdirectorySelector:
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("out_path",)
    FUNCTION = "get_dir"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "root_directory": ("STRING", {"default": "", "multiline": False}),
            "new_directory": ("STRING", {"default": "", "multiline": True})
            }
        }

    def get_dir(self, root_directory, new_directory):
        return (new_directory,)
    
class StringLiteral:
    RETURN_TYPES = ("STRING",)
    FUNCTION = "get_string"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"string": ("STRING", {"default": "", "multiline": True})}}

    def get_string(self, string):
        return (string,)

class IntLiteral:
    RETURN_TYPES = ("INT",)
    FUNCTION = "get_integer"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"integer": ("INT", {"default": "1", "min": -9223372036854775808, "max": 9223372036854775807})}}

    def get_integer(self, integer):
        return (integer,)

class FloatLiteral:
    RETURN_TYPES = ("FLOAT",)
    FUNCTION = "get_float"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"float": ("FLOAT", {"default": "1.0", "step": 0.01, "min": -3.402823466e+38, "max": 3.402823466e+38})}}

    def get_float(self, float):
        return (float,)

class ModelInOut:
    RETURN_TYPES = ("MODEL",)
    FUNCTION = "output_val"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"model": ("MODEL",)}}

    def output_val(self, model):
        return (model,)

class ConditioningInOut:
    RETURN_TYPES = ("CONDITIONING",)
    FUNCTION = "output_val"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"conditioning": ("CONDITIONING",)}}

    def output_val(self, conditioning):
        return (conditioning,)
    
class AnyToString:
    RETURN_TYPES = ("STRING",)
    FUNCTION = "get_string"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"anything": (any,)}}

    def get_string(self, anything):
        return (str(anything),)

class GetCleanFilename:
    RETURN_TYPES = ("STRING",)
    FUNCTION = "get_string"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"file_path":  ("STRING", {"default": "", "multiline": False})}}

    def get_string(self, file_path):
        return (get_clean_filename(file_path),)

class GetLeafDirectory:
    RETURN_TYPES = ("STRING",)
    FUNCTION = "get_string"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"path":  ("STRING", {"default": "", "multiline": False})}}

    def get_string(self, path):
        return (get_leaf_directory(path),)

NODE_CLASS_MAPPINGS = {
    
    "JNodes_GetTempDirectory": GetTempDirectory,
    "JNodes_GetOutputDirectory": GetOutputDirectory,
    "JNodes_GetComfyDirectory": GetComfyDirectory,
    "JNodes_SubdirectorySelector": SubdirectorySelector,
    "JNodes_StringLiteral" : StringLiteral,
    "JNodes_IntLiteral": IntLiteral,
    "JNodes_FloatLiteral": FloatLiteral,
    "JNodes_ModelInOut": ModelInOut,
    "JNodes_ConditioningInOut": ConditioningInOut,
    "JNodes_AnyToString" : AnyToString,
    "JNodes_GetCleanFilename": GetCleanFilename,
    "JNodes_GetLeafDirectory": GetLeafDirectory,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    
    "JNodes_GetTempDirectory": "Get Temp Directory",
    "JNodes_GetOutputDirectory": "Get Output Directory",
    "JNodes_GetComfyDirectory": "Get Comfy Directory",
    "JNodes_SubdirectorySelector": "Subdirectory Selector",
    "JNodes_StringLiteral" : "String Literal",
    "JNodes_IntLiteral": "Integer Literal",
    "JNodes_FloatLiteral": "Float Literal",
    "JNodes_ModelInOut": "Model In, Model Out",
    "JNodes_ConditioningInOut": "Conditioning In, Conditioning Out",
    "JNodes_AnyToString" : "Anything To String",
    "JNodes_GetCleanFilename": "Get Clean Filename",
    "JNodes_GetLeafDirectory": "Get Leaf Directory",

}
