import torch

import comfy.sample
import comfy.samplers
import comfy.utils
import comfy.model_sampling

import latent_preview


def _aun_set_shift(model, sigma_shift):
    # Same behaviour as WanMoeKSampler.set_shift: patch model_sampling
    # with the given shift (same value applied to both experts).
    # Clone first so workflow models are not mutated in place.
    try:
        model = model.clone()
    except Exception:
        pass
    model_sampling = model.get_model_object("model_sampling")
    if not model_sampling:
        sampling_base = comfy.model_sampling.ModelSamplingDiscreteFlow
        sampling_type = comfy.model_sampling.CONST

        class ModelSamplingAdvanced(sampling_base, sampling_type):
            pass

        model_sampling = ModelSamplingAdvanced(model.model.model_config)
    model_sampling.set_parameters(shift=sigma_shift, multiplier=1000)
    model.add_object_patch("model_sampling", model_sampling)
    return model


def _aun_wan_moe_sample(model_high_noise, model_low_noise, seed, steps, cfgs,
                        sampler_name, scheduler, positive, negative, latent,
                        boundary=0.875, denoise=1.0):
    # Exact port of ComfyUI-WanMoeKSampler.wan_ksampler (nodes.py):
    # single shared noise, sigma/timestep boundary switch, staged
    # start_step/last_step windows with leftover-noise handoff between experts.
    latent_image = latent["samples"]

    batch_inds = latent.get("batch_index", None)
    noise = comfy.sample.prepare_noise(latent_image, seed, batch_inds)
    noise_mask = latent.get("noise_mask", None)

    disable_pbar = not comfy.utils.PROGRESS_BAR_ENABLED
    start_step = 0
    last_step = 9999

    # Sigmas come from the high-noise expert (matches reference).
    sampling = model_high_noise.get_model_object("model_sampling")
    sigmas = comfy.samplers.calculate_sigmas(sampling, scheduler, steps)
    # Reference comment: why are timesteps 0-1000?
    timesteps = [sampling.timestep(sigma) / 1000 for sigma in sigmas.tolist()]
    switching_step = steps
    for (i, t) in enumerate(timesteps[1:]):
        if t < boundary:
            switching_step = i
            break
    print(f"switching model at step {switching_step}")
    start_with_high = start_step < switching_step
    end_with_low = last_step >= switching_step

    if start_with_high:
        print("Running high noise model...")
        callback = latent_preview.prepare_callback(model_high_noise, steps)
        end_step = min(last_step, switching_step)
        latent_image = comfy.sample.fix_empty_latent_channels(model_high_noise, latent_image)
        latent_image = comfy.sample.sample(
            model_high_noise, noise, steps, cfgs[0], sampler_name, scheduler,
            positive, negative, latent_image, denoise=denoise,
            disable_noise=end_with_low, start_step=start_step, last_step=end_step,
            force_full_denoise=end_with_low, noise_mask=noise_mask,
            callback=callback, disable_pbar=disable_pbar, seed=seed)

    if end_with_low:
        print("Running low noise model...")
        callback = latent_preview.prepare_callback(model_low_noise, steps)
        begin_step = max(start_step, switching_step)
        latent_image = comfy.sample.fix_empty_latent_channels(model_low_noise, latent_image)
        latent_image = comfy.sample.sample(
            model_low_noise, noise, steps, cfgs[1], sampler_name, scheduler,
            positive, negative, latent_image, denoise=denoise,
            disable_noise=False, start_step=begin_step, last_step=last_step,
            force_full_denoise=False, noise_mask=noise_mask,
            callback=callback, disable_pbar=disable_pbar, seed=seed)

    return latent_image


