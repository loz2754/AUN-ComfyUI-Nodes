import os
import random
import folder_paths
import numpy as np
import torch
from PIL import Image, ImageSequence, ImageOps
import hashlib
import json
import re
import fnmatch
from server import PromptServer  # already available in ComfyUI core

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

def load_predefined_paths():
    config_file = os.path.join(os.path.dirname(__file__), "predefined_paths.json")
    default_paths = ["N:/Private/Faces/Women", "N:/Private/Faces/Men"]

    if not os.path.exists(config_file):
        print(f"[AUNNodes] Creating default predefined paths file at: {config_file}")
        try:
            with open(config_file, 'w') as f:
                json.dump(default_paths, f, indent=4)
            return default_paths
        except Exception as e:
            print(f"[AUNNodes] ERROR: Could not create default paths file: {e}")
            return default_paths

    try:
        with open(config_file, 'r') as f:
            paths = json.load(f)
            if isinstance(paths, list):
                return paths
            else:
                print(f"[AUNNodes] ERROR: predefined_paths.json is not a valid list. Using defaults.")
                return default_paths
    except Exception as e:
        print(f"[AUNNodes] ERROR: Could not read predefined_paths.json: {e}. Using defaults.")
        return default_paths

def filter_files_by_search(files, search_pattern, search_enabled):
    """Filter files based on search pattern using wildcards and regex"""
    if not search_enabled or not search_pattern.strip():
        return files
    
    filtered_files = []
    pattern = search_pattern.strip()
    
    for file in files:
        filename = os.path.splitext(file)[0]  # Remove extension for search
        
        # Try wildcard matching first (*, ?, [])
        if any(char in pattern for char in '*?[]'):
            if fnmatch.fnmatch(filename.lower(), pattern.lower()):
                filtered_files.append(file)
        # Try regex matching if it contains regex special characters
        elif any(char in pattern for char in '.^$+{}|()\\'):
            try:
                if re.search(pattern, filename, re.IGNORECASE):
                    filtered_files.append(file)
            except re.error:
                # If regex is invalid, fall back to simple substring search
                if pattern.lower() in filename.lower():
                    filtered_files.append(file)
        # Simple substring search
        else:
            if pattern.lower() in filename.lower():
                filtered_files.append(file)
    
    return filtered_files

def parse_indices(indices_str, num_files):
    indices = set()
    if not indices_str.strip():
        # If empty, default to first index
        return [0] if num_files > 0 else []
    for part in indices_str.split(','):
        part = part.strip()
        if '-' in part:
            try:
                start, end = map(int, part.split('-'))
                indices.update(range(min(start, end), max(start, end) + 1))
            except Exception:
                continue
        elif part.isdigit():
            indices.add(int(part))
    valid_indices = [i for i in sorted(indices) if 0 <= i < num_files]
    if not valid_indices and num_files > 0:
        # If nothing valid, default to first index
        return [0]
    return valid_indices

