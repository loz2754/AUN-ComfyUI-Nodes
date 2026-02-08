import os
import folder_paths as comfy_paths
import comfy.sd
import comfy.utils
import torch
import time
import random
import comfy.samplers
from datetime import datetime

class AnyType(str):
   
    def __ne__(self, __value: object) -> bool:
        return False

scheduler = AnyType("*")
sampler = AnyType("*")


class AUNInputs:
    DESCRIPTION = "A comprehensive 'all-in-one' node for setting up a generation pipeline. It loads a checkpoint, creates a latent image, and prepares various parameters for sampling and saving, all in one place."
    date_format = ["%Y%m%d%H%M%S",
                   "%Y%m%d%H%M",
                   "%Y%m%d",
                   "%Y-%m-%d-%H_%M_%S",
                   "%Y-%m-%d-%H_%M",
                   "%Y-%m-%d",
                   "%Y-%m-%d %H_%M_%S",
                   "%Y-%m-%d %H_%M",
                   "%H%M",
                   "%H%M%S",
                   "%H_%M",
                   "%H_%M_%S"]

    def __init__(self):
        pass

    @classmethod
   
    def INPUT_TYPES(s):
        aspect_ratios = ["custom",
                            "512x512",
                            "512x682",
                            "512x768",
                            "640x1536",
                            "720x720",
                            "768x1024",
                            "768x1344",
                            "832x1216",
                            "896x1152",                   
                            "910x512",
                            "952x512",
                            "1024x512",
                            "1024x1024",
                            "1224x512",                          
                          ]

        return {
            "optional": {
                "auto_name": ("STRING", {"multiline": False, "default": "Name", "forceInput": True, "tooltip": "Automatic name input, typically from a prompt node, used when 'name_mode' is set to Auto."}),
                "speed_lora_model": (comfy_paths.get_filename_list("loras"), {"default": "none", "tooltip": "The SpeedLoRA model file to use when 'speed_lora' is enabled."}),
            },
            'required': {
                "ckpt_name": (comfy_paths.get_filename_list("checkpoints"), {"tooltip": "The checkpoint model file to load."}),
                "speed_lora": ("BOOLEAN", {"default": False, "label_on": "On", "label_off": "Off", "tooltip": "Enable or disable SpeedLoRA optimizations."}),
                "speed_lora_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 3.0, "step": 0.01, "round": 0.01, "tooltip": "Multiplier applied to the selected SpeedLoRA weights."}),
                "clip_skip": ("INT", {"default": -1, "min": -24, "max": -1, "step": 1, "tooltip": "Number of last layers of CLIP to skip. -1 is a good default."}),
                "sampler": (comfy.samplers.KSampler.SAMPLERS, {"tooltip": "The sampling algorithm to use."}),
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS + ['AYS SDXL', 'AYS SD1', 'AYS SVD', 'GITS[coeff=1.2]'], {"tooltip": "The noise schedule to use."}),
                "cfg": ("FLOAT", {"default": 2.0, "min": -2.0, "max": 100.0, "step": 0.1, "round": 0.1, "tooltip": "Classifier-Free Guidance scale. Higher values increase prompt adherence."}),
                "steps": ("INT", {"default": 10, "min": 1, "max": 10000, "tooltip": "Number of sampling steps."}),
                "width": ("INT", {"default": 720, "min": 64, "max": 8192, "tooltip": "Image width. Used when 'aspect_ratio' is 'custom'."}),
                "height": ("INT", {"default": 720, "min": 64, "max": 8192, "tooltip": "Image height. Used when 'aspect_ratio' is 'custom'."}),
                "aspect_ratio": (aspect_ratios, {"tooltip": "Select a predefined aspect ratio to automatically set width and height."}),
                "aspect_mode": (["Random", "Swap", "Original"], {"default": "Original", "tooltip": "Random swaps dimensions 50% of the time, Swap forces a swap, Original keeps the original order."}),
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 64, "tooltip": "Number of latent images to generate in a batch."}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed for generation."}),
                'MainFolder': ('STRING', {'multiline': False, 'default': 'MainFolder', "forceInput": False, "tooltip": "The main output folder for saved files."}),
                'ManualName': ('STRING', {'multiline': False, 'default': 'Name', "forceInput": False, "tooltip": "The filename to use when 'name_mode' is set to Manual."}),
                'name_mode': ("BOOLEAN", {"default": False, "label_on": "Manual", "label_off": "Auto", "tooltip": "Switch between automatic and manual filename modes."}),
                "prefix": ('STRING', {'multiline': False, 'default': '', "forceInput": False, "tooltip": "A prefix to add to the generated filename."}),
                "date_format": (s.date_format, {"tooltip": "The format for the date placeholder in filenames."}),
                "crop": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Enable or disable cropping the filename to a specified number of words."}),
                "words": ("INT", {"default": 1, "min": 1, "max": 10, "step": 1, "tooltip": "The number of words to keep from the start of the string."})
            },
        }
                
    RETURN_TYPES = (
        "MODEL", "CLIP", "VAE", "STRING", 
        sampler, scheduler, "FLOAT", "INT", "LATENT", "INT", "INT", "INT",
        'STRING', 'STRING', "STRING", "STRING", "INT", "BOOLEAN",
    )
    RETURN_NAMES = (
        "MODEL", "CLIP", "VAE", "ckpt name",
        "sampler", "scheduler", "cfg", "steps", "latent", "width", "height", "seed",
        'MainFolder', 'Filename', "prefix", "date format", "batch size", "name mode"
    )
    FUNCTION = 'inputs'
    CATEGORY = 'AUN Nodes/Loaders+Inputs'

    def inputs(self, ckpt_name, speed_lora, speed_lora_strength, clip_skip, MainFolder, ManualName, name_mode, prefix, sampler, scheduler, cfg, steps, width, height, aspect_ratio, aspect_mode, batch_size, seed, date_format, crop, words, speed_lora_model="none", auto_name="Name"):
        ckpt_path = comfy_paths.get_full_path("checkpoints", ckpt_name)
        out = comfy.sd.load_checkpoint_guess_config(ckpt_path, output_vae=True, output_clip=True, embedding_directory=comfy_paths.get_folder_paths("embeddings"))
        model, clip, vae = out[0], out[1], out[2]
        
        # Apply clip_skip to the CLIP model
        clip.clip_layer(clip_skip)

        if speed_lora:
            lora_choice = speed_lora_model if speed_lora_model not in (None, "", "None") else None
            if lora_choice:
                speed_lora_path = comfy_paths.get_full_path("loras", lora_choice)
                if speed_lora_path:
                    lora_weights = comfy.utils.load_torch_file(speed_lora_path, safe_load=True)
                    model, clip = comfy.sd.load_lora_for_models(model, clip, lora_weights, speed_lora_strength, 0.0)
                else:
                    print(f"SpeedLoRA model '{lora_choice}' not found; skipping SpeedLoRA load.")

        if aspect_ratio == "512x512":
            width, height = 512, 512
        elif aspect_ratio == "720x720":
            width, height = 720, 720
        elif aspect_ratio == "512x768":
            width, height = 512, 768
        elif aspect_ratio == "910x512":
            width, height = 910, 512
        elif aspect_ratio == "512x682":
            width, height = 512, 682
        elif aspect_ratio == "952x512":
            width, height = 952, 512
        elif aspect_ratio == "1024x512":
            width, height = 1024, 512
        elif aspect_ratio == "1224x512":
            width, height = 1224, 512
        elif aspect_ratio == "1024x1024":
            width, height = 1024, 1024
        elif aspect_ratio == "896x1152":
            width, height = 896, 1152
        elif aspect_ratio == "832x1216":
            width, height = 832, 1216
        elif aspect_ratio == "768x1344":
            width, height = 768, 1344
        elif aspect_ratio == "640x1536":
            width, height = 640, 1536
        elif aspect_ratio == "768x1024":
            width, height = 768, 1024           

        # Store original dimensions
        original_width, original_height = width, height
        
        # Apply aspect mode handling
        if aspect_mode == "Random":
            if random.random() < 0.5:
                width, height = height, width
        elif aspect_mode == "Swap":
            width, height = height, width

        # Create the empty latent
        latent = torch.zeros([batch_size, 4, height // 8, width // 8])

        # Determine the name to use based on name_mode
        filename_to_process = ManualName if name_mode else auto_name

        # Apply cropping if enabled
        if crop:
            name_words = filename_to_process.split()
            if name_words:
                # Take up to 'words' words, but not more than available
                filename_to_process = ' '.join(name_words[:min(words, len(name_words))]) 
                  
        return (model, clip, vae, os.path.splitext(os.path.basename(ckpt_name))[0], sampler, scheduler, cfg, steps, {"samples": latent}, width, height, seed, MainFolder, filename_to_process, prefix, date_format, int(batch_size), name_mode,)
       
    def get_time(self, date_format):
        now = datetime.now()
        timestamp = now.strftime(date_format)

        return (timestamp,)

    @classmethod
    def IS_CHANGED(s, date_format, **kwargs):
        now = datetime.now()
        timestamp = now.strftime(date_format)
        return (timestamp,)
    
NODE_CLASS_MAPPINGS = {
    "AUNInputs": AUNInputs
}

NODE_DISPLAY_NAME_MAPPINGS = {

    "AUNInputs": "AUN Inputs"
}