class AUNWan22MoE:
    upscale_methods = ["bicubic", "bilinear", "nearest-exact", "area", "bislerp"]

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model_high_noise": ("MODEL", {"tooltip": "High-noise expert (first stage) for Wan2.2 MoE sampling."}),
                "model_low_noise": ("MODEL", {"tooltip": "Low-noise expert (second stage) for Wan2.2 MoE sampling."}),
                "boundary": ("FLOAT", {"default": 0.875, "min": 0.0, "max": 1.0, "step": 0.001, "round": 0.001, "tooltip": "Boundary (t_moe): timestep at which experts switch. Recommended: 0.875 for t2v, 0.9 for i2v."}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "control_after_generate": True, "tooltip": "Random seed shared by both experts (single noise trajectory)."}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000, "tooltip": "Total steps for the single MoE schedule."}),
                "cfg_high_noise": ("FLOAT", {"default": 4.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01, "tooltip": "CFG for the high-noise expert."}),
                "cfg_low_noise": ("FLOAT", {"default": 3.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01, "tooltip": "CFG for the low-noise expert."}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS, {"tooltip": "Sampler algorithm shared by both experts."}),
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS, {"tooltip": "Scheduler shared by both experts."}),
                "sigma_shift": ("FLOAT", {"default": 8.0, "min": -1.0, "max": 100.0, "step": 0.01, "tooltip": "Shift applied to both experts (same purpose as ModelSamplingSD3 shift). Use -1 to bypass and leave models unpatched."}),
                "positive": ("CONDITIONING", {"tooltip": "Positive conditioning."}),
                "negative": ("CONDITIONING", {"tooltip": "Negative conditioning."}),
                "latent_image": ("LATENT", {"tooltip": "Input latent to denoise."}),
                "denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01, "tooltip": "Denoise amount. Lower values preserve input structure (img2img / i2v)."}),
                "vae": ("VAE", {"tooltip": "VAE used to decode the final latent for the IMAGE preview output."}),
                "latent_upscale": ("BOOLEAN", {"default": False, "label_on": "Yes", "label_off": "No", "tooltip": "Optional latent upscale pass after MoE sampling, resampled with the low-noise expert."}),
                "ratio": ("FLOAT", {"default": 1.5, "min": 1.0, "max": 4.0, "step": 0.05, "tooltip": "Latent upscale ratio for the optional pass."}),
                "upscale_method": (s.upscale_methods, {"tooltip": "Latent upscale algorithm."}),
                "upscaling_denoise": ("FLOAT", {"default": 0.5, "min": 0.01, "max": 1.0, "step": 0.01, "tooltip": "Denoise strength for the optional upscale resample pass."}),
            }
        }

    RETURN_TYPES = ("LATENT", "IMAGE")
    RETURN_NAMES = ("LATENT", "IMAGE")
    OUTPUT_TOOLTIPS = ("Denoised latent (upscaled if enabled).", "Decoded preview image.")
    FUNCTION = "sample"
    CATEGORY = "AUN Nodes/KSampler"
    DESCRIPTION = (
        "Wan2.2 MoE sampler (high/low-noise experts switched at a timestep boundary) "
        "with an optional simple latent-upscale tail resampled by the low-noise expert. "
        "With latent upscale off, output matches the Wan MoE KSampler trajectory. "
        "Recommended boundary: 0.875 for t2v, 0.9 for i2v."
        "\n\nRight-click → \"Collapse Connections\" or double-click to hide slot labels and converge connection lines."
    )

    def _fix_latent_channels(self, model, latent):
        target = getattr(model, "_aun_latent_channels", None)
        if target is None:
            target = getattr(model, "latent_channels", None)
        if target is None:
            inner = getattr(model, "model", None)
            target = getattr(inner, "latent_channels", None)
        try:
            current = latent.shape[1]
        except Exception:
            return latent
        if target is None or current == target:
            return latent
        try:
            return comfy.sample.fix_empty_latent_channels(model, latent)
        except Exception:
            return latent

    def _process_latent_in(self, model, latent):
        processor = getattr(model, "process_latent_in", None)
        if callable(processor):
            return processor(latent)
        inner = getattr(model, "model", None)
        processor = getattr(inner, "process_latent_in", None)
        if callable(processor):
            return processor(latent)
        return latent

    def _process_latent_out(self, model, latent):
        processor = getattr(model, "process_latent_out", None)
        if callable(processor):
            return processor(latent)
        inner = getattr(model, "model", None)
        processor = getattr(inner, "process_latent_out", None)
        if callable(processor):
            return processor(latent)
        return latent

    def _decode_latent(self, vae, latent):
        image = vae.decode(latent)
        if len(image.shape) == 5:
            image = image.reshape(-1, image.shape[-3], image.shape[-2], image.shape[-1])
        return image

    def sample(self, model_high_noise, model_low_noise, boundary, seed, steps,
               cfg_high_noise, cfg_low_noise, sampler_name, scheduler, sigma_shift,
               positive, negative, latent_image, denoise, vae,
               latent_upscale=False, ratio=1.5, upscale_method="bicubic",
               upscaling_denoise=0.5):
        if sigma_shift is not None and float(sigma_shift) >= 0.0:
            model_high_noise = _aun_set_shift(model_high_noise, sigma_shift)
            model_low_noise = _aun_set_shift(model_low_noise, sigma_shift)

        latent = latent_image or {}
        base = latent.get("samples") if isinstance(latent, dict) else latent
        base = self._fix_latent_channels(model_high_noise, base)
        requires_processing = bool(getattr(model_high_noise, "_aun_requires_latent_processing", False))

        def to_internal(data):
            return self._process_latent_in(model_high_noise, data) if requires_processing else data

        def to_external(data):
            return self._process_latent_out(model_high_noise, data) if requires_processing else data

        base_internal = to_internal(base)
        moe_latent = {"samples": base_internal}
        if isinstance(latent, dict):
            if "batch_index" in latent:
                moe_latent["batch_index"] = latent["batch_index"]
            if "noise_mask" in latent:
                moe_latent["noise_mask"] = latent["noise_mask"]

        samples_internal = _aun_wan_moe_sample(
            model_high_noise, model_low_noise, seed, steps,
            (cfg_high_noise, cfg_low_noise), sampler_name, scheduler,
            positive, negative, moe_latent, boundary=boundary, denoise=denoise)

        if latent_upscale:
            width = max(1, round(samples_internal.shape[-1] * float(ratio)))
            height = max(1, round(samples_internal.shape[-2] * float(ratio)))
            upscaled = comfy.utils.common_upscale(
                samples_internal, width, height, upscale_method, "disabled")
            frac = float(max(min(upscaling_denoise, 1.0), 0.01))
            steps2 = max(int(round(frac * int(steps))), 1)
            upscaled = self._fix_latent_channels(model_low_noise, upscaled)
            noise2 = comfy.sample.prepare_noise(upscaled, seed)
            callback2 = latent_preview.prepare_callback(model_low_noise, steps2)
            disable_pbar = not comfy.utils.PROGRESS_BAR_ENABLED
            samples_internal = comfy.sample.sample(
                model_low_noise, noise2, steps2, cfg_low_noise, sampler_name,
                scheduler, positive, negative, upscaled, denoise=frac,
                disable_noise=False, start_step=None, last_step=None,
                force_full_denoise=False, noise_mask=None,
                callback=callback2, disable_pbar=disable_pbar, seed=seed)

        samples_external = to_external(samples_internal)
        out_latent = dict(latent) if isinstance(latent, dict) else {}
        out_latent["samples"] = samples_external
        image = self._decode_latent(vae, samples_external)
        return (out_latent, image)


NODE_CLASS_MAPPINGS = {"AUNWan22MoE": AUNWan22MoE}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNWan22MoE": "AUN Wan2.2 MoE"}
