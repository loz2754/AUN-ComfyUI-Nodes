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

# Pillow resampling compatibility across versions
try:
    RESAMPLE_LANCZOS = Image.Resampling.LANCZOS  # Pillow >= 9.1.0
except Exception:
    # Numeric fallback: LANCZOS=1 in Pillow's Resampling enum
    RESAMPLE_LANCZOS = 1

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

class AUNImg2Img:
    @classmethod
    def INPUT_TYPES(cls):
        input_dir = folder_paths.get_input_directory()
        files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
        return {"required": 
                    {
                    "img2img": ("BOOLEAN", { "default": False, "label_on": "On", "label_off": "Off", "tooltip": "Enable/disable Img2Img mode." }),
                    "denoise_strength": ("FLOAT", { "default": 1.00, "min": 0.0, "max": 1.0, "step": 0.01, "tooltip": "Set the denoise strength for Img2Img." }),
                    "new_width": ("INT", { "default": 1024, "min": 0, "max": 2048, "step": 8, "tooltip": "Set the new width for the image when Img2Img is enabled. The longest side of the image will be resized to this length. Aspect ratio is preserved." }),
                    "new_height": ("INT", { "default": 1024, "min": 0, "max": 2048,"step": 8, "tooltip": "Set the new height for the image when Img2Img is enabled. The longest side of the image will be resized to this length. Aspect ratio is preserved." }),
                    "latent_width": ("INT", { "forceInput": True, "tooltip": "The width of the latent space (from EmptyLatentImage node). The longest side of the image will be resized to this length. Aspect ratio is preserved."}),
                    "latent_height": ("INT", { "forceInput": True, "tooltip": "The height of the latent space (from EmptyLatentImage node). The longest side of the image will be resized to this length. Aspect ratio is preserved."}),
                    "image": (sorted(files), {"image_upload": True, "tooltip": "Select the image to use for Img2Img."}),
                    "max_num_words": ("INT", {
                        "default": 0, "min": 0, "max": 32, "step": 1,
                        "tooltip": "Maximum number of words to keep for both filename outputs. Set to 0 for no limit."
                    }),
                    "vae": ("VAE", { "tooltip": "The VAE to use for encoding the image to latent space." }),
                    "empty_latent": ("LATENT", { "tooltip": "The empty latent image to use when Img2Img is disabled." }),
                    },
                "hidden": {"prompt": "PROMPT"}
                }

    CATEGORY = "AUN Nodes/Image"
    DESCRIPTION = "Provides a comprehensive Img2Img workflow, allowing you to switch between txt2img and img2img modes. It handles image loading, resizing, and encoding into the latent space, providing essential outputs for further processing."

    RETURN_TYPES = ("BOOLEAN", "IMAGE", "MASK", "LATENT", "STRING", "STRING", "INT", "INT", "FLOAT")
    RETURN_NAMES = ("boolean", "IMAGE", "MASK", "latent", "filename", "cleaned filename", "width", "height",
                    "denoise strength")
    FUNCTION = "load_image"

    def load_image(self, img2img, denoise_strength, image, new_width, new_height, latent_width, latent_height, vae, empty_latent, max_num_words=0, prompt=None):
        image_path = folder_paths.get_annotated_filepath(image)
        filename = image.rsplit('.', 1)[0]  # get image name
        img = node_helpers.pillow(Image.open, image_path)

        output_images = []
        output_masks = []
        w, h = None, None

        width, height = None, None        
        width_out, height_out = latent_width, latent_height  # Initialize with default values
        excluded_formats = ['MPO']
        resize = False
        latent_result = None
        latent = empty_latent
        

        W, H = img.size
        
        if img2img:
            denoise_strength = float(round(denoise_strength, 2))
            width, height = new_width, new_height
            resize = True
            # Calculate aspect ratio-preserving dimensions
            ratio = min(width / W, height / H)
            width = round(W * ratio)
            height = round(H * ratio)
            width_out, height_out = width, height  # Use the calculated dimensions
        else:
            denoise_strength = 1.00            
            width, height = latent_width, latent_height
            width_out, height_out = latent_width, latent_height
            # Pass through the empty_latent
            latent_result = empty_latent

        # Process the image first
        for i in ImageSequence.Iterator(img):
            i = node_helpers.pillow(ImageOps.exif_transpose, i)

            if i.mode == 'I':
                i = i.point(lambda i: i * (1 / 255))
            image = i.convert("RGB")
            
            if resize:
                image = image.resize((width, height), resample=RESAMPLE_LANCZOS)

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
            
        # Now handle the latent encoding after output_image is created
        if img2img:
            # Encode the image to latent space using the VAE
            latent = vae.encode(output_image)
            # Format the latent tensor correctly for ComfyUI
            latent_result = {"samples": latent}

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

        return (img2img, output_image, output_mask, latent_result, filename, cleaned_filename,
                width_out, height_out, denoise_strength)


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
    "AUNImg2Img": AUNImg2Img,

}

# A dictionary that contains the friendly/humanly readable titles for the nodes
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNImg2Img": "AUN Img2Img",

}
