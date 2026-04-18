import re
from datetime import datetime

from .AUNSaveVideo import AUNSaveVideo
from .aun_path_filename_shared import strip_lora_filename_tokens


class AUNSaveVideoV2(AUNSaveVideo):
    @classmethod
    def INPUT_TYPES(cls):
        legacy = AUNSaveVideo.INPUT_TYPES()
        legacy_required = legacy["required"]
        legacy_optional = legacy.get("optional", {})

        required = {
            "images": legacy_required["images"],
            "frame_rate": legacy_required["frame_rate"],
            "loop_count": legacy_required["loop_count"],
            "path_filename": (
                "STRING",
                {
                    "default": "Comfy",
                    "tooltip": "Combined relative path and filename template. Supports canonical %token% placeholders and legacy %token placeholders.",
                },
            ),
            "output_format": legacy_required["output_format"],
            "save_to_output_dir": legacy_required["save_to_output_dir"],
            "quality": legacy_required["quality"],
            "save_metadata": legacy_required["save_metadata"],
            "save_workflow": legacy_required["save_workflow"],
            "batch_size": legacy_required["batch_size"],
        }

        optional = {
            "audio_options": legacy_optional["audio_options"],
            "seed_value": legacy_optional["seed_value"],
            "steps_value": legacy_optional["steps_value"],
            "cfg_value": legacy_optional["cfg_value"],
            "model_name": legacy_optional["model_name"],
            "sampler_name": legacy_optional["sampler_name_value"],
            "scheduler_value": legacy_optional["scheduler_value"],
            "manual_model_name": legacy_optional["short_manual_model_name"],
            "sidecar_format": legacy_optional["sidecar_format"],
            "date_format": (
            "STRING",
            {
                "default": "%Y-%m-%d",
                "tooltip": "Date format used for %date% and %time% placeholders in path_filename. Explicit %date:<format>% and %time:<format>% placeholders override this per token.",
            },
            ),
        }
        hidden = dict(legacy.get("hidden", {}))
        return {
            "required": required,
            "optional": optional,
            "hidden": hidden,
        }

    RETURN_TYPES = AUNSaveVideo.RETURN_TYPES
    RETURN_NAMES = AUNSaveVideo.RETURN_NAMES
    OUTPUT_NODE = True
    FUNCTION = "combine_video_v2"
    CATEGORY = "AUN Nodes/Video"
    DESCRIPTION = "Recommended video saver for new workflows. Combine image frames into an animated image or video. Supports %token% filename placeholders and %token placeholders. Empty inputs yield empty replacements.Example: %model_short%_steps-%steps%_cfg-%cfg%_seed-%seed%_%loras%."

    @staticmethod
    def _normalize_date_format(fmt: str) -> str:
        normalized = str(fmt or "%Y-%m-%d")
        mapping = [
            ("yyyy", "%Y"),
            ("MM", "%m"),
            ("dd", "%d"),
            ("HH", "%H"),
            ("mm", "%M"),
            ("ss", "%S"),
            ("yy", "%y"),
            ("M", "%m"),
            ("d", "%d"),
            ("H", "%H"),
            ("m", "%M"),
            ("s", "%S"),
        ]
        for java_token, python_token in mapping:
            normalized = re.sub(rf"(?<!%)\b{java_token}\b", python_token, normalized)
        return normalized

    @classmethod
    def _resolve_datetime_tokens(cls, path_filename: str, date_format: str) -> str:
        resolved = str(path_filename or "")
        now = datetime.now()

        def _replace_explicit(match):
            token_type = match.group(1)
            raw_format = match.group(2)
            normalized = cls._normalize_date_format(raw_format)
            try:
                return now.strftime(normalized)
            except Exception:
                fallback = "%Y-%m-%d" if token_type == "date" else "%H-%M-%S"
                return now.strftime(fallback)

        resolved = re.sub(r"%(date|time):([^%]+)%", _replace_explicit, resolved)

        normalized_default = cls._normalize_date_format(date_format)
        try:
            date_value = now.strftime(normalized_default)
        except Exception:
            date_value = now.strftime("%Y-%m-%d")

        if "%H" not in normalized_default and "%M" not in normalized_default and "%S" not in normalized_default:
            time_format = normalized_default + " %H:%M:%S"
        else:
            time_format = normalized_default

        try:
            time_value = now.strftime(time_format)
        except Exception:
            time_value = now.strftime("%Y-%m-%d %H:%M:%S")

        for token in ("%date%", "%date"):
            resolved = resolved.replace(token, date_value)
        for token in ("%time%", "%time"):
            resolved = resolved.replace(token, time_value)
        return resolved

    def combine_video_v2(
        self,
        images,
        frame_rate: int,
        loop_count: int,
        path_filename="Comfy",
        output_format="image/webp",
        save_to_output_dir=True,
        seed_value=0,
        steps_value=None,
        cfg_value=None,
        model_name=None,
        sampler_name=None,
        scheduler_value=None,
        manual_model_name: str = "",
        quality=95,
        save_metadata=True,
        save_workflow=True,
        batch_size=128,
        audio_options=None,
        extra_pnginfo=None,
        sidecar_format="none",
        date_format="%Y-%m-%d",
        prompt=None,
        **kwargs,
    ):
        if sampler_name is None:
            sampler_name = kwargs.get("sampler_name_value")
        if not manual_model_name:
            manual_model_name = kwargs.get("short_manual_model_name", "")
        path_filename = strip_lora_filename_tokens(path_filename)
        path_filename = self._resolve_datetime_tokens(path_filename, date_format)
        return self.combine_video(
            images=images,
            frame_rate=frame_rate,
            loop_count=loop_count,
            filename_format=path_filename,
            output_format=output_format,
            save_to_output_dir=save_to_output_dir,
            seed_value=seed_value,
            steps_value=steps_value,
            cfg_value=cfg_value,
            model_name=model_name,
            sampler_name_value=sampler_name,
            scheduler_value=scheduler_value,
            short_manual_model_name=manual_model_name,
            quality=quality,
            save_metadata=save_metadata,
            save_workflow=save_workflow,
            batch_size=batch_size,
            audio_options=audio_options,
            extra_pnginfo=extra_pnginfo,
            sidecar_format=sidecar_format,
            date_format=date_format,
            prompt=prompt,
        )


NODE_CLASS_MAPPINGS = {"AUNSaveVideoV2": AUNSaveVideoV2}

NODE_DISPLAY_NAME_MAPPINGS = {"AUNSaveVideoV2": "AUN Save Video V2 (Recommended)"}