import os
import random

import comfy.samplers
import comfy.sd
import comfy.utils
import folder_paths as comfy_paths
import torch


class AnyType(str):

    def __ne__(self, __value: object) -> bool:
        return False


scheduler = AnyType("*")
sampler = AnyType("*")


class AUNInputsRefineBasic:
    DESCRIPTION = "A lightweight all-in-one setup node that loads a checkpoint, prepares common sampler settings, creates an empty latent batch, and optionally provides a separate refinement model."

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        aspect_ratios = [
            "custom",
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
            "required": {
                "ckpt_name": (comfy_paths.get_filename_list("checkpoints"), {"tooltip": "The checkpoint model file to load."}),
                "refine_ckpt": (comfy_paths.get_filename_list("checkpoints") + ["None"], {"default": "None", "tooltip": "An optional refinement checkpoint to load as a separate refine model. Select 'None' to reuse the main model."}),
                "speed_lora": ("BOOLEAN", {"default": False, "label_on": "On", "label_off": "Off", "tooltip": "Enable or disable SpeedLoRA optimizations."}),
                "speed_lora_model": (comfy_paths.get_filename_list("loras") + ["None"], {"default": "None", "tooltip": "The SpeedLoRA model to apply. Select 'None' to disable SpeedLoRA."}),
                "speed_lora_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 3.0, "step": 0.01, "round": 0.01, "tooltip": "Multiplier applied to the selected SpeedLoRA weights."}),
                "speed_lora_full_both": ("BOOLEAN", {"default": False, "label_on": "On", "label_off": "Off", "tooltip": "Apply the full SpeedLoRA strength to both the main and refine models."}),
                "speed_lora_ratio": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01, "round": 0.01, "tooltip": "Share of the SpeedLoRA strength applied to the main model. The refine model receives the remaining share."}),
                "clip_skip": ("INT", {"default": -1, "min": -24, "max": -1, "step": 1, "tooltip": "Number of last layers of CLIP to skip. -1 is a good default."}),
                "sampler": (comfy.samplers.KSampler.SAMPLERS, {"tooltip": "The sampling algorithm to use."}),
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS + ["AYS SDXL", "AYS SD1", "AYS SVD", "GITS[coeff=1.2]"], {"tooltip": "The noise schedule to use."}),
                "cfg": ("FLOAT", {"default": 2.0, "min": -2.0, "max": 100.0, "step": 0.1, "round": 0.1, "tooltip": "Classifier-Free Guidance scale. Higher values increase prompt adherence."}),
                "steps": ("INT", {"default": 10, "min": 1, "max": 10000, "tooltip": "Number of sampling steps."}),
                "width": ("INT", {"default": 720, "min": 64, "max": 8192, "tooltip": "Image width. Used when 'aspect_ratio' is 'custom'."}),
                "height": ("INT", {"default": 720, "min": 64, "max": 8192, "tooltip": "Image height. Used when 'aspect_ratio' is 'custom'."}),
                "aspect_ratio": (aspect_ratios, {"tooltip": "Select a predefined aspect ratio to automatically set width and height."}),
                "aspect_mode": (["Random", "Swap", "Original"], {"default": "Original", "tooltip": "Random swaps dimensions 50% of the time, Swap forces a swap, Original keeps the original order."}),
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 64, "tooltip": "Number of latent images to generate in a batch."}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed for generation."}),
            },
        }

    RETURN_TYPES = (
        "MODEL",
        "CLIP",
        "VAE",
        "MODEL",
        "STRING",
        "STRING",
        sampler,
        scheduler,
        "FLOAT",
        "INT",
        "LATENT",
        "INT",
        "INT",
        "INT",
        "INT",
        "FLOAT",
    )
    RETURN_NAMES = (
        "MODEL",
        "CLIP",
        "VAE",
        "MODEL REFINE",
        "ckpt name",
        "ckpt name refine",
        "sampler",
        "scheduler",
        "cfg",
        "steps",
        "latent",
        "width",
        "height",
        "seed",
        "batch size",
        "speed lora ratio",
    )
    FUNCTION = "inputs"
    CATEGORY = "AUN Nodes/Loaders+Inputs"

    @staticmethod
    def _load_checkpoint_bundle(ckpt_name):
        ckpt_path = comfy_paths.get_full_path("checkpoints", ckpt_name)
        out = comfy.sd.load_checkpoint_guess_config(
            ckpt_path,
            output_vae=True,
            output_clip=True,
            embedding_directory=comfy_paths.get_folder_paths("embeddings"),
        )
        return out[0], out[1], out[2]

    @staticmethod
    def _clone_model_if_possible(model):
        if hasattr(model, "clone"):
            return model.clone()
        return model

    @staticmethod
    def _tag_model_source(model, ckpt_name):
        if model is not None:
            setattr(model, "_aun_source_ckpt", ckpt_name)
        return model

    @staticmethod
    def _apply_speed_lora(model, clip, lora_weights, strength, ckpt_name):
        model, _ = comfy.sd.load_lora_for_models(model, clip, lora_weights, strength, 0.0)
        return AUNInputsRefineBasic._tag_model_source(model, ckpt_name)

    @staticmethod
    def _resolve_speed_lora_strengths(speed_lora_strength, speed_lora_ratio, speed_lora_full_both):
        if speed_lora_full_both:
            return speed_lora_strength, speed_lora_strength
        main_strength = speed_lora_strength * speed_lora_ratio
        refine_strength = speed_lora_strength * (1.0 - speed_lora_ratio)
        return main_strength, refine_strength

    @staticmethod
    def _resolve_dimensions(width, height, aspect_ratio):
        presets = {
            "512x512": (512, 512),
            "720x720": (720, 720),
            "512x768": (512, 768),
            "910x512": (910, 512),
            "512x682": (512, 682),
            "952x512": (952, 512),
            "1024x512": (1024, 512),
            "1224x512": (1224, 512),
            "1024x1024": (1024, 1024),
            "896x1152": (896, 1152),
            "832x1216": (832, 1216),
            "768x1344": (768, 1344),
            "640x1536": (640, 1536),
            "768x1024": (768, 1024),
        }
        return presets.get(aspect_ratio, (width, height))

    def inputs(self, ckpt_name, refine_ckpt, speed_lora, speed_lora_model, speed_lora_strength, speed_lora_full_both, speed_lora_ratio, clip_skip, sampler, scheduler, cfg, steps, width, height, aspect_ratio, aspect_mode, batch_size, seed):
        model, clip, vae = self._load_checkpoint_bundle(ckpt_name)
        model = self._tag_model_source(model, ckpt_name)

        refine_model = None
        refine_name = os.path.splitext(os.path.basename(refine_ckpt))[0]
        if refine_ckpt not in (None, "", "None"):
            refine_model, _, _ = self._load_checkpoint_bundle(refine_ckpt)
            refine_model = self._tag_model_source(refine_model, refine_ckpt)
        else:
            refine_model = self._clone_model_if_possible(model)
            refine_model = self._tag_model_source(refine_model, ckpt_name)
            refine_name = os.path.splitext(os.path.basename(ckpt_name))[0]

        clip.clip_layer(clip_skip)

        if speed_lora:
            lora_choice = speed_lora_model if speed_lora_model not in (None, "", "None") else None
            if lora_choice:
                speed_lora_path = comfy_paths.get_full_path("loras", lora_choice)
                if speed_lora_path:
                    lora_weights = comfy.utils.load_torch_file(speed_lora_path, safe_load=True)
                    main_strength, refine_strength = self._resolve_speed_lora_strengths(speed_lora_strength, speed_lora_ratio, speed_lora_full_both)
                    if main_strength > 0.0:
                        model = self._apply_speed_lora(model, clip, lora_weights, main_strength, ckpt_name)
                    if refine_model is not None and refine_strength > 0.0:
                        refine_model = self._apply_speed_lora(refine_model, clip, lora_weights, refine_strength, refine_ckpt if refine_ckpt not in (None, "", "None") else ckpt_name)
                else:
                    print(f"SpeedLoRA model '{lora_choice}' not found; skipping SpeedLoRA load.")

        width, height = self._resolve_dimensions(width, height, aspect_ratio)

        if aspect_mode == "Random":
            if random.SystemRandom().random() < 0.5:
                width, height = height, width
        elif aspect_mode == "Swap":
            width, height = height, width

        latent = torch.zeros([batch_size, 4, height // 8, width // 8])

        return (
            model,
            clip,
            vae,
            refine_model,
            os.path.splitext(os.path.basename(ckpt_name))[0],
            refine_name,
            sampler,
            scheduler,
            cfg,
            steps,
            {"samples": latent},
            width,
            height,
            seed,
            int(batch_size),
            speed_lora_ratio,
        )


NODE_CLASS_MAPPINGS = {
    "AUNInputsRefineBasic": AUNInputsRefineBasic
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNInputsRefineBasic": "AUN Inputs Refine Basic"
}