import hashlib
import os
import time
from pathlib import Path
from PIL.PngImagePlugin import PngInfo
import folder_paths
import node_helpers
import numpy as np
import torch
from PIL import Image, ImageSequence, ImageOps
from comfy.cli_args import args
from server import PromptServer
import re

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

class AUNImgLoader:
    @classmethod
    def INPUT_TYPES(cls):
        input_dir = folder_paths.get_input_directory()
        files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
        return {"required": {
                    "image": (sorted(files), {"image_upload": True, "tooltip": "Select the image to load."}),
                    "max_num_words": ("INT", {
                        "default": 0, "min": 0, "max": 32, "step": 1,
                        "tooltip": "Maximum number of words to keep for both filename outputs. Set to 0 for no limit."
                    }),
                },
                "hidden": {"prompt": "PROMPT"}
                }

    CATEGORY = "AUN Nodes/Image"
    DESCRIPTION = "Loads an image and returns the image data, a mask, the original filename, and a cleaned filename. The cleaned filename is useful for prompts or file outputs in other nodes."

    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "STRING")
    RETURN_NAMES = ("IMAGE", "MASK", "image name", "cleaned filename")
    FUNCTION = "load_image"

    def load_image(self, image, max_num_words=0, prompt=None):
        image_path = folder_paths.get_annotated_filepath(image)
        filename = image.rsplit('.', 1)[0]  # get image name
        img = node_helpers.pillow(Image.open, image_path)

        output_images = []
        output_masks = []
        w, h = None, None

        excluded_formats = ['MPO']

        for i in ImageSequence.Iterator(img):
            i = node_helpers.pillow(ImageOps.exif_transpose, i)

            if i.mode == 'I':
                i = i.point(lambda i: i * (1 / 255))
            image = i.convert("RGB")

            if len(output_images) == 0:
                w = image.size[0]
                h = image.size[1]

            if image.size[0] != w or image.size[1] != h:
                continue

            image = np.array(image).astype(np.float32) / 255.0
            image = torch.from_numpy(image)[None,]
            if 'A' in i.getbands():
                mask = np.array(i.getchannel('A')).astype(np.float32) / 255.0
                mask = 1. - torch.from_numpy(mask)
            else:
                mask = torch.zeros((64, 64), dtype=torch.float32, device="cpu")
            output_images.append(image)
            output_masks.append(mask.unsqueeze(0))

        if len(output_images) > 1 and img.format not in excluded_formats:
            output_image = torch.cat(output_images, dim=0)
            output_mask = torch.cat(output_masks, dim=0)
        else:
            output_image = output_images[0]
            output_mask = output_masks[0]

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

        return (output_image, output_mask, filename, cleaned_filename)


    @classmethod
    def IS_CHANGED(cls, image, max_num_words=0, **kwargs):
        image_path = folder_paths.get_annotated_filepath(image)
        m = hashlib.sha256()
        with open(image_path, 'rb') as f:
            m.update(f.read())
        # Ensure ComfyUI cache invalidates when filename processing options change.
        m.update(str(max_num_words).encode("utf-8"))
        return m.digest().hex()

    @classmethod
    def VALIDATE_INPUTS(cls, image, max_num_words=0, **kwargs):
        if not folder_paths.exists_annotated_filepath(image):
            return "Invalid image file: {}".format(image)

        return True
    
NODE_CLASS_MAPPINGS = {
    "AUNImgLoader": AUNImgLoader,

}

# A dictionary that contains the friendly/humanly readable titles for the nodes
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNImgLoader": "AUN Image Loader",

}
