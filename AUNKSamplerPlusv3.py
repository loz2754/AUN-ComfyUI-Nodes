import torch
import time
from PIL import Image
import comfy.samplers
import comfy.sample
import comfy.utils
import numpy as np
from comfy.sd import VAE
import folder_paths as comfy_paths
import latent_preview

SCHEDULERS = comfy.samplers.KSampler.SCHEDULERS + ["AYS SD1", "AYS SDXL", "AYS SVD"]

class AUNKSamplerPlusv3:
    upscale_methods = ["nearest-exact", "bilinear", "area", "bicubic", "bislerp", "lanczos"]

    @classmethod
    def INPUT_TYPES(s):
        filtered_methods = [m for m in s.upscale_methods if m != "lanczos"]
        available_upscale_models = comfy_paths.get_filename_list("upscale_models")
        available_upscale_models.insert(0, "None")
        return {
            "required": {
                "vae": ("VAE", {
                    "tooltip": "VAE model for encoding/decoding between pixel and latent space."
                }),
                "model": ("MODEL", {
                    "tooltip": "The diffusion model to use for progressive sampling."
                }),
                "seed": ("INT", {
                    "default": 0, "min": 0, "max": 0xffffffffffffffff, "forceInput": True,
                    "tooltip": "Random seed for reproducible results. Use same seed for identical outputs."
                }),
                "steps_total": ("INT", {
                    "default": 30, "min": 2, "max": 300,
                    "tooltip": "Total sampling steps across both passes. Split between first and second pass."
                }),
                "steps_first": ("INT", {
                    "default": 12, "min": 1, "max": 300,
                    "tooltip": "Steps for first pass (base generation). If latent upscale is off, this is used for the single pass."
                }),
                "start_step_second": ("INT", {
                    "default": 0, "min": -1, "max": 300,
                    "tooltip": "Second pass control: -1 uses denoise-fraction (see 'upscaling denoise'), 0 starts at step 0, steps_first continues after pass 1. Both-upscaled mirrors this schedule to reduce drift."
                }),
                "cfg": ("FLOAT", {
                    "default": 8.0, "min": 0.0, "max": 100.0, "step":0.1, "round": 0.01,
                    "tooltip": "CFG scale for first pass. Controls prompt adherence in base generation."
                }),
                "cfg_latent_upscale": ("FLOAT", {
                    "default": 8.0, "min": 0.0, "max": 100.0, "step":0.1, "round": 0.01,
                    "tooltip": "CFG scale for latent upscale pass. Can be different from base CFG."
                }),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS, {
                    "tooltip": "Sampling algorithm for both passes. DPM++ 2M Karras recommended for progressive sampling."
                }),
                "scheduler": (SCHEDULERS, {
                    "tooltip": "Noise schedule. AYS schedulers work well with progressive sampling."
                }),
                "positive": ("CONDITIONING", {
                    "tooltip": "Positive prompt conditioning (what you want in the image)."
                }),
                "negative": ("CONDITIONING", {
                    "tooltip": "Negative prompt conditioning (what you want to avoid)."
                }),
                "latent_image": ("LATENT", {
                    "tooltip": "Input latent image. For txt2img, use Empty Latent Image."
                }),
                "denoise": ("FLOAT", {
                    "default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Denoising strength for first pass. 1.0 = full generation, lower for img2img."
                }),
                "latent_upscale": ("BOOLEAN", {
                    "default": True, "label_on": "Yes", "label_off": "No",
                    "tooltip": "Enable latent space upscaling between passes. Core feature of progressive sampling. Disabling this will perform a single pass of sampling."
                }),
                "upscaling_denoise": ("FLOAT", {
                    "default": 0.61, "min": 0.01, "max": 1.0, "step": 0.01,
                    "tooltip": "Second pass denoise amount.\nNotes:\n• Used only when start_step_second = -1 (denoise-fraction mode).\n• Typical refinement: 0.5–0.7.\n• Ignored when continuing from a start step."
                }),                
                "upscale_method": (filtered_methods, {
                    "tooltip": "Algorithm for latent upscaling. Bicubic recommended for progressive workflows."
                }),
                "ratio": ("FLOAT", {
                    "default": 1.5, "min":0.01, "max":8.0, "step": 0.05,
                    "tooltip": "Latent upscale ratio between passes. 1.5-2.0 typical for progressive generation."
                }),
                "image_upscale": ("BOOLEAN", {
                    "default": False, "label_on": "Yes", "label_off": "No",
                    "tooltip": "Enable pixel-space image upscaling. Used to construct 'Both upscaled' and as source for 'Refined image'."
                }),
                "image_upscale_method": (s.upscale_methods, {
                    "tooltip": "Algorithm for final image upscaling. Lanczos for photos, nearest for pixel art."
                }),
                "image_upscale_model": (available_upscale_models, {
                    "tooltip": "AI upscaling model for final enhancement. 'None' disables AI upscaling."
                }),
                "image_upscale_ratio": ("FLOAT", {
                    "default": 1.5, "min":0.01, "max":8.0, "step": 0.05,
                    "tooltip": "Final image upscale ratio. Can be different from latent upscale ratio."
                }),
                "image_upscale_refine": ("BOOLEAN", {
                    "default": False, "label_on": "Yes", "label_off": "No",
                    "tooltip": "Output 'Refined image' by re-encoding and sampling the selected source (Both/Image/Base) with the settings below."
                }),
                "img_refine_steps": ("INT", {
                    "default": 4, "min": 1, "max": 100,
                    "tooltip": "Sampling steps for the final 'Refined image' pass."
                }),
                "img_refine_denoise": ("FLOAT", {
                    "default": 0.25, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Denoising strength for the final 'Refined image' pass."
                }),
                "verbose": ("BOOLEAN", {
                    "default": False, "label_on": "Yes", "label_off": "No",
                    "tooltip": "Print detailed pass logs and timings to the console."
                })
            },
            "hidden": {"prompt": "PROMPT"}
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "LATENT", "STRING")
    RETURN_NAMES = ("Base image", "Image upscaled", "Latent upscaled", "Both upscaled", "Refined image", "LATENT", "Upscaled type")
    FUNCTION = "qmSample"
    OUTPUT_NODE = True
    CATEGORY = "AUN Nodes/KSampler"
    DESCRIPTION = (
        "Progressive two-pass sampler with pixel-space upscale and optional final refinement. "
        "Flow: Base (first pass) → Latent upscaled (second pass) → Both upscaled (pixel-upscale decoded latent, then resample mirroring second pass) → Refined image (optional). "
        "Upscaled type returns one of: 'Both upscaled', 'Latent upscaled', 'Image upscaled', or 'No upscale'. If refine is enabled, ' Refined' is appended."
    )

    def pil_upscale(self, img, ratio, method, model_name="None"):
        """
        Image-space upscaling with an optional AI upscaler model.
        - If an AI model is provided and works, it will be used to super-resolve first,
          then optionally resized to exactly match the requested ratio.
        - Otherwise, it falls back to high-quality PIL resizing.
        """
        # Optional AI model load
        upscaler = None
        if model_name and model_name != "None":
            try:
                from comfy_extras.chainner_models import model_loading
                model_path = comfy_paths.get_full_path("upscale_models", model_name)
                sd = comfy.utils.load_torch_file(model_path)
                upscaler = model_loading.load_state_dict(sd).eval()
                # Move to GPU if available
                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                upscaler = upscaler.to(device)
            except Exception:
                upscaler = None  # Fail safe: fall back to PIL

        # Input could be a torch tensor [B,H,W,C] or numpy array
        if hasattr(img, "detach"):
            img_np = img.detach().cpu().numpy()
        else:
            img_np = np.array(img)

        # Map methods to PIL; support both Image.Resampling (Pillow>=9.1) and legacy constants
        Resampling = getattr(Image, "Resampling", None)
        def _pick(name, default=None):
            if Resampling is not None and hasattr(Resampling, name):
                return getattr(Resampling, name)
            return getattr(Image, name, default)
        pil_method = {
            "nearest-exact": _pick("NEAREST"),
            "bilinear": _pick("BILINEAR"),
            "bicubic": _pick("BICUBIC"),
            "lanczos": _pick("LANCZOS"),
            # BOX approximates area resampling; fall back to bicubic if unavailable
            "area": getattr(Image, "BOX", _pick("BICUBIC")),
            "bislerp": _pick("BICUBIC"),  # best-effort fallback
        }.get(method, _pick("BICUBIC"))

        upscaled_images = []
        for i in range(img_np.shape[0]):
            single_img_np = (img_np[i] * 255).clip(0, 255).astype("uint8")
            pil_img = Image.fromarray(single_img_np)
            width, height = pil_img.size
            new_size = (max(1, int(round(width * ratio))), max(1, int(round(height * ratio))))

            if upscaler is not None:
                try:
                    # AI upscale (to model-native scale), then resize to requested size if needed
                    device = next(upscaler.parameters()).device
                    with torch.no_grad():
                        # HWC uint8 -> NCHW float32 [0,1]
                        t = torch.from_numpy(single_img_np).to(device=device, dtype=torch.float32) / 255.0
                        t = t.permute(2, 0, 1).unsqueeze(0).contiguous()
                        sr = upscaler(t)
                        if isinstance(sr, (list, tuple)):
                            sr = sr[0]
                        # NCHW -> HWC float32 [0,1]
                        sr = sr.squeeze(0).clamp(0, 1)
                        sr_hwc = sr.permute(1, 2, 0).detach().cpu().numpy()
                        sr_img = Image.fromarray((sr_hwc * 255.0).round().astype(np.uint8))
                        if sr_img.size != new_size:
                            sr_img = sr_img.resize(new_size, pil_method)
                        upscaled_np = np.array(sr_img).astype(np.float32) / 255.0
                except Exception:
                    # Fallback to PIL if AI inference fails for any reason
                    upscaled = pil_img.resize(new_size, pil_method)
                    upscaled_np = np.array(upscaled).astype(np.float32) / 255.0
            else:
                # Pure PIL upscale
                upscaled = pil_img.resize(new_size, pil_method)
                upscaled_np = np.array(upscaled).astype(np.float32) / 255.0

            upscaled_images.append(upscaled_np)

        upscaled_tensor = torch.from_numpy(np.stack(upscaled_images))
        return upscaled_tensor

    def _process_latent_in(self, model, latent):
        processor = getattr(model, "process_latent_in", None)
        if callable(processor):
            return processor(latent)
        model_inner = getattr(model, "model", None)
        processor = getattr(model_inner, "process_latent_in", None)
        if callable(processor):
            return processor(latent)
        return latent

    def _process_latent_out(self, model, latent):
        processor = getattr(model, "process_latent_out", None)
        if callable(processor):
            return processor(latent)
        model_inner = getattr(model, "model", None)
        processor = getattr(model_inner, "process_latent_out", None)
        if callable(processor):
            return processor(latent)
        return latent

    def _decode_latent(self, vae, latent):
        image = vae.decode(latent)
        if len(image.shape) == 5:
            image = image.reshape(-1, image.shape[-3], image.shape[-2], image.shape[-1])
        return image

    def _encode_image(self, vae, image):
        encoded = vae.encode(image)
        return encoded["samples"] if isinstance(encoded, dict) else encoded

    def _model_latent_channels(self, model):
        target = getattr(model, "_aun_latent_channels", None)
        if target is not None:
            return target
        target = getattr(model, "latent_channels", None)
        if target is None:
            inner = getattr(model, "model", None)
            target = getattr(inner, "latent_channels", None)
        return target

    def _fix_latent_channels(self, model, latent):
        if latent is None:
            return latent
        target = self._model_latent_channels(model)
        try:
            current = latent.shape[1]
        except Exception:
            current = None
        if target is None or current == target:
            return latent
        try:
            return comfy.sample.fix_empty_latent_channels(model, latent)
        except Exception:
            return latent

    def qmSample(
        self, vae, model, seed, steps_total, steps_first, start_step_second, cfg, cfg_latent_upscale, sampler_name, scheduler,
        positive, negative, latent_image, denoise, latent_upscale, image_upscale, upscale_method="bilinear", ratio=1.5,
        upscaling_denoise=0.61, image_upscale_method="lanczos", image_upscale_model="None", image_upscale_ratio=1.5, image_upscale_refine=False,
        img_refine_steps=4, img_refine_denoise=0.25, verbose=False, prompt=None
    ):
        latent = latent_image
        latent_data = latent_image or {}
        base_latent = latent_data.get("samples") if isinstance(latent_data, dict) else latent_data
        base_latent = self._fix_latent_channels(model, base_latent)
        requires_processing = bool(getattr(model, "_aun_requires_latent_processing", False))

        def to_internal(data):
            return self._process_latent_in(model, data) if requires_processing else data

        def to_external(data):
            return self._process_latent_out(model, data) if requires_processing else data

        base_latent_internal = to_internal(base_latent)
    # No extra UI labels; keep outputs unchanged

        # Decide steps for first pass
        if not latent_upscale:
            # Single-pass mode: use steps_first as requested
            first_pass_steps = steps_first
            first_pass_cfg = cfg
        else:
            # Progressive mode: first pass uses steps_first; second pass uses remaining/fraction
            first_pass_steps = steps_first
            first_pass_cfg = cfg

        # First KSampler pass
        VERBOSE = bool(verbose)
        def _log(msg):
            if VERBOSE:
                try:
                    print(f"[AUNKSamplerPlus] {msg}")
                except Exception:
                    pass
        _log(f"Pass1 START: steps={first_pass_steps}, cfg={first_pass_cfg}, denoise={denoise}, seed={seed}")
        pass1_time = 0.0
        pass2_time = 0.0
        pass3_time = 0.0
        refine_time = 0.0
        batch_inds = latent.get("batch_index", None)
        noise = comfy.sample.prepare_noise(base_latent_internal, seed, batch_inds)
        noise_mask = latent.get("noise_mask", None)
        callback = latent_preview.prepare_callback(model, first_pass_steps)
        disable_pbar = not comfy.utils.PROGRESS_BAR_ENABLED
        t1_start = time.perf_counter()
        samples_internal = comfy.sample.sample(
            model, noise, first_pass_steps, first_pass_cfg, sampler_name, scheduler, positive, negative, base_latent_internal,
            denoise=denoise, disable_noise=False, start_step=None, last_step=None,
            force_full_denoise=False, noise_mask=noise_mask, callback=callback, disable_pbar=disable_pbar, seed=seed
        )
        pass1_time = time.perf_counter() - t1_start
        _log(f"Pass1 END ({pass1_time:.2f}s)")
        samples_external = to_external(samples_internal)
        out = latent.copy()
        out["samples"] = samples_external

        # Decode base image
        base_image = self._decode_latent(vae, samples_external)
        px = samples_internal.shape[-1]
        py = samples_internal.shape[-2]

        # Latent upscaling
        if latent_upscale:
            width = round(px * ratio)
            height = round(py * ratio)
            upscaled_latent_internal = comfy.utils.common_upscale(samples_internal, width, height, upscale_method, "disabled")
            out_up = out.copy()
            out_up["samples"] = to_external(upscaled_latent_internal)
            upscaled_seed = seed
            upscaled_noise = comfy.sample.prepare_noise(upscaled_latent_internal, upscaled_seed)
            steps_used_in_pass2 = 0
            denoise_used_in_pass2 = 0.0
            pass2_start_step = None
            pass2_mode_continue = False
            if int(start_step_second) >= 0:
                # Continue the schedule from start_step_actual to the end
                start_step_actual = int(start_step_second)
                remaining_steps = max(int(steps_total) - start_step_actual, 0)
                pass2_start_step = start_step_actual
                pass2_mode_continue = True if remaining_steps > 0 else False
                _log(f"Pass2 START (continue): total={int(steps_total)}, start={start_step_actual}, remaining={remaining_steps}, cfg={cfg_latent_upscale}, denoise=1.0, seed={upscaled_seed}")
                callback2 = latent_preview.prepare_callback(model, max(remaining_steps, 1))
                disable_pbar2 = not comfy.utils.PROGRESS_BAR_ENABLED
                if remaining_steps > 0:
                    t2_start = time.perf_counter()
                    refined_samples_internal = comfy.sample.sample(
                        model, upscaled_noise, int(steps_total), cfg_latent_upscale, sampler_name, scheduler, positive, negative, upscaled_latent_internal,
                        denoise=1.0, disable_noise=False, start_step=start_step_actual, last_step=int(steps_total),
                        force_full_denoise=False, noise_mask=None, callback=callback2, disable_pbar=disable_pbar2, seed=upscaled_seed
                    )
                    pass2_time = time.perf_counter() - t2_start
                    _log(f"Pass2 END (continue): ran={remaining_steps} steps in {pass2_time:.2f}s")
                    steps_used_in_pass2 = remaining_steps
                    denoise_used_in_pass2 = 1.0
                else:
                    refined_samples_internal = upscaled_latent_internal
                    steps_used_in_pass2 = 0
                    denoise_used_in_pass2 = 0.0
                    pass2_mode_continue = False
            else:
                # Denoise fraction mode: run a fraction of the schedule at upscaled size
                frac = float(max(min(upscaling_denoise, 1.0), 0.0))
                steps2 = max(int(round(frac * int(steps_total))), 1)
                _log(f"Pass2 START (fraction): steps={steps2}/{int(steps_total)}, cfg={cfg_latent_upscale}, denoise={upscaling_denoise}, seed={upscaled_seed}")
                callback2 = latent_preview.prepare_callback(model, steps2)
                disable_pbar2 = not comfy.utils.PROGRESS_BAR_ENABLED
                t2_start = time.perf_counter()
                refined_samples_internal = comfy.sample.sample(
                    model, upscaled_noise, steps2, cfg_latent_upscale, sampler_name, scheduler, positive, negative, upscaled_latent_internal,
                    denoise=upscaling_denoise, disable_noise=False, start_step=None, last_step=None,
                    force_full_denoise=False, noise_mask=None, callback=callback2, disable_pbar=disable_pbar2, seed=upscaled_seed
                )
                pass2_time = time.perf_counter() - t2_start
                _log(f"Pass2 END (fraction): ran={steps2} steps in {pass2_time:.2f}s")
                steps_used_in_pass2 = steps2
                denoise_used_in_pass2 = upscaling_denoise
                pass2_mode_continue = False
            out = out_up.copy()
            latent_upscaled_latent_internal = refined_samples_internal
            latent_upscaled_latent_external = to_external(latent_upscaled_latent_internal)
            out["samples"] = latent_upscaled_latent_external
            latent_upscaled_image = self._decode_latent(vae, latent_upscaled_latent_external)
        else:
            latent_upscaled_latent_internal = samples_internal
            latent_upscaled_latent_external = samples_external
            latent_upscaled_image = base_image
            pass

        # Image upscaling from base image (fallback when latent_upscale is disabled)
        if image_upscale:
            image_upscaled_from_base = self.pil_upscale(base_image, image_upscale_ratio, image_upscale_method, image_upscale_model)
        else:
            image_upscaled_from_base = base_image

        # Image upscaling from latent upscaled image (for "Both upscaled" output)
        pixel_only_upscaled_from_latent = None
        if latent_upscale and image_upscale:
            # First, produce a pixel-space upscaled image from the decoded latent (no sampling).
            # IMPORTANT: Use plain interpolation here (skip AI upscaler) to avoid compounding artifacts
            # before re-encoding and resampling.
            pixel_only_upscaled_from_latent = self.pil_upscale(latent_upscaled_image, image_upscale_ratio, image_upscale_method, model_name="None")

            # Re-encode and pass through sampler using the SAME number of steps
            # as the previous latent upscale pass, then decode to produce "Both upscaled".
            encoded_result = self._encode_image(vae, pixel_only_upscaled_from_latent)
            image_upscaled_latent_tmp_internal = to_internal(encoded_result)

            upscaled_seed_imgpass = seed  # keep consistent with latent pass
            if 'steps_used_in_pass2' in locals() and steps_used_in_pass2 > 0:
                # Safer resampling: clamp steps and denoise to reduce drift after re-encoding
                upscaled_noise_imgpass = comfy.sample.prepare_noise(image_upscaled_latent_tmp_internal, upscaled_seed_imgpass)
                disable_pbar3 = not comfy.utils.PROGRESS_BAR_ENABLED
                # Determine conservative steps based on pass2 usage, capped to reduce artifacts
                desired_steps = int(steps_used_in_pass2)
                # Cap to a small, safe range; typical: 4-12
                steps_imgpass = max(1, min(desired_steps if desired_steps > 0 else 4, 12))
                # Keep denoise modest to avoid structural drift (faces/limbs distortions)
                denoise_imgpass = float(denoise_used_in_pass2) if 'denoise_used_in_pass2' in locals() else upscaling_denoise
                denoise_imgpass = max(0.01, min(denoise_imgpass, 0.40))
                _log(f"Pass3 START (both-upscaled, safe): steps={steps_imgpass}, cfg={cfg_latent_upscale}, denoise={denoise_imgpass}")
                callback3 = latent_preview.prepare_callback(model, max(steps_imgpass, 1))
                t3_start = time.perf_counter()
                refined_samples_imgpass_internal = comfy.sample.sample(
                    model, upscaled_noise_imgpass, steps_imgpass, cfg_latent_upscale, sampler_name, scheduler, positive, negative, image_upscaled_latent_tmp_internal,
                    denoise=denoise_imgpass, disable_noise=False, start_step=None, last_step=None, force_full_denoise=False,
                    noise_mask=None, callback=callback3, disable_pbar=disable_pbar3, seed=upscaled_seed_imgpass
                )
                pass3_time = time.perf_counter() - t3_start
                _log(f"Pass3 END (both-upscaled, safe): ran={steps_imgpass} steps in {pass3_time:.2f}s")
                refined_samples_imgpass_external = to_external(refined_samples_imgpass_internal)
                image_upscaled_from_latent = self._decode_latent(vae, refined_samples_imgpass_external)
            else:
                # If no steps were performed in pass2, keep the pixel-only upscaled image.
                image_upscaled_from_latent = pixel_only_upscaled_from_latent
        else:
            image_upscaled_from_latent = base_image

        # Output selection logic
        base_output = base_image
        latent_upscaled_output = latent_upscaled_image if latent_upscale else base_image
        # Select the "Both upscaled" output with fallbacks
        if latent_upscale and image_upscale:
            both_upscaled_output = image_upscaled_from_latent
        elif latent_upscale and not image_upscale:
            both_upscaled_output = latent_upscaled_image
        elif image_upscale and not latent_upscale:
            both_upscaled_output = image_upscaled_from_base
        else:
            both_upscaled_output = base_image

        # Refined image: apply to Both-upscaled if available, else image-upscaled, else base
        if latent_upscale and image_upscale:
            refine_source = both_upscaled_output
        elif image_upscale and not latent_upscale:
            refine_source = image_upscaled_from_base
        elif latent_upscale and not image_upscale:
            refine_source = latent_upscaled_image
        else:
            refine_source = base_image

        if image_upscale_refine:
            encoded_refine = self._encode_image(vae, refine_source)
            refine_latent_internal = to_internal(encoded_refine)
            refine_seed = seed
            refine_noise = comfy.sample.prepare_noise(refine_latent_internal, refine_seed)
            callback_refine = latent_preview.prepare_callback(model, img_refine_steps)
            disable_pbar_refine = not comfy.utils.PROGRESS_BAR_ENABLED
            _log(f"Refine START: steps={img_refine_steps}, denoise={img_refine_denoise}, cfg={cfg}")
            tr_start = time.perf_counter()
            refined_samples_internal = comfy.sample.sample(
                model, refine_noise, img_refine_steps, cfg, sampler_name, scheduler, positive, negative, refine_latent_internal,
                denoise=img_refine_denoise, disable_noise=False, start_step=0, last_step=None, force_full_denoise=False,
                noise_mask=None, callback=callback_refine, disable_pbar=disable_pbar_refine, seed=refine_seed
            )
            refined_samples_external = to_external(refined_samples_internal)
            refined_image_output = self._decode_latent(vae, refined_samples_external)
            refine_time = time.perf_counter() - tr_start
            _log(f"Refine END ({refine_time:.2f}s)")
        else:
            refined_image_output = refine_source

        # Provide latent output for downstream nodes
        if latent_upscale:
            latent_output = latent_upscaled_latent_external
        else:
            latent_output = samples_external

        # Encode upscaled type as descriptive label; append ' Refined' only when refine is enabled
        if latent_upscale and image_upscale:
            base_upscaled_type = "Both upscaled"
        elif latent_upscale:
            base_upscaled_type = "Latent upscaled"
        elif image_upscale:
            base_upscaled_type = "Image upscaled"
        else:
            base_upscaled_type = "No upscale"
        upscaled_type = base_upscaled_type + (" Refined" if image_upscale_refine else "")

        # Provide explicit image-upscaled output: always the base-image upscaled result
        if image_upscale:
            image_upscaled_output = image_upscaled_from_base
        else:
            image_upscaled_output = base_image

        try:
            pass2_steps = int(steps_used_in_pass2) if 'steps_used_in_pass2' in locals() else 0
        except Exception:
            pass2_steps = 0
        _log(
            f"Summary: upscaled_type='{upscaled_type}', "
            f"pass2_steps={pass2_steps}, refine={'yes' if image_upscale_refine else 'no'}, "
            f"t1={pass1_time:.2f}s, t2={pass2_time:.2f}s, t3={pass3_time:.2f}s, tr={refine_time:.2f}s"
        )

        return (
            base_output,
            image_upscaled_output,
            latent_upscaled_output,
            both_upscaled_output,
            refined_image_output,
            {"samples": latent_output},
            upscaled_type,
        )

NODE_CLASS_MAPPINGS = {"AUNKSamplerPlusv3": AUNKSamplerPlusv3}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNKSamplerPlusv3": "AUN KSampler PlusV3"}