class AUNImageSingleBatch3:
    _node_states = {}

    @classmethod
    def INPUT_TYPES(cls):
        predefined_paths = load_predefined_paths()
        input_dir = folder_paths.get_input_directory()
        files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]

        return {
            "required": {
                "source_mode": (["Single Image Upload", "Batch from Folder"], {
                    "default": "Batch from Folder",
                    "tooltip": "Choose to load a single uploaded image or one image from a folder."
                }),
                "path_mode": (["Pre-defined", "Manual"], {
                    "default": "Pre-defined",
                    "tooltip": "Select path source: Pre-defined list or manual input."
                }),
                "predefined_path": (predefined_paths, {
                    "tooltip": "Select a folder from the pre-defined list. Edit predefined_paths.json in the AUN_nodes folder to customize."
                }),
                "manual_path": ("STRING", {
                    "default": "C:/path/to/your/images",
                    "multiline": False,
                    "tooltip": "Enter the absolute path to the image folder."
                }),
                "batch_mode": (["increment", "decrement", "random", "fixed", "range", "search"], {
                    "default": "increment",
                    "tooltip": "How to select the next image from the folder. Use 'search' mode to filter files by pattern using the range_or_pattern field."
                }),
                "range_or_pattern": ("STRING", {
                    "default": "0",
                    "tooltip": "Multi-purpose field:\n• For fixed/range modes: Comma-separated indices or ranges (e.g., 2,3,4-7,10)\n• For search mode: Search pattern supporting wildcards (*,?,[]), regex, or simple text (e.g., 'portrait*', 'img_[0-9]+', '.*face.*')"
                }),
                "image_upload": (sorted(files), {"image_upload": True}),
                "max_num_words": ("INT", {
                    "default": 0, "min": 0, "max": 32, "step": 1,
                    "tooltip": "Maximum number of words to keep for both filename outputs. Set to 0 for no limit."
                }),
            },
            "hidden": {
                "prompt": "PROMPT", 
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            },
        }
    
    RETURN_TYPES = ("IMAGE", "STRING", "STRING")
    RETURN_NAMES = ("image", "filename", "cleaned filename")
    FUNCTION = "load_image"
    CATEGORY = "AUN Nodes/Image"
    DESCRIPTION = "Load a single uploaded image or cycle through a batch of images from a folder with multiple selection modes, including range and search filtering by filename patterns."

    def __init__(self):
        self.current_index = 0
        self.last_folder_path = None
        self.image_files = []
        self.range_index = 0
        self.last_range = None
        self.last_search_pattern = None
        self.last_batch_mode = None

    def _process_pil_image(self, pil_image):
        output_images = []
        w, h = None, None
        for i in ImageSequence.Iterator(pil_image):
            i = ImageOps.exif_transpose(i)
            if i.mode == 'I':
                i = i.point(lambda i: i * (1 / 255))
            image = i.convert("RGB")
            if not output_images:
                w, h = image.size
            if image.size[0] != w or image.size[1] != h:
                continue
            image_np = np.array(image).astype(np.float32) / 255.0
            image_tensor = torch.from_numpy(image_np)[None,]
            output_images.append(image_tensor)
        if not output_images:
            raise ValueError("Failed to process the image.")
        if len(output_images) > 1:
            return torch.cat(output_images, dim=0)
        else:
            return output_images[0]

    def load_image(self, source_mode, path_mode, predefined_path, manual_path, batch_mode, range_or_pattern, image_upload, max_num_words=0, unique_id=None, **kwargs):
        # Retrieve or initialize state for this node instance
        if unique_id is not None:
            if isinstance(unique_id, (list, tuple)):
                unique_id = unique_id[0]
            if unique_id not in AUNImageSingleBatch3._node_states:
                AUNImageSingleBatch3._node_states[unique_id] = {
                    "current_index": 0,
                    "last_folder_path": None,
                    "image_files": [],
                    "range_index": 0,
                    "last_range": None,
                    "last_search_pattern": None,
                    "last_batch_mode": None
                }
            state = AUNImageSingleBatch3._node_states[unique_id]
        else:
            # Fallback to instance variables if unique_id is missing
            state = self.__dict__

        image_path = ""
        filename_without_ext = ""

        if source_mode == "Single Image Upload":
            image_path = folder_paths.get_annotated_filepath(image_upload)
            filename = os.path.basename(image_path)
            filename_without_ext = os.path.splitext(filename)[0]
        else:  # Batch from Folder
            effective_path = manual_path if path_mode == "Manual" else predefined_path

            if not os.path.isdir(effective_path):
                raise FileNotFoundError(f"Folder not found: {effective_path}")

            # In search mode, range_or_pattern serves as the search pattern
            search_pattern = range_or_pattern if batch_mode == "search" else ""
            
            # Check if we need to reload the file list
            need_reload = (state["last_folder_path"] != effective_path or 
                          state["last_search_pattern"] != search_pattern or 
                          state["last_batch_mode"] != batch_mode)
            
            if need_reload:
                state["last_folder_path"] = effective_path
                state["last_search_pattern"] = search_pattern
                state["last_batch_mode"] = batch_mode
                
                # Get all image files first
                all_files = sorted([f for f in os.listdir(effective_path) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.webp'))])
                
                # Apply search filter if in search mode
                search_enabled = batch_mode == "search"
                state["image_files"] = filter_files_by_search(all_files, search_pattern, search_enabled)
                
                state["current_index"] = 0
                state["range_index"] = 0
                state["last_range"] = None

            if not state["image_files"]:
                if batch_mode == "search" and range_or_pattern.strip():
                    raise ValueError(f"No images found matching search pattern '{range_or_pattern}' in folder: {effective_path}")
                else:
                    raise ValueError(f"No valid images found in folder: {effective_path}")

            num_files = len(state["image_files"])
            load_index = 0

            if batch_mode == "increment":
                load_index = state["current_index"]
                state["current_index"] = (state["current_index"] + 1) % num_files
            elif batch_mode == "decrement":
                state["current_index"] = (state["current_index"] - 1 + num_files) % num_files
                load_index = state["current_index"]
            elif batch_mode == "random":
                load_index = random.randint(0, num_files - 1)
            elif batch_mode == "search":
                # In search mode, use increment behavior through filtered files
                load_index = state["current_index"]
                state["current_index"] = (state["current_index"] + 1) % num_files
            elif batch_mode in ["fixed", "range"]:
                indices = parse_indices(range_or_pattern, num_files)
                if not indices:
                    raise ValueError("No valid indices specified for range/fixed mode.")
                if state["last_range"] != tuple(indices):
                    state["range_index"] = 0
                    state["last_range"] = tuple(indices)
                load_index = indices[state["range_index"] % len(indices)]
                if batch_mode == "range":
                    state["range_index"] = (state["range_index"] + 1) % len(indices)

            selected_file = state["image_files"][load_index]
            image_path = os.path.join(effective_path, selected_file)
            filename_without_ext = os.path.splitext(selected_file)[0]

        pil_image = Image.open(image_path)
        tensor_image = self._process_pil_image(pil_image)
        cleaned_filename = clean_filename_for_output(filename_without_ext, max_num_words)
        
        # Apply word limit to raw filename if requested, preserving original separators
        filename = filename_without_ext
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
        
        return (tensor_image, filename, cleaned_filename)

    @classmethod  
    def IS_CHANGED(
        cls, 
        source_mode, 
        path_mode, 
        predefined_path, 
        manual_path, 
        batch_mode, 
        range_or_pattern="0",
        image_index=None, 
        range_start=None, 
        range_end=None, 
        image_upload=None, 
        **kwargs
    ):
        if source_mode == "Single Image Upload":
            image_path = folder_paths.get_annotated_filepath(image_upload)
            m = hashlib.sha256()
            with open(image_path, 'rb') as f:
                m.update(f.read())
            return m.digest().hex()
        if batch_mode in ["increment", "decrement", "random", "range", "search"]:
            return float("NaN")
        effective_path = manual_path if path_mode == "Manual" else predefined_path
        search_key = f"{range_or_pattern}" if batch_mode == "search" else ""
        return f"{effective_path}_{image_index}_{search_key}"

    @classmethod
    def VALIDATE_INPUTS(cls, source_mode, path_mode, manual_path, image_upload, batch_mode="increment", range_or_pattern="0", **kwargs):
        if source_mode == "Single Image Upload":
            if not folder_paths.exists_annotated_filepath(image_upload):
                return f"Invalid image file: {image_upload}"
        elif path_mode == "Manual":
            if not os.path.isdir(manual_path):
                return f"Manual path is not a valid directory: {manual_path}"
        
        # Validate regex pattern if it looks like regex and we're in search mode
        if batch_mode == "search" and range_or_pattern and any(char in range_or_pattern for char in '.^$+{}|()\\'):
            try:
                re.compile(range_or_pattern)
            except re.error as e:
                return f"Invalid regex pattern '{range_or_pattern}': {e}"
        
        return True    

NODE_CLASS_MAPPINGS = {
    "AUNImageSingleBatch3": AUNImageSingleBatch3
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNImageSingleBatch3": "Load Image (Single/Batch)3"
}
