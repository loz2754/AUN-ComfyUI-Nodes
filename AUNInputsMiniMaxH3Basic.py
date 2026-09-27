import os

import comfy.samplers
import comfy.sd
import comfy.utils
import folder_paths as comfy_paths
import nodes

from .AUNResolutionHelper import ASPECT_RATIO_NAMES, ASPECT_MODE_OPTIONS, MEGAPIXELS_WIDGET, resolve_dimensions, apply_aspect_mode


class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False


scheduler = AnyType("*")
sampler = AnyType("*")


class AUNInputsMiniMaxH3Basic:
    DESCRIPTION = "MiniMax-H3 video loader node that consolidates the MiniMaxH3-OBVPM loading structure: UNET (diffusion model) with weight dtype, minimax CLIP, separate video and audio VAEs, optional turbo LoRA, plus sampler settings (sampler, scheduler, cfg, steps, seed) and resolution with seconds-to-frame-length conversion that plugs straight into MiniMaxH3ReferenceToVideo and KSampler.\n\nFrame length follows the reference workflow: max(5, round(seconds * fps)) aligned up so length % 17 == 5.\n\nOptional RIFE support: when 'rife' is on, the 'fps' and 'frame_rate' outputs switch to the post-interpolation rate (fps * multiplier) for direct wiring into VHS Video Combine, while 'frames' always stays the base sampling count for MiniMaxH3ReferenceToVideo. The 'rife multiplier' output mirrors the active multiplier — convert the AUNRIFE 'multiplier' widget to an input and connect it so the value lives in one place. The 'rife' output mirrors the toggle itself — wire it to an AUN Node Controller slot switch to bypass/unbypass the RIFE node automatically.\n\nThe optional *_input sockets override the matching widget values when connected.\n\nRight-click → \"Collapse Connections\" or double-click to hide output labels and converge connection lines."

    _NO_UNET = "<no diffusion models found>"
    _NO_CLIP = "<no clip files found>"
    _NO_VAE = "<no vae files found>"
    _CLIP_TYPE_LOOKUP = {}

    _KNOWN_UNET = ("minimax_h3_ref2va_pruned_int8_convrot.safetensors",)
    _KNOWN_CLIP = ("qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",)
    _KNOWN_VIDEO_VAE = ("minimax_h3_video_vae_fp16.safetensors",)
    _KNOWN_AUDIO_VAE = ("minimax_h3_audio_vae_fp32.safetensors",)
    _KNOWN_TURBO_LORA = ("minimax_h3_turbo_v4_step600_ema.safetensors",)

    def __init__(self):
        pass

    @staticmethod
    def _clean_override(value):
        if value is None:
            return ""
        s = str(value).strip()
        return "" if s.lower() in ("", "none", "null") else s

    @staticmethod
    def _resolve_name(override, current, candidates, label):
        override = AUNInputsMiniMaxH3Basic._clean_override(override)
        if not override:
            return current
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
        print(f"AUNInputsMiniMaxH3Basic: {label} override '{override}' not found among {len(candidates)} installed files; falling back to widget value '{current}'.")
        return current

    @staticmethod
    def _choices_or_placeholder(entries, placeholder):
        return entries if entries else [placeholder]

    @staticmethod
    def _combined_lists(*folder_keys):
        seen = []
        for folder_key in folder_keys:
            try:
                files = comfy_paths.get_filename_list(folder_key)
            except Exception:
                continue
            for entry in files or []:
                if entry not in seen:
                    seen.append(entry)
        return seen

    @staticmethod
    def _prefer(candidates, known_basenames):
        for known in known_basenames:
            lowered = known.lower()
            for candidate in candidates:
                if os.path.basename(candidate).lower() == lowered:
                    return candidate
        return candidates[0] if candidates else ""

    @staticmethod
    def _default_in(choices, preferred):
        if preferred in choices:
            return preferred
        return choices[0] if choices else preferred

    @classmethod
    def _clip_type_field(cls, preferred="Minimax"):
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
        default = preferred if preferred in normalized_choices else (normalized_choices[0] if normalized_choices else "stable_diffusion")
        return normalized_choices, default

    @staticmethod
    def _weight_dtype_choices():
        try:
            req = nodes.UNETLoader.INPUT_TYPES()["required"]["weight_dtype"][0]
            choices = list(req)
            if choices:
                return choices
        except Exception:
            pass
        return ["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"]

    @staticmethod
    def _seconds_to_length(seconds, fps):
        try:
            fps_value = float(fps)
        except Exception:
            fps_value = 24.0
        if fps_value <= 0:
            fps_value = 24.0
        try:
            seconds_value = float(seconds)
        except Exception:
            seconds_value = 5.0
        if seconds_value <= 0:
            seconds_value = 5.0
        n = max(5, round(seconds_value * fps_value))
        return n + (5 - (n % 17)) % 17

    @classmethod
    def INPUT_TYPES(cls):
        unet_files = cls._choices_or_placeholder(
            cls._combined_lists("diffusion_models", "unet"), cls._NO_UNET
        )
        clip_files = cls._choices_or_placeholder(
            cls._combined_lists("text_encoders", "clip"), cls._NO_CLIP
        )
        vae_files = cls._choices_or_placeholder(
            comfy_paths.get_filename_list("vae"), cls._NO_VAE
        )
        lora_choices = comfy_paths.get_filename_list("loras") + ["None"]
        clip_type_choices, clip_type_default = cls._clip_type_field()
        weight_dtype_choices = cls._weight_dtype_choices()
        sampler_choices = comfy.samplers.KSampler.SAMPLERS
        scheduler_choices = comfy.samplers.KSampler.SCHEDULERS

        return {
            "optional": {
                "unet_input": ("STRING", {"forceInput": True, "tooltip": "UNET (diffusion model) filename override. When connected, replaces 'unet_name'."}),
                "clip_input": ("STRING", {"forceInput": True, "tooltip": "CLIP filename override. When connected, replaces 'clip_name'."}),
                "video_vae_input": ("STRING", {"forceInput": True, "tooltip": "Video VAE filename override. When connected, replaces 'video_vae_name'."}),
                "audio_vae_input": ("STRING", {"forceInput": True, "tooltip": "Audio VAE filename override. When connected, replaces 'audio_vae_name'."}),
                "turbo_lora_input": ("STRING", {"forceInput": True, "tooltip": "Turbo LoRA filename override. When connected, replaces 'turbo_lora_name'."}),
                "sampler_input": ("STRING", {"forceInput": True, "tooltip": "Sampler name override. When connected and non-empty, replaces the 'sampler' widget value."}),
                "scheduler_input": ("STRING", {"forceInput": True, "tooltip": "Scheduler name override. When connected and non-empty, replaces the 'scheduler' widget value."}),
                "cfg_input": ("FLOAT", {"forceInput": True, "tooltip": "CFG override. When connected, replaces the 'cfg' widget value."}),
                "steps_input": ("INT", {"forceInput": True, "tooltip": "Steps override. When connected, replaces the 'steps' widget value."}),
                "seed_input": ("INT", {"forceInput": True, "tooltip": "Seed override. When connected, replaces the 'seed' widget value."}),
                "seconds_input": ("FLOAT", {"forceInput": True, "tooltip": "Duration override in seconds. When connected, replaces the 'seconds' widget value before frame-length conversion."}),
                "length_input": ("INT", {"forceInput": True, "tooltip": "Frame-length override. When connected, replaces the seconds-derived frame count."}),
                "fps_input": ("FLOAT", {"forceInput": True, "tooltip": "FPS override. When connected, replaces the 'fps' widget value."}),
                "rife_multiplier_input": ("INT", {"forceInput": True, "tooltip": "RIFE multiplier override. When connected, replaces the 'rife_multiplier' widget value. Only applies when 'rife' is on."}),
            },
            "required": {
                "unet_name": (
                    unet_files,
                    {"default": cls._prefer(unet_files, cls._KNOWN_UNET), "tooltip": "MiniMax-H3 UNET (diffusion model) file."},
                ),
                "weight_dtype": (
                    weight_dtype_choices,
                    {"default": "default" if "default" in weight_dtype_choices else weight_dtype_choices[0], "tooltip": "Weight dtype used when loading the UNET."},
                ),
                "clip_name": (
                    clip_files,
                    {"default": cls._prefer(clip_files, cls._KNOWN_CLIP), "tooltip": "MiniMax-H3 text encoder file (qwen3vl minimax CLIP)."},
                ),
                "clip_type": (
                    clip_type_choices,
                    {"default": clip_type_default, "tooltip": "CLIP architecture. MiniMax-H3 requires the minimax type."},
                ),
                "video_vae_name": (
                    vae_files,
                    {"default": cls._prefer(vae_files, cls._KNOWN_VIDEO_VAE), "tooltip": "Video VAE for MiniMax-H3 latents. Also feeds the video VAEDecode node."},
                ),
                "audio_vae_name": (
                    vae_files,
                    {"default": cls._prefer(vae_files, cls._KNOWN_AUDIO_VAE), "tooltip": "Audio VAE for MiniMax-H3 latents. Also feeds the audio VAEDecode node."},
                ),
                "turbo": (
                    "BOOLEAN",
                    {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Apply the turbo LoRA to the UNET (replaces the Switch Turbo true/false wiring)."},
                ),
                "turbo_lora_name": (
                    lora_choices,
                    {"default": cls._prefer(lora_choices, cls._KNOWN_TURBO_LORA), "tooltip": "Turbo LoRA file. 'None' disables even when turbo is on."},
                ),
                "turbo_lora_strength": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 4.0, "step": 0.01, "round": 0.01, "tooltip": "Strength applied to the turbo LoRA weights."},
                ),
                "sampler": (
                    sampler_choices,
                    {"default": cls._default_in(list(sampler_choices), "euler"), "tooltip": "Sampling algorithm for KSampler."},
                ),
                "scheduler": (
                    scheduler_choices,
                    {"default": cls._default_in(list(scheduler_choices), "beta"), "tooltip": "Noise schedule for KSampler (turbo preset uses beta)."},
                ),
                "cfg": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01, "tooltip": "Classifier-Free Guidance scale. MiniMax-H3 reference uses 1.0."},
                ),
                "steps": (
                    "INT",
                    {"default": 8, "min": 1, "max": 10000, "tooltip": "Sampling steps (turbo preset uses 8)."},
                ),
                "seed": (
                    "INT",
                    {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF, "tooltip": "Random seed shared by conditioning and sampling."},
                ),
                "width": (
                    "INT",
                    {"default": 1344, "min": 64, "max": 8192, "tooltip": "Video width. Used when 'aspect_ratio' is 'custom'."},
                ),
                "height": (
                    "INT",
                    {"default": 768, "min": 64, "max": 8192, "tooltip": "Video height. Used when 'aspect_ratio' is 'custom'."},
                ),
                "aspect_ratio": (ASPECT_RATIO_NAMES, {"tooltip": "Select a predefined aspect ratio or preset to automatically set width and height."}),
                "aspect_mode": (ASPECT_MODE_OPTIONS, {"default": "Original", "tooltip": "Random swaps dimensions 50% of the time, Swap forces a swap, Original keeps the original order."}),
                "megapixels": MEGAPIXELS_WIDGET,
                "multiple": ("INT", {"default": 32, "min": 8, "max": 128, "step": 8, "tooltip": "Nearest multiple to round computed resolution to. Video VAEs prefer 32."}),
                "seconds": (
                    "FLOAT",
                    {"default": 5.0, "min": 1.0, "max": 30.0, "step": 0.5, "round": 0.01, "tooltip": "Clip duration in seconds. Converted to frame count via max(5, round(seconds * fps)) aligned to length % 17 == 5."},
                ),
                "fps": (
                    "FLOAT",
                    {"default": 24.0, "min": 1.0, "max": 120.0, "step": 0.5, "tooltip": "Frames per second. FLOAT output wires into VHS Video Combine."},
                ),
                "rife": (
                    "BOOLEAN",
                    {"default": False, "label_on": "On", "label_off": "Off", "tooltip": "Switch the 'fps' and 'frame_rate' outputs to the post-interpolation rate (fps * multiplier) for VHS Video Combine. 'frames' always stays the base sampling count."},
                ),
                "rife_multiplier": (
                    "INT",
                    {"default": 2, "min": 2, "max": 10, "step": 1, "tooltip": "RIFE interpolation multiplier. Must match the 'multiplier' on the downstream AUNRIFE node."},
                ),
            },
        }

    RETURN_TYPES = (
        "MODEL",
        "CLIP",
        "VAE",
        "VAE",
        "STRING",
        sampler,
        scheduler,
        "FLOAT",
        "INT",
        "INT",
        "INT",
        "INT",
        "INT",
        "FLOAT",
        "INT",
        "FLOAT",
        "INT",
        "BOOLEAN",
    )

    RETURN_NAMES = (
        "MODEL",
        "CLIP",
        "VAE video",
        "VAE audio",
        "unet name",
        "sampler",
        "scheduler",
        "cfg",
        "steps",
        "seed",
        "width",
        "height",
        "frames",
        "fps",
        "frame_rate",
        "seconds",
        "rife multiplier",
        "rife",
    )

    FUNCTION = "inputs"
    CATEGORY = "AUN Nodes/Loaders+Inputs"

    def _ensure_valid_choice(self, choice, placeholder, label):
        if choice == placeholder:
            raise RuntimeError(f"{label} is required for AUNInputsMiniMaxH3Basic.")

    def _load_lora_weights(self, lora_name):
        if lora_name in (None, "", "None"):
            return None
        lora_path = comfy_paths.get_full_path("loras", lora_name)
        if not lora_path:
            print(f"AUNInputsMiniMaxH3Basic: turbo LoRA '{lora_name}' not found; skipping.")
            return None
        return comfy.utils.load_torch_file(lora_path, safe_load=True)

    def inputs(
        self,
        unet_name,
        weight_dtype,
        clip_name,
        clip_type,
        video_vae_name,
        audio_vae_name,
        turbo,
        turbo_lora_name,
        turbo_lora_strength,
        sampler,
        scheduler,
        cfg,
        steps,
        seed,
        width,
        height,
        aspect_ratio,
        aspect_mode,
        megapixels,
        multiple,
        seconds,
        fps,
        rife,
        rife_multiplier,
        unet_input="",
        clip_input="",
        video_vae_input="",
        audio_vae_input="",
        turbo_lora_input="",
        sampler_input="",
        scheduler_input="",
        cfg_input=None,
        steps_input=None,
        seed_input=None,
        seconds_input=None,
        length_input=None,
        fps_input=None,
        rife_multiplier_input=None,
    ):
        unet_candidates = self._combined_lists("diffusion_models", "unet")
        clip_candidates = self._combined_lists("text_encoders", "clip")
        vae_candidates = comfy_paths.get_filename_list("vae")

        unet_name = self._resolve_name(unet_input, unet_name, unet_candidates, "UNET")
        clip_name = self._resolve_name(clip_input, clip_name, clip_candidates, "CLIP")
        video_vae_name = self._resolve_name(video_vae_input, video_vae_name, vae_candidates, "video VAE")
        audio_vae_name = self._resolve_name(audio_vae_input, audio_vae_name, vae_candidates, "audio VAE")
        lora_candidates = comfy_paths.get_filename_list("loras")
        if self._clean_override(turbo_lora_input):
            turbo_lora_name = self._resolve_name(turbo_lora_input, turbo_lora_name, lora_candidates, "turbo LoRA")

        sampler_input = self._clean_override(sampler_input)
        scheduler_input = self._clean_override(scheduler_input)
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
        if seconds_input is not None:
            seconds = seconds_input
        if fps_input is not None:
            fps = fps_input
        if rife_multiplier_input is not None:
            rife_multiplier = rife_multiplier_input

        self._ensure_valid_choice(unet_name, self._NO_UNET, "A UNET (diffusion-model) file")
        self._ensure_valid_choice(clip_name, self._NO_CLIP, "A CLIP file")
        self._ensure_valid_choice(video_vae_name, self._NO_VAE, "A video VAE file")
        self._ensure_valid_choice(audio_vae_name, self._NO_VAE, "An audio VAE file")

        unet_loader = nodes.UNETLoader()
        try:
            model_tuple = unet_loader.load_unet(unet_name=unet_name, weight_dtype=weight_dtype)
        except TypeError:
            model_tuple = unet_loader.load_unet(unet_name=unet_name)
        model = model_tuple[0] if isinstance(model_tuple, (list, tuple)) else model_tuple

        resolved_clip_type = self._CLIP_TYPE_LOOKUP.get(clip_type, clip_type)
        if isinstance(resolved_clip_type, (list, tuple)):
            resolved_clip_type = resolved_clip_type[0] if resolved_clip_type else "minimax"
        resolved_clip_type = str(resolved_clip_type)

        clip_loader = nodes.CLIPLoader()
        try:
            clip_tuple = clip_loader.load_clip(clip_name=clip_name, type=resolved_clip_type, device="default")
        except TypeError:
            try:
                clip_tuple = clip_loader.load_clip(clip_name=clip_name, type=resolved_clip_type)
            except TypeError:
                clip_tuple = clip_loader.load_clip(clip_name)
        clip = clip_tuple[0] if isinstance(clip_tuple, (list, tuple)) else clip_tuple

        vae_loader = nodes.VAELoader()
        video_vae_tuple = vae_loader.load_vae(vae_name=video_vae_name)
        video_vae = video_vae_tuple[0] if isinstance(video_vae_tuple, (list, tuple)) else video_vae_tuple
        audio_vae_tuple = vae_loader.load_vae(vae_name=audio_vae_name)
        audio_vae = audio_vae_tuple[0] if isinstance(audio_vae_tuple, (list, tuple)) else audio_vae_tuple

        if turbo and turbo_lora_name not in (None, "", "None"):
            weights = self._load_lora_weights(turbo_lora_name)
            if weights is not None and float(turbo_lora_strength) != 0.0:
                model, clip = comfy.sd.load_lora_for_models(
                    model, clip, weights, float(turbo_lora_strength), 0.0)

        width, height = resolve_dimensions(width, height, aspect_ratio, megapixels, multiple)
        width, height = apply_aspect_mode(width, height, aspect_mode)

        fps = float(fps)
        frame_rate = int(round(fps))
        seconds = float(seconds)
        if length_input is not None:
            length = int(length_input)
        else:
            length = int(self._seconds_to_length(seconds, fps))

        try:
            rife_m = max(2, int(rife_multiplier))
        except Exception:
            rife_m = 2
        if rife:
            fps = fps * rife_m
            frame_rate = int(round(fps))

        return (
            model,
            clip,
            video_vae,
            audio_vae,
            os.path.splitext(os.path.basename(unet_name))[0],
            sampler,
            scheduler,
            float(cfg),
            int(steps),
            int(seed),
            int(width),
            int(height),
            length,
            fps,
            frame_rate,
            seconds,
            int(rife_m),
            bool(rife),
        )

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")


NODE_CLASS_MAPPINGS = {
    "AUNInputsMiniMaxH3Basic": AUNInputsMiniMaxH3Basic,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNInputsMiniMaxH3Basic": "AUN Inputs MiniMaxH3 Basic",
}
