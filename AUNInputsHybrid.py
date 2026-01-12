import os
import random
import torch
from datetime import datetime

import comfy.sd
import comfy.sample
import comfy.utils
import nodes
import folder_paths as comfy_paths


class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False


scheduler = AnyType("*")
sampler = AnyType("*")


class AUNInputsHybrid:
    """Combined checkpoint / diffusion-model loader with the original AUNInputs ergonomics."""

    DESCRIPTION = (
        "Load a standard checkpoint (UNet+CLIP+VAE) or mix-and-match a diffusion-only UNet with "
        "explicit CLIP and VAE files, then emit the same downstream inputs as AUNInputs."
    )

    MODEL_SOURCES = ["Checkpoint", "Diffusion model"]
    _NO_DIFFUSION = "<no diffusion models found>"
    _NO_CLIP = "<no clip files found>"
    _NO_VAE = "<no vae files found>"
    _CLIP_TYPE_LOOKUP = {}

    date_format = [
        "%Y%m%d%H%M%S",
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
        "%H_%M_%S",
    ]

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
        meta = {
            "default": normalized_choices[0] if normalized_choices else "stable_diffusion",
            "tooltip": "Clip architecture to use when loading a standalone diffusion model.",
        }
        meta.setdefault(
            "tooltip",
            "Clip architecture to use when loading a standalone diffusion model.",
        )
        return normalized_choices, meta

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

        ckpt_files = comfy_paths.get_filename_list("checkpoints")
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
            "optional": {
                "auto_name": (
                    "STRING",
                    {
                        "multiline": False,
                        "default": "Name",
                        "forceInput": True,
                        "tooltip": "Automatic name input used when 'name_mode' stays on Auto.",
                    },
                )
            },
            "required": {
                "model_source": (
                    cls.MODEL_SOURCES,
                    {
                        "default": cls.MODEL_SOURCES[0],
                        "tooltip": "Choose a classic checkpoint (UNet+CLIP+VAE) or load a diffusion-only UNet with explicit companions.",
                    },
                ),
                "ckpt_name": (
                    ckpt_files,
                    {
                        "tooltip": "Checkpoint model file to load when model_source='Checkpoint'.",
                    },
                ),
                "diffusion_name": (
                    diffusion_files,
                    {
                        "tooltip": "Diffusion-model file (UNet only). Only used when model_source='Diffusion model'.",
                    },
                ),
                "clip_name": (
                    clip_files,
                    {
                        "tooltip": "CLIP file to pair with a diffusion model. Matches the comfy-core CLIPLoader list.",
                    },
                ),
                "speed_lora": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "label_on": "On",
                        "label_off": "Off",
                        "tooltip": "Enable SpeedLoRA when loading models in either mode.",
                    },
                ),
                "speed_lora_model": (
                    comfy_paths.get_filename_list("loras"),
                    {"default": "", "tooltip": "SpeedLoRA file to apply after loading the model."},
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
                "clip_type": (
                    clip_type_choices,
                    {
                        "default": clip_type_meta.get("default", "stable_diffusion"),
                        "tooltip": "Clip architecture to use when loading a standalone diffusion model.",
                    },
                ),
                "vae_name": (
                    vae_files,
                    {
                        "tooltip": "VAE checkpoint to pair with a diffusion model.",
                    },
                ),
                "clip_skip": (
                    "INT",
                    {
                        "default": -1,
                        "min": -24,
                        "max": -1,
                        "step": 1,
                        "tooltip": "Number of last CLIP layers to skip (applied in both modes).",
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
                "MainFolder": (
                    "STRING",
                    {
                        "multiline": False,
                        "default": "MainFolder",
                        "tooltip": "Primary output folder name.",
                    },
                ),
                "ManualName": (
                    "STRING",
                    {
                        "multiline": False,
                        "default": "Name",
                        "tooltip": "Manual filename when name_mode=Manual.",
                    },
                ),
                "name_mode": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "label_on": "Manual",
                        "label_off": "Auto",
                        "tooltip": "Choose between ManualName and auto_name inputs.",
                    },
                ),
                "prefix": (
                    "STRING",
                    {
                        "multiline": False,
                        "default": "",
                        "tooltip": "Optional prefix prepended to filenames.",
                    },
                ),
                "date_format": (
                    cls.date_format,
                    {"tooltip": "Date placeholder formatting."},
                ),
                "crop": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "label_on": "On",
                        "label_off": "Off",
                        "tooltip": "Trim filenames to the first N words.",
                    },
                ),
                "words": (
                    "INT",
                    {
                        "default": 1,
                        "min": 1,
                        "max": 10,
                        "tooltip": "Word limit applied when crop=True.",
                    },
                ),
            },
        }

    RETURN_TYPES = (
        "MODEL",
        "CLIP",
        "VAE",
        "STRING",
        sampler,
        scheduler,
        "FLOAT",
        "INT",
        "LATENT",
        "INT",
        "INT",
        "INT",
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "INT",
        "BOOLEAN",
    )

    RETURN_NAMES = (
        "MODEL",
        "CLIP",
        "VAE",
        "model name",
        "sampler",
        "scheduler",
        "cfg",
        "steps",
        "latent",
        "width",
        "height",
        "seed",
        "MainFolder",
        "Filename",
        "prefix",
        "date format",
        "batch size",
        "name mode",
    )

    FUNCTION = "inputs"
    CATEGORY = "AUN Nodes/Loaders+Inputs"

    def _ensure_valid_choice(self, choice, placeholder, label):
        if choice == placeholder:
            raise RuntimeError(f"{label} is required when model_source='Diffusion model'.")

    def _load_checkpoint_bundle(self, ckpt_name):
        ckpt_path = comfy_paths.get_full_path("checkpoints", ckpt_name)
        out = comfy.sd.load_checkpoint_guess_config(
            ckpt_path,
            output_vae=True,
            output_clip=True,
            embedding_directory=comfy_paths.get_folder_paths("embeddings"),
        )
        return out[0], out[1], out[2]

    def _load_diffusion_bundle(self, diffusion_name, clip_name, clip_type, vae_name):
        self._ensure_valid_choice(diffusion_name, self._NO_DIFFUSION, "A diffusion-model file")
        self._ensure_valid_choice(clip_name, self._NO_CLIP, "A CLIP file")
        self._ensure_valid_choice(vae_name, self._NO_VAE, "A VAE file")

        diffusion_path = comfy_paths.get_full_path("diffusion_models", diffusion_name)
        model = comfy.sd.load_diffusion_model(diffusion_path, model_options={})

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

        return model, clip, vae

    @staticmethod
    def _apply_clip_skip(clip, clip_skip):
        if hasattr(clip, "clip_layer"):
            clip.clip_layer(clip_skip)

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
        if aspect_mode == "Random" and random.random() < 0.5:
            return height, width
        return width, height

    @staticmethod
    def _model_latent_channels(model):
        target = getattr(model, "_aun_latent_channels", None)
        if target is not None:
            return target
        target = getattr(model, "latent_channels", None)
        if target is None:
            inner = getattr(model, "model", None)
            target = getattr(inner, "latent_channels", None)
        return target

    @classmethod
    def _build_latent(cls, model, batch_size, width, height, force_match=False):
        latent = torch.zeros([batch_size, 4, height // 8, width // 8])
        if not force_match:
            return latent
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
        model_source,
        ckpt_name,
        diffusion_name,
        clip_name,
        speed_lora,
        speed_lora_model,
        speed_lora_strength,
        clip_type,
        vae_name,
        clip_skip,
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
        MainFolder,
        ManualName,
        name_mode,
        prefix,
        date_format,
        crop,
        words,
        auto_name="Name",
    ):
        if model_source == "Diffusion model":
            model, clip, vae = self._load_diffusion_bundle(diffusion_name, clip_name, clip_type, vae_name)
            ckpt_label = os.path.splitext(os.path.basename(diffusion_name))[0]
            force_match = True
            try:
                setattr(model, "_aun_requires_latent_processing", True)
            except Exception:
                pass
        else:
            model, clip, vae = self._load_checkpoint_bundle(ckpt_name)
            ckpt_label = os.path.splitext(os.path.basename(ckpt_name))[0]
            force_match = False
            try:
                setattr(model, "_aun_requires_latent_processing", False)
            except Exception:
                pass

        self._apply_clip_skip(clip, clip_skip)

        if speed_lora:
            lora_choice = speed_lora_model if speed_lora_model not in (None, "", "None") else None
            if lora_choice:
                speed_lora_path = comfy_paths.get_full_path("loras", lora_choice)
                if speed_lora_path:
                    lora_weights = comfy.utils.load_torch_file(speed_lora_path, safe_load=True)
                    model, clip = comfy.sd.load_lora_for_models(model, clip, lora_weights, speed_lora_strength, 0.0)
                else:
                    print(
                        f"SpeedLoRA model '{lora_choice}' not found for hybrid inputs; skipping SpeedLoRA load."
                    )

        width, height = self._apply_aspect_ratio(aspect_ratio, width, height)
        width, height = self._maybe_swap(width, height, aspect_mode)

        latent = {"samples": self._build_latent(model, batch_size, width, height, force_match=force_match)}

        filename_to_process = ManualName if name_mode else auto_name
        if crop:
            name_words = filename_to_process.split()
            if name_words:
                filename_to_process = " ".join(name_words[: min(words, len(name_words))])

        return (
            model,
            clip,
            vae,
            ckpt_label,
            sampler,
            scheduler,
            cfg,
            steps,
            latent,
            width,
            height,
            seed,
            MainFolder,
            filename_to_process,
            prefix,
            date_format,
            int(batch_size),
            name_mode,
        )

    def get_time(self, date_format):
        now = datetime.now()
        timestamp = now.strftime(date_format)
        return (timestamp,)

    @classmethod
    def IS_CHANGED(cls, date_format, **_kwargs):
        now = datetime.now()
        timestamp = now.strftime(date_format)
        return (timestamp,)


NODE_CLASS_MAPPINGS = {
    "AUNInputsHybrid": AUNInputsHybrid,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNInputsHybrid": "AUN Inputs Hybrid",
}
