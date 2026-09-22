import os

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


class AUNInputsWan22Basic:
    DESCRIPTION = "Wan2.2 video loader node that loads high-noise and low-noise diffusion experts with explicit CLIP and VAE files, optional CLIP Vision (for i2v), independent LoRA per expert, and MoE sampler settings that plug straight into Wan2.2 MoE KSampler.\n\nThe optional *_input sockets override the matching widget values when connected.\n\nRight-click → \"Collapse Connections\" or double-click to hide output labels and converge connection lines."

    _NO_DIFFUSION = "<no diffusion models found>"
    _NO_CLIP = "<no clip files found>"
    _NO_VAE = "<no vae files found>"
    _NO_VISION = "None"
    _CLIP_TYPE_LOOKUP = {}

    def __init__(self):
        pass

    @staticmethod
    def _clean_override(value):
        if value is None:
            return ""
        s = str(value).strip()
        return "" if s.lower() in ("", "none", "null") else s

    @staticmethod
    def _resolve_name(override, current, folder_key, label):
        override = AUNInputsWan22Basic._clean_override(override)
        if not override:
            return current
        candidates = comfy_paths.get_filename_list(folder_key)
        if not candidates:
            return current
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
        print(f"AUNInputsWan22Basic: {label} override '{override}' not found among {len(candidates)} installed files; falling back to widget value '{current}'.")
        return current

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
            "tooltip": "Clip architecture to use when loading the diffusion experts.",
        }

    @classmethod
    def INPUT_TYPES(cls):
        diffusion_files = cls._choices_or_placeholder(
            comfy_paths.get_filename_list("diffusion_models"), cls._NO_DIFFUSION
        )
        clip_files = cls._choices_or_placeholder(
            comfy_paths.get_filename_list("clip"), cls._NO_CLIP
        )
        vae_files = cls._choices_or_placeholder(
            comfy_paths.get_filename_list("vae"), cls._NO_VAE
        )
        try:
            vision_files = comfy_paths.get_filename_list("clip_vision")
        except Exception:
            vision_files = []
        vision_choices = ["None"] + list(vision_files)
        lora_choices = comfy_paths.get_filename_list("loras") + ["None"]
        clip_type_choices, clip_type_meta = cls._clip_type_field()

        return {
            "optional": {
                "high_noise_input": ("STRING", {"forceInput": True, "tooltip": "High-noise diffusion filename override. When connected, replaces 'high_noise_name'."}),
                "low_noise_input": ("STRING", {"forceInput": True, "tooltip": "Low-noise diffusion filename override. When connected, replaces 'low_noise_name'."}),
                "clip_input": ("STRING", {"forceInput": True, "tooltip": "CLIP filename override. When connected, replaces 'clip_name'."}),
                "vae_input": ("STRING", {"forceInput": True, "tooltip": "VAE filename override. When connected, replaces 'vae_name'."}),
                "clip_vision_input": ("STRING", {"forceInput": True, "tooltip": "CLIP Vision filename override. When connected and non-empty, replaces 'clip_vision_name'. Connect 'None' semantics by leaving empty to skip vision loading."}),
                "lora_high_input": ("STRING", {"forceInput": True, "tooltip": "LoRA filename override for the high-noise expert. When connected, replaces 'lora_high_name'."}),
                "lora_low_input": ("STRING", {"forceInput": True, "tooltip": "LoRA filename override for the low-noise expert. When connected, replaces 'lora_low_name'."}),
                "sampler_input": ("STRING", {"forceInput": True, "tooltip": "Sampler name override. When connected and non-empty, replaces the 'sampler' widget value."}),
                "scheduler_input": ("STRING", {"forceInput": True, "tooltip": "Scheduler name override. When connected and non-empty, replaces the 'scheduler' widget value."}),
                "cfg_high_input": ("FLOAT", {"forceInput": True, "tooltip": "CFG override for the high-noise expert."}),
                "cfg_low_input": ("FLOAT", {"forceInput": True, "tooltip": "CFG override for the low-noise expert."}),
                "boundary_input": ("FLOAT", {"forceInput": True, "tooltip": "Boundary override. When connected, replaces the 'boundary' widget value."}),
                "sigma_shift_input": ("FLOAT", {"forceInput": True, "tooltip": "Sigma shift override. When connected, replaces the 'sigma_shift' widget value."}),
                "steps_input": ("INT", {"forceInput": True, "tooltip": "Steps override. When connected, replaces the 'steps' widget value."}),
                "seed_input": ("INT", {"forceInput": True, "tooltip": "Seed override. When connected, replaces the 'seed' widget value."}),
                "fps_input": ("FLOAT", {"forceInput": True, "tooltip": "FPS override. When connected, replaces the 'fps' widget value."}),
                "length_input": ("INT", {"forceInput": True, "tooltip": "Frame-length override. When connected, replaces the 'length' widget value."}),
            },
            "required": {
                "high_noise_name": (
                    diffusion_files,
                    {"tooltip": "High-noise diffusion expert file (first MoE stage)."},
                ),
                "low_noise_name": (
                    diffusion_files,
                    {"tooltip": "Low-noise diffusion expert file (second MoE stage)."},
                ),
                "clip_name": (
                    clip_files,
                    {"tooltip": "CLIP file to pair with the diffusion experts (umt5 for Wan2.2)."},
                ),
                "clip_type": (
                    clip_type_choices,
                    {
                        "default": clip_type_meta.get("default", "stable_diffusion"),
                        "tooltip": "Clip architecture to use when loading the diffusion experts.",
                    },
                ),
                "vae_name": (
                    vae_files,
                    {"tooltip": "VAE checkpoint for decoding Wan2.2 latents."},
                ),
                "clip_vision_name": (
                    vision_choices,
                    {"default": "None", "tooltip": "CLIP Vision file for image-to-video. 'None' skips vision loading (text-to-video)."},
                ),
                "lora_high_name": (
                    lora_choices,
                    {"default": "None", "tooltip": "LoRA file for the high-noise expert. 'None' disables."},
                ),
                "lora_high_strength": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 4.0, "step": 0.01, "round": 0.01, "tooltip": "LoRA strength for the high-noise expert."},
                ),
                "lora_low_name": (
                    lora_choices,
                    {"default": "None", "tooltip": "LoRA file for the low-noise expert. 'None' disables."},
                ),
                "lora_low_strength": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 4.0, "step": 0.01, "round": 0.01, "tooltip": "LoRA strength for the low-noise expert."},
                ),
                "sampler": (
                    comfy.samplers.KSampler.SAMPLERS,
                    {"tooltip": "Sampling algorithm for the MoE sampler."},
                ),
                "scheduler": (
                    comfy.samplers.KSampler.SCHEDULERS,
                    {"tooltip": "Noise schedule for the MoE sampler."},
                ),
                "cfg_high": (
                    "FLOAT",
                    {"default": 4.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01, "tooltip": "CFG for the high-noise expert."},
                ),
                "cfg_low": (
                    "FLOAT",
                    {"default": 3.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01, "tooltip": "CFG for the low-noise expert."},
                ),
                "boundary": (
                    "FLOAT",
                    {"default": 0.875, "min": 0.0, "max": 1.0, "step": 0.001, "round": 0.001, "tooltip": "MoE timestep boundary. Recommended: 0.875 for t2v, 0.9 for i2v."},
                ),
                "sigma_shift": (
                    "FLOAT",
                    {"default": 8.0, "min": -1.0, "max": 100.0, "step": 0.01, "tooltip": "Shift applied to both experts. Use -1 to bypass and leave models unpatched."},
                ),
                "steps": (
                    "INT",
                    {"default": 20, "min": 1, "max": 10000, "tooltip": "Sampling steps for the MoE schedule."},
                ),
                "seed": (
                    "INT",
                    {"default": 0, "min": -0xffffffffffffffff, "max": 0xFFFFFFFFFFFFFFFF, "tooltip": "Base seed shared by both experts."},
                ),
                "fps": (
                    "FLOAT",
                    {"default": 16.0, "min": 1.0, "max": 120.0, "step": 0.5, "tooltip": "Frames per second. FLOAT output wires into VHS Video Combine."},
                ),
                "length": (
                    "INT",
                    {"default": 81, "min": 1, "max": 10000, "tooltip": "Video length in frames. Odd counts (81/121) suit Wan2.2 temporal alignment."},
                ),
            },
        }

    RETURN_TYPES = (
        "MODEL",
        "MODEL",
        "CLIP",
        "VAE",
        "CLIP_VISION",
        "STRING",
        "STRING",
        sampler,
        scheduler,
        "FLOAT",
        "FLOAT",
        "FLOAT",
        "FLOAT",
        "INT",
        "INT",
        "FLOAT",
        "INT",
        "INT",
    )

    RETURN_NAMES = (
        "MODEL high",
        "MODEL low",
        "CLIP",
        "VAE",
        "CLIP_VISION",
        "high model name",
        "low model name",
        "sampler",
        "scheduler",
        "cfg_high",
        "cfg_low",
        "boundary",
        "sigma_shift",
        "steps",
        "seed",
        "fps",
        "frame_rate",
        "frames",
    )

    FUNCTION = "inputs"
    CATEGORY = "AUN Nodes/Loaders+Inputs"

    def _ensure_valid_choice(self, choice, placeholder, label):
        if choice == placeholder:
            raise RuntimeError(f"{label} is required for AUNInputsWan22Basic.")

    def _load_lora_weights(self, lora_name, label):
        if lora_name in (None, "", "None"):
            return None
        lora_path = comfy_paths.get_full_path("loras", lora_name)
        if not lora_path:
            print(f"AUNInputsWan22Basic: {label} LoRA '{lora_name}' not found; skipping.")
            return None
        return comfy.utils.load_torch_file(lora_path, safe_load=True)

    def _mark_model(self, model):
        try:
            setattr(model, "_aun_requires_latent_processing", True)
        except Exception:
            pass
        try:
            probe = torch.zeros([1, 16, 8, 8])
            matched = comfy.sample.fix_empty_latent_channels(model, probe)
            if hasattr(matched, "shape") and matched.shape[1] != probe.shape[1]:
                try:
                    setattr(model, "_aun_latent_channels", matched.shape[1])
                except Exception:
                    pass
        except Exception:
            pass
        return model

    def inputs(
        self,
        high_noise_name,
        low_noise_name,
        clip_name,
        clip_type,
        vae_name,
        clip_vision_name,
        lora_high_name,
        lora_high_strength,
        lora_low_name,
        lora_low_strength,
        sampler,
        scheduler,
        cfg_high,
        cfg_low,
        boundary,
        sigma_shift,
        steps,
        seed,
        fps,
        length,
        high_noise_input="",
        low_noise_input="",
        clip_input="",
        vae_input="",
        clip_vision_input="",
        lora_high_input="",
        lora_low_input="",
        sampler_input="",
        scheduler_input="",
        cfg_high_input=None,
        cfg_low_input=None,
        boundary_input=None,
        sigma_shift_input=None,
        steps_input=None,
        seed_input=None,
        fps_input=None,
        length_input=None,
    ):
        high_noise_input = self._clean_override(high_noise_input)
        low_noise_input = self._clean_override(low_noise_input)
        clip_input = self._clean_override(clip_input)
        vae_input = self._clean_override(vae_input)
        clip_vision_input = self._clean_override(clip_vision_input)
        lora_high_input = self._clean_override(lora_high_input)
        lora_low_input = self._clean_override(lora_low_input)
        sampler_input = self._clean_override(sampler_input)
        scheduler_input = self._clean_override(scheduler_input)

        high_noise_name = self._resolve_name(high_noise_input, high_noise_name, "diffusion_models", "high-noise diffusion model")
        low_noise_name = self._resolve_name(low_noise_input, low_noise_name, "diffusion_models", "low-noise diffusion model")
        clip_name = self._resolve_name(clip_input, clip_name, "clip", "CLIP")
        vae_name = self._resolve_name(vae_input, vae_name, "vae", "VAE")
        if clip_vision_input:
            clip_vision_name = clip_vision_input
        if lora_high_input:
            lora_high_name = self._resolve_name(lora_high_input, lora_high_name, "loras", "high-noise LoRA")
        if lora_low_input:
            lora_low_name = self._resolve_name(lora_low_input, lora_low_name, "loras", "low-noise LoRA")
        if sampler_input:
            sampler = sampler_input
        if scheduler_input:
            scheduler = scheduler_input
        if cfg_high_input is not None:
            cfg_high = cfg_high_input
        if cfg_low_input is not None:
            cfg_low = cfg_low_input
        if boundary_input is not None:
            boundary = boundary_input
        if sigma_shift_input is not None:
            sigma_shift = sigma_shift_input
        if steps_input is not None:
            steps = steps_input
        if seed_input is not None:
            seed = seed_input
        if fps_input is not None:
            fps = fps_input
        if length_input is not None:
            length = length_input

        self._ensure_valid_choice(high_noise_name, self._NO_DIFFUSION, "A high-noise diffusion-model file")
        self._ensure_valid_choice(low_noise_name, self._NO_DIFFUSION, "A low-noise diffusion-model file")
        self._ensure_valid_choice(clip_name, self._NO_CLIP, "A CLIP file")
        self._ensure_valid_choice(vae_name, self._NO_VAE, "A VAE file")

        model_high = comfy.sd.load_diffusion_model(
            comfy_paths.get_full_path("diffusion_models", high_noise_name), model_options={})
        model_low = comfy.sd.load_diffusion_model(
            comfy_paths.get_full_path("diffusion_models", low_noise_name), model_options={})

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

        clip_vision = None
        if clip_vision_name not in (None, "", "None"):
            try:
                vision_loader = nodes.CLIPVisionLoader()
                vision_tuple = vision_loader.load_clip(clip_name=clip_vision_name)
                clip_vision = vision_tuple[0] if isinstance(vision_tuple, (list, tuple)) else vision_tuple
            except Exception as e:
                print(f"AUNInputsWan22Basic: CLIP Vision load failed for '{clip_vision_name}': {e}")

        weights_high = self._load_lora_weights(lora_high_name, "high-noise")
        if weights_high is not None and float(lora_high_strength) != 0.0:
            model_high, clip = comfy.sd.load_lora_for_models(
                model_high, clip, weights_high, float(lora_high_strength), 0.0)

        weights_low = None
        if lora_low_name == lora_high_name and weights_high is not None:
            weights_low = weights_high
        else:
            weights_low = self._load_lora_weights(lora_low_name, "low-noise")
        if weights_low is not None and float(lora_low_strength) != 0.0:
            model_low, clip = comfy.sd.load_lora_for_models(
                model_low, clip, weights_low, float(lora_low_strength), 0.0)

        model_high = self._mark_model(model_high)
        model_low = self._mark_model(model_low)

        fps = float(fps)
        frame_rate = int(round(fps))
        length = int(length)

        return (
            model_high,
            model_low,
            clip,
            vae,
            clip_vision,
            os.path.splitext(os.path.basename(high_noise_name))[0],
            os.path.splitext(os.path.basename(low_noise_name))[0],
            sampler,
            scheduler,
            float(cfg_high),
            float(cfg_low),
            float(boundary),
            float(sigma_shift),
            int(steps),
            int(seed),
            fps,
            frame_rate,
            length,
        )

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")


NODE_CLASS_MAPPINGS = {
    "AUNInputsWan22Basic": AUNInputsWan22Basic,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNInputsWan22Basic": "AUN Inputs Wan2.2 Basic",
}
