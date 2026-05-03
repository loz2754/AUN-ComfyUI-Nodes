import os
import random

import comfy.sample
import comfy.samplers
import comfy.sd
import comfy.utils
import folder_paths as comfy_paths
import nodes
import torch


class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False


scheduler = AnyType("*")
sampler = AnyType("*")


class AUNInputsDiffusersRefineBasic:
    DESCRIPTION = "A lightweight diffusion-model setup node that loads a standalone UNet with explicit CLIP and VAE files, prepares common sampler settings, creates an empty latent batch, and optionally provides a separate refinement diffusion model."

    _NO_DIFFUSION = "<no diffusion models found>"
    _NO_CLIP = "<no clip files found>"
    _NO_VAE = "<no vae files found>"
    _CLIP_TYPE_LOOKUP = {}

    def __init__(self):
        pass

    @staticmethod
    def _choices_or_placeholder(entries, placeholder):
        return entries if entries else [placeholder]

    @classmethod
    def _clip_type_field(cls):
        try:
            clip_enum = comfy.sd.CLIPType
            choices = sorted(str(name).lower() for name in clip_enum.__members__.keys())
        except Exception:
            choices = ["stable_diffusion"]

        normalized_choices = []
        lookup = {}
        for name in choices:
            label = name.replace("_", " ").title()
            normalized_choices.append(label)
            lookup[label] = name

        cls._CLIP_TYPE_LOOKUP = lookup
        return normalized_choices, {
            "default": normalized_choices[0] if normalized_choices else "stable_diffusion",
            "tooltip": "Clip architecture to use when loading a standalone diffusion model.",
        }

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

        diffusion_files = cls._choices_or_placeholder(
            comfy_paths.get_filename_list("diffusion_models"), cls._NO_DIFFUSION
        )
        clip_files = cls._choices_or_placeholder(
            comfy_paths.get_filename_list("clip"), cls._NO_CLIP
        )
        vae_files = cls._choices_or_placeholder(
            comfy_paths.get_filename_list("vae"), cls._NO_VAE
        )
        clip_type_choices, clip_type_meta = cls._clip_type_field()

        return {
            "required": {
                "diffusion_name": (
                    diffusion_files,
                    {
                        "tooltip": "Primary diffusion-model file (UNet only). Matches the comfy-core diffusion model list.",
                    },
                ),
                "refine_diffusion_name": (
                    diffusion_files + ["None"],
                    {
                        "default": "None",
                        "tooltip": "Optional refinement diffusion-model file. Select 'None' to reuse the main model.",
                    },
                ),
                "clip_name": (
                    clip_files,
                    {
                        "tooltip": "CLIP file shared by the main and refine diffusion models.",
                    },
                ),
                "speed_lora": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "label_on": "On",
                        "label_off": "Off",
                        "tooltip": "Enable SpeedLoRA when loading models.",
                    },
                ),
                "speed_lora_model": (
                    comfy_paths.get_filename_list("loras") + ["None"],
                    {"default": "None", "tooltip": "SpeedLoRA file to apply after loading the models."},
                ),
                "speed_lora_strength": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": 0.0,
                        "max": 3.0,
                        "step": 0.01,
                        "round": 0.01,
                        "tooltip": "Strength multiplier when applying the SpeedLoRA weights.",
                    },
                ),
                "speed_lora_full_both": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "label_on": "On",
                        "label_off": "Off",
                        "tooltip": "Apply the full SpeedLoRA strength to both the main and refine models.",
                    },
                ),
                "speed_lora_ratio": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": 0.0,
                        "max": 1.0,
                        "step": 0.01,
                        "round": 0.01,
                        "tooltip": "Share of the SpeedLoRA strength applied to the main model. The refine model receives the remaining share.",
                    },
                ),
                "clip_type": (
                    clip_type_choices,
                    {
                        "default": clip_type_meta.get("default", "stable_diffusion"),
                        "tooltip": "Clip architecture to use when loading a diffusion model.",
                    },
                ),
                "vae_name": (
                    vae_files,
                    {
                        "tooltip": "VAE checkpoint shared by the main and refine diffusion models.",
                    },
                ),
                "sampler": (
                    comfy.samplers.KSampler.SAMPLERS,
                    {"tooltip": "Sampling algorithm."},
                ),
                "scheduler": (
                    comfy.samplers.KSampler.SCHEDULERS + ["AYS SDXL", "AYS SD1", "AYS SVD", "GITS[coeff=1.2]"],
                    {"tooltip": "Noise schedule."},
                ),
                "cfg": (
                    "FLOAT",
                    {
                        "default": 2.0,
                        "min": -2.0,
                        "max": 100.0,
                        "step": 0.1,
                        "round": 0.1,
                        "tooltip": "Classifier-Free Guidance scale.",
                    },
                ),
                "steps": (
                    "INT",
                    {"default": 10, "min": 1, "max": 10000, "tooltip": "Sampling steps."},
                ),
                "width": (
                    "INT",
                    {
                        "default": 720,
                        "min": 64,
                        "max": 8192,
                        "tooltip": "Image width when aspect_ratio='custom'.",
                    },
                ),
                "height": (
                    "INT",
                    {
                        "default": 720,
                        "min": 64,
                        "max": 8192,
                        "tooltip": "Image height when aspect_ratio='custom'.",
                    },
                ),
                "aspect_ratio": (
                    aspect_ratios,
                    {"tooltip": "Preset aspect ratio that overrides width/height."},
                ),
                "aspect_mode": (
                    ["Random", "Swap", "Original"],
                    {
                        "default": "Original",
                        "tooltip": "Random swaps dimensions 50% of the time, Swap always flips width/height.",
                    },
                ),
                "batch_size": (
                    "INT",
                    {"default": 1, "min": 1, "max": 64, "tooltip": "Latent batch size."},
                ),
                "seed": (
                    "INT",
                    {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF, "tooltip": "Base seed."},
                ),
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
        "model name",
        "model name refine",
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

    def _ensure_valid_choice(self, choice, placeholder, label):
        if choice == placeholder:
            raise RuntimeError(f"{label} is required for AUNInputsDiffusersRefineBasic.")

    def _load_diffusion_model(self, diffusion_name):
        self._ensure_valid_choice(diffusion_name, self._NO_DIFFUSION, "A diffusion-model file")
        diffusion_path = comfy_paths.get_full_path("diffusion_models", diffusion_name)
        return comfy.sd.load_diffusion_model(diffusion_path, model_options={})

    def _load_shared_clip_and_vae(self, clip_name, clip_type, vae_name):
        self._ensure_valid_choice(clip_name, self._NO_CLIP, "A CLIP file")
        self._ensure_valid_choice(vae_name, self._NO_VAE, "A VAE file")

        resolved_clip_type = self._CLIP_TYPE_LOOKUP.get(clip_type, clip_type)
        if isinstance(resolved_clip_type, (list, tuple)):
            resolved_clip_type = resolved_clip_type[0] if resolved_clip_type else "stable_diffusion"
        resolved_clip_type = str(resolved_clip_type)

        clip_loader = nodes.CLIPLoader()
        clip_tuple = clip_loader.load_clip(clip_name=clip_name, type=resolved_clip_type)
        clip = clip_tuple[0] if isinstance(clip_tuple, (list, tuple)) else clip_tuple

        vae_loader = nodes.VAELoader()
        vae_tuple = vae_loader.load_vae(vae_name=vae_name)
        vae = vae_tuple[0] if isinstance(vae_tuple, (list, tuple)) else vae_tuple

        return clip, vae

    @staticmethod
    def _clone_model_if_possible(model):
        if hasattr(model, "clone"):
            return model.clone()
        return model

    @staticmethod
    def _mark_latent_processing(model):
        try:
            setattr(model, "_aun_requires_latent_processing", True)
        except Exception:
            pass
        return model

    @staticmethod
    def _apply_speed_lora(model, clip, lora_weights, strength):
        model, _ = comfy.sd.load_lora_for_models(model, clip, lora_weights, strength, 0.0)
        return model

    @staticmethod
    def _resolve_speed_lora_strengths(speed_lora_strength, speed_lora_ratio, speed_lora_full_both):
        if speed_lora_full_both:
            return speed_lora_strength, speed_lora_strength
        main_strength = speed_lora_strength * speed_lora_ratio
        refine_strength = speed_lora_strength * (1.0 - speed_lora_ratio)
        return main_strength, refine_strength

    @staticmethod
    def _apply_aspect_ratio(aspect_ratio, width, height):
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

    @staticmethod
    def _maybe_swap(width, height, aspect_mode):
        if aspect_mode == "Swap":
            return height, width
        if aspect_mode == "Random" and random.SystemRandom().random() < 0.5:
            return height, width
        return width, height

    @classmethod
    def _build_latent(cls, model, batch_size, width, height):
        latent = torch.zeros([batch_size, 4, height // 8, width // 8])
        try:
            matched = comfy.sample.fix_empty_latent_channels(model, latent)
            if hasattr(matched, "shape") and matched.shape[1] != latent.shape[1]:
                try:
                    setattr(model, "_aun_latent_channels", matched.shape[1])
                except Exception:
                    pass
            return matched
        except Exception:
            return latent

    def inputs(
        self,
        diffusion_name,
        refine_diffusion_name,
        clip_name,
        speed_lora,
        speed_lora_model,
        speed_lora_strength,
        speed_lora_full_both,
        speed_lora_ratio,
        clip_type,
        vae_name,
        sampler,
        scheduler,
        cfg,
        steps,
        width,
        height,
        aspect_ratio,
        aspect_mode,
        batch_size,
        seed,
    ):
        model = self._mark_latent_processing(self._load_diffusion_model(diffusion_name))
        clip, vae = self._load_shared_clip_and_vae(clip_name, clip_type, vae_name)

        refine_name = os.path.splitext(os.path.basename(refine_diffusion_name))[0]
        if refine_diffusion_name not in (None, "", "None"):
            refine_model = self._mark_latent_processing(self._load_diffusion_model(refine_diffusion_name))
        else:
            refine_model = self._mark_latent_processing(self._clone_model_if_possible(model))
            refine_name = os.path.splitext(os.path.basename(diffusion_name))[0]

        if speed_lora:
            lora_choice = speed_lora_model if speed_lora_model not in (None, "", "None") else None
            if lora_choice:
                speed_lora_path = comfy_paths.get_full_path("loras", lora_choice)
                if speed_lora_path:
                    lora_weights = comfy.utils.load_torch_file(speed_lora_path, safe_load=True)
                    main_strength, refine_strength = self._resolve_speed_lora_strengths(
                        speed_lora_strength, speed_lora_ratio, speed_lora_full_both
                    )
                    if main_strength > 0.0:
                        model = self._mark_latent_processing(
                            self._apply_speed_lora(model, clip, lora_weights, main_strength)
                        )
                    if refine_model is not None and refine_strength > 0.0:
                        refine_model = self._mark_latent_processing(
                            self._apply_speed_lora(refine_model, clip, lora_weights, refine_strength)
                        )
                else:
                    print(
                        f"SpeedLoRA model '{lora_choice}' not found for refine diffusion inputs; skipping SpeedLoRA load."
                    )

        width, height = self._apply_aspect_ratio(aspect_ratio, width, height)
        width, height = self._maybe_swap(width, height, aspect_mode)

        latent = {"samples": self._build_latent(model, batch_size, width, height)}

        return (
            model,
            clip,
            vae,
            refine_model,
            os.path.splitext(os.path.basename(diffusion_name))[0],
            refine_name,
            sampler,
            scheduler,
            cfg,
            steps,
            latent,
            width,
            height,
            seed,
            int(batch_size),
            speed_lora_ratio,
        )


NODE_CLASS_MAPPINGS = {
    "AUNInputsDiffusersRefineBasic": AUNInputsDiffusersRefineBasic,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNInputsDiffusersRefineBasic": "AUN Inputs Diffusers Refine Basic",
}