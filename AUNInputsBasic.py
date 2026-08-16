import os
from datetime import datetime

import comfy.samplers
import comfy.sd
import comfy.utils
import folder_paths as comfy_paths
import torch

from .AUNResolutionHelper import PRESETS, ASPECT_RATIOS, ASPECT_RATIO_NAMES, ASPECT_MODE_OPTIONS, MEGAPIXELS_WIDGET, MULTIPLE_WIDGET, resolve_dimensions, apply_aspect_mode

class AnyType(str):
   
    def __ne__(self, __value: object) -> bool:
        return False

scheduler = AnyType("*")
sampler = AnyType("*")


class AUNInputsBasic:
    DESCRIPTION = "A comprehensive 'all-in-one' node for setting up a generation pipeline. It loads a checkpoint, creates a latent image, and prepares various parameters for sampling and saving, all in one place.\n\nThe optional *_input sockets override the matching widget values (model, sampler, scheduler, cfg, steps, seed) when connected.\n\nRight-click → \"Collapse Connections\" or double-click to hide output labels and converge connection lines."
    # date_format = ["%Y%m%d%H%M%S",
    #                "%Y%m%d%H%M",
    #                "%Y%m%d",
    #                "%Y-%m-%d-%H_%M_%S",
    #                "%Y-%m-%d-%H_%M",
    #                "%Y-%m-%d",
    #                "%Y-%m-%d %H_%M_%S",
    #                "%Y-%m-%d %H_%M",
    #                "%H%M",
    #                "%H%M%S",
    #                "%H_%M",
    #                "%H_%M_%S"]

    def __init__(self):
        pass

    @classmethod
   
    def INPUT_TYPES(s):

        return {
            "optional": {
                "model_input": ("STRING", {"forceInput": True, "tooltip": "Checkpoint filename override. When connected, replaces 'ckpt_name' (resolved case-insensitively against installed checkpoints; falls back to the widget value if no match is found)."}),
                "sampler_input": ("STRING", {"forceInput": True, "tooltip": "Sampler name override. When connected and non-empty, replaces the 'sampler' widget value."}),
                "scheduler_input": ("STRING", {"forceInput": True, "tooltip": "Scheduler name override. When connected and non-empty, replaces the 'scheduler' widget value."}),
                "cfg_input": ("FLOAT", {"forceInput": True, "tooltip": "CFG scale override. When connected, replaces the 'cfg' widget value."}),
                "steps_input": ("INT", {"forceInput": True, "tooltip": "Steps override. When connected, replaces the 'steps' widget value."}),
                "seed_input": ("INT", {"forceInput": True, "tooltip": "Seed override. When connected, replaces the 'seed' widget value."}),
            },
            'required': {
                "ckpt_name": (comfy_paths.get_filename_list("checkpoints"), {"tooltip": "The checkpoint model file to load."}),
                "speed_lora": ("BOOLEAN", {"default": False, "label_on": "On", "label_off": "Off", "tooltip": "Enable or disable SpeedLoRA optimizations."}),
                "speed_lora_model": (comfy_paths.get_filename_list("loras") + ['None'], {"default": 'None', "tooltip": "The SpeedLoRA model to apply. Select 'None' to disable SpeedLoRA."}),
                "speed_lora_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 3.0, "step": 0.01, "round": 0.01, "tooltip": "Multiplier applied to the selected SpeedLoRA weights."}),
                "clip_skip": ("INT", {"default": -1, "min": -24, "max": -1, "step": 1, "tooltip": "Number of last layers of CLIP to skip. -1 is a good default."}),
                "sampler": (comfy.samplers.KSampler.SAMPLERS, {"tooltip": "The sampling algorithm to use."}),
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS + ['AYS SDXL', 'AYS SD1', 'AYS SVD', 'GITS[coeff=1.2]'], {"tooltip": "The noise schedule to use."}),
                "cfg": ("FLOAT", {"default": 2.0, "min": -2.0, "max": 100.0, "step": 0.1, "round": 0.1, "tooltip": "Classifier-Free Guidance scale. Higher values increase prompt adherence."}),
                "steps": ("INT", {"default": 10, "min": 1, "max": 10000, "tooltip": "Number of sampling steps."}),
                "width": ("INT", {"default": 720, "min": 64, "max": 8192, "tooltip": "Image width. Used when 'aspect_ratio' is 'custom'."}),
                "height": ("INT", {"default": 720, "min": 64, "max": 8192, "tooltip": "Image height. Used when 'aspect_ratio' is 'custom'."}),
                "aspect_ratio": (ASPECT_RATIO_NAMES, {"tooltip": "Select a predefined aspect ratio or ratio to automatically set width and height."}),
                "aspect_mode": (ASPECT_MODE_OPTIONS, {"default": "Original", "tooltip": "Random swaps dimensions 50% of the time, Swap forces a swap, Original keeps the original order."}),
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 64, "tooltip": "Number of latent images to generate in a batch."}),
                "seed": ("INT", {"default": 0, "min": -0xffffffffffffffff, "max": 0xffffffffffffffff, "tooltip": "The random seed for generation."}),
                "megapixels": MEGAPIXELS_WIDGET,
                "multiple": MULTIPLE_WIDGET,
                # 'MainFolder': ('STRING', {'multiline': False, 'default': 'MainFolder', "forceInput": False, "tooltip": "The main output folder for saved files."}),
                # 'ManualName': ('STRING', {'multiline': False, 'default': 'Name', "forceInput": False, "tooltip": "The filename to use when 'name_mode' is set to Manual."}),
                # 'name_mode': ("BOOLEAN", {"default": False, "label_on": "Manual", "label_off": "Auto", "tooltip": "Switch between automatic and manual filename modes."}),
                # "prefix": ('STRING', {'multiline': False, 'default': '', "forceInput": False, "tooltip": "A prefix to add to the generated filename."}),
                # "date_format": (s.date_format, {"tooltip": "The format for the date placeholder in filenames."}),
                # "crop": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Enable or disable cropping the filename to a specified number of words."}),
                # "words": ("INT", {"default": 1, "min": 1, "max": 10, "step": 1, "tooltip": "The number of words to keep from the start of the string."})
            },
        }
                
    RETURN_TYPES = (
        "MODEL", "CLIP", "VAE", "STRING", 
        sampler, 
        scheduler, 
        "FLOAT", 
        "INT", 
        "LATENT", 
        "INT", 
        "INT", 
        "INT",
#        'STRING', 
#        'STRING', 
#        "STRING", 
#        "STRING", 
        "INT", 
#        "BOOLEAN",
    )
    RETURN_NAMES = (
        "MODEL", 
        "CLIP", 
        "VAE", 
        "ckpt name",
        "sampler", 
        "scheduler", 
        "cfg", 
        "steps", 
        "latent", 
        "width", 
        "height", 
        "seed",
#        'MainFolder', 
#        'Filename', 
#        "prefix", 
#        "date format", 
        "batch size", 
#        "name mode"
    )
    OUTPUT_NODE = True
    FUNCTION = 'inputs'
    CATEGORY = 'AUN Nodes/Loaders+Inputs'

    @staticmethod
    def _clean_override(value):
        if value is None:
            return ""
        s = str(value).strip()
        return "" if s.lower() in ("", "none", "null") else s

    @staticmethod
    def _resolve_ckpt_name(override, current):
        override = AUNInputsBasic._clean_override(override)
        if not override:
            return current
        candidates = comfy_paths.get_filename_list("checkpoints")
        lowered = override.lower()
        for candidate in candidates:
            if candidate.lower() == lowered:
                return candidate
        for ext in (".safetensors", ".ckpt", ".pt", ".gguf"):
            for candidate in candidates:
                if candidate.lower() == (override + ext).lower():
                    return candidate
        for candidate in candidates:
            if os.path.basename(candidate).lower() == lowered:
                return candidate
        for ext in (".safetensors", ".ckpt", ".pt", ".gguf"):
            for candidate in candidates:
                if os.path.basename(candidate).lower() == (override + ext).lower():
                    return candidate
        print(f"AUNInputsBasic: checkpoint override '{override}' not found among {len(candidates)} installed checkpoints; falling back to widget value '{current}'.")
        return current

    def inputs(self, ckpt_name, speed_lora, speed_lora_model, speed_lora_strength, clip_skip, 
               sampler, scheduler, cfg, steps, width, height, aspect_ratio, aspect_mode, batch_size, seed,
               megapixels=1.0, multiple=8, model_input="", sampler_input="", scheduler_input="", cfg_input=None, steps_input=None, seed_input=None
               ):
        model_input = self._clean_override(model_input)
        sampler_input = self._clean_override(sampler_input)
        scheduler_input = self._clean_override(scheduler_input)
        ckpt_name = self._resolve_ckpt_name(model_input, ckpt_name)
        if sampler_input:
            sampler = sampler_input
        if scheduler_input:
            scheduler = scheduler_input
        if cfg_input is not None:
            cfg = cfg_input
        if steps_input is not None:
            steps = steps_input
        if seed_input is not None:
            seed = seed_input

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

        width, height = resolve_dimensions(width, height, aspect_ratio, megapixels, multiple)
        width, height = apply_aspect_mode(width, height, aspect_mode)

        # Create the empty latent
        latent = torch.zeros([batch_size, 4, height // 8, width // 8])

        # Determine the name to use based on name_mode
        #filename_to_process = ManualName if name_mode else auto_name

        # Apply cropping if enabled
        # if crop:
        #     name_words = filename_to_process.split()
        #     if name_words:
        #         # Take up to 'words' words, but not more than available
        #         filename_to_process = ' '.join(name_words[:min(words, len(name_words))]) 
                  
        return (model, clip, vae, os.path.splitext(os.path.basename(ckpt_name))[0], sampler, scheduler, cfg, steps, {"samples": latent}, width, height, seed,                
        #MainFolder, 
        #filename_to_process, 
        #prefix, 
        #date_format, 
        int(batch_size), 
        #name_mode,
        )
       
    def get_time(self, date_format):
        now = datetime.now()
        timestamp = now.strftime(date_format)

        return (timestamp,)

    @classmethod
    def IS_CHANGED(s, **kwargs):
        date_format = kwargs.get('date_format', "%Y-%m-%d")
        now = datetime.now()
        timestamp = now.strftime(date_format)
        return (timestamp,)
    
NODE_CLASS_MAPPINGS = {
    "AUNInputsBasic": AUNInputsBasic
}

NODE_DISPLAY_NAME_MAPPINGS = {

    "AUNInputsBasic": "AUN Inputs Basic"
}
