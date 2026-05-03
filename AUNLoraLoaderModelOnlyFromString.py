import os

import comfy.sd
import comfy.utils
import folder_paths


class AUNLoraLoaderModelOnlyFromString:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "lora_name": (
                    "STRING",
                    {
                        "default": "",
                        "forceInput": True,
                        "tooltip": "LoRA filename or relative path under the loras directory (for example SDXL/my_lora.safetensors).",
                    },
                ),
                "strength_model": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": -20.0,
                        "max": 20.0,
                        "step": 0.01,
                        "tooltip": "LoRA strength applied to the model.",
                    },
                ),
            }
        }

    RETURN_TYPES = ("MODEL", "STRING")
    RETURN_NAMES = ("MODEL", "resolved_lora")
    FUNCTION = "load_lora"
    CATEGORY = "AUN Nodes/Utility"
    OUTPUT_NODE = False
    DESCRIPTION = "Loads a LoRA into a MODEL from a STRING input. Useful when core LoraLoaderModelOnly lora_name is COMBO-only."

    @staticmethod
    def _normalize_name(value):
        return str(value or "").strip().replace("\\", "/")

    @classmethod
    def _resolve_lora_path(cls, raw_name):
        name = cls._normalize_name(raw_name)
        if not name:
            return None

        # Absolute path support.
        if os.path.isabs(name) and os.path.isfile(name):
            return name

        # Try direct resolver first.
        direct = folder_paths.get_full_path("loras", name)
        if isinstance(direct, str) and os.path.isfile(direct):
            return direct

        # Try common extensions if omitted.
        root, ext = os.path.splitext(name)
        if not ext:
            for candidate_name in (name + ".safetensors", name + ".pt", name + ".ckpt"):
                candidate = folder_paths.get_full_path("loras", candidate_name)
                if isinstance(candidate, str) and os.path.isfile(candidate):
                    return candidate

        # Fallback: search manually under all LoRA dirs.
        try:
            lora_dirs = folder_paths.get_folder_paths("loras")
        except Exception:
            lora_dirs = []

        candidate_variants = [name]
        if not ext:
            candidate_variants.extend([name + ".safetensors", name + ".pt", name + ".ckpt"])

        for lora_dir in lora_dirs:
            for candidate_name in candidate_variants:
                candidate_path = os.path.normpath(os.path.join(lora_dir, candidate_name))
                if os.path.isfile(candidate_path):
                    return candidate_path

        return None

    def load_lora(self, model, lora_name, strength_model):
        lora_path = self._resolve_lora_path(lora_name)
        if not lora_path:
            raise FileNotFoundError(f"LoRA not found: {lora_name}")

        lora_weights = comfy.utils.load_torch_file(lora_path, safe_load=True)
        loaded_model, _ = comfy.sd.load_lora_for_models(model, None, lora_weights, float(strength_model), 0.0)

        resolved = os.path.basename(lora_path)
        try:
            lora_dirs = folder_paths.get_folder_paths("loras")
        except Exception:
            lora_dirs = []
        for lora_dir in lora_dirs:
            try:
                candidate = os.path.relpath(lora_path, start=lora_dir).replace("\\", "/")
                if not candidate.startswith("../"):
                    resolved = candidate
                    break
            except Exception:
                continue
        return (loaded_model, resolved)

    @classmethod
    def IS_CHANGED(cls, model=None, lora_name=None, strength_model=None):
        return (str(lora_name or "").strip(), float(strength_model or 0.0))


NODE_CLASS_MAPPINGS = {
    "AUNLoraLoaderModelOnlyFromString": AUNLoraLoaderModelOnlyFromString,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNLoraLoaderModelOnlyFromString": "LoRA Loader Model Only (String)",
}
