import json
import os

import folder_paths

from .aun_path_filename_shared import format_resolved_tokens, resolve_template, split_path_filename
from .model_utils import get_short_name as get_model_short_name
from .AUNSaveVideo import AUNSaveVideo


def _format_sidecar(rec: dict, fmt: str) -> str:
    s = str(fmt or "").lower()
    if "json" in s:
        try:
            return json.dumps(rec, indent=2, sort_keys=False)
        except Exception:
            return str(rec)

    lines = []
    for key, value in rec.items():
        lines.append(f"{key}: {value}")
    return "\n".join(lines)


def _fmt_strength(v, fallback="1.00"):
    try:
        return f"{float(v):.2f}"
    except Exception:
        return fallback


def _build_loras_sidecar(prompt, extra_pnginfo):
    try:
        items = AUNSaveVideo._extract_loras(prompt, extra_pnginfo)
        lora_lines = []
        for item in items:
            raw = item.get("name", "")
            full_name = str(raw or "")
            sm = _fmt_strength(item.get("strength", 1.0))
            sc = _fmt_strength(item.get("strengthTwo") or item.get("strength_clip") or item.get("strength", 1.0))
            lora_lines.append(f"<lora:{full_name}:{sm}:{sc}>")
        return "\n".join(lora_lines)
    except Exception:
        return ""


def _append_batch_suffix(filename, delimiter=" "):
    suffix = "batch_%batch_num%"
    if not filename:
        return suffix
    return f"{filename}{delimiter}{suffix}" if delimiter else f"{filename}_{suffix}"


def _build_sidecar_timestamp(date_format: str) -> str:
    normalized = str(date_format or "%Y-%m-%d")
    if "%H" not in normalized and "%M" not in normalized and "%S" not in normalized:
        normalized = normalized + " %H:%M:%S"
    try:
        import datetime as _dt

        return _dt.datetime.now().strftime(normalized)
    except Exception:
        import datetime as _dt

        return _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class AUNFilenameResolverPreviewV2:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "path_filename_template": ("STRING", {"multiline": False, "default": "%date% %seed%", "tooltip": "Combined path + filename template from a V2 builder node."}),
                "delimiter": ("STRING", {"multiline": False, "default": " ", "tooltip": "Delimiter used by the builder node."}),
                "model_name": ("STRING", {"multiline": False, "default": "", "tooltip": "Full model name (used in sidecar 'model' field)."}),
                "sampler_name": ("STRING", {"multiline": False, "default": "euler", "tooltip": "Resolved sampler name."}),
                "scheduler_name": ("STRING", {"multiline": False, "default": "normal", "tooltip": "Resolved scheduler name."}),
                "steps_value": ("INT", {"default": 20, "min": 0, "tooltip": "Resolved steps value."}),
                "cfg_value": ("FLOAT", {"default": 7.5, "min": 0.0, "tooltip": "Resolved cfg value."}),
                "seed_value": ("INT", {"default": 123456, "min": 0, "tooltip": "Resolved seed value."}),
                "output_type": (["Video", "Image"], {"default": "Video", "tooltip": "Video: includes frame_rate/loop/quality/width/height/count fields. Image: includes batch_num field instead."}),
                "sidecar_format": ([
                    "Output only (text)",
                    "Output only (json)",
                    "Save to file (text)",
                    "Save to file (json)",
                ], {"default": "Output only (text)", "tooltip": "Choose sidecar output format. 'Save to file' writes a .txt/.json next to the resolved output file; the node always returns sidecar_text."}),
            },
            "optional": {
                "positive_prompt": ("STRING", {"multiline": True, "forceInput": True, "tooltip": "Positive prompt text for the sidecar."}),
                "negative_prompt": ("STRING", {"multiline": True, "forceInput": True, "tooltip": "Negative prompt text for the sidecar."}),
                "date_format": ("STRING", {"default": "%Y-%m-%d", "tooltip": "Date format for %date and %time placeholders and sidecar timestamp."}),
                "frame_rate": ("FLOAT", {"default": 16.0, "min": 0.0, "tooltip": "(Video) Frame rate of the saved video."}),
                "loop_count": ("INT", {"default": 0, "min": 0, "tooltip": "(Video) Loop count (0 = infinite for gif/webp)."}),
                "quality": ("INT", {"default": 85, "min": 0, "max": 100, "tooltip": "(Video) Output quality value."}),
                "width": ("INT", {"default": 0, "min": 0, "tooltip": "(Video) Output frame width in pixels."}),
                "height": ("INT", {"default": 0, "min": 0, "tooltip": "(Video) Output frame height in pixels."}),
                "count": ("INT", {"default": 1, "min": 1, "tooltip": "(Video) Number of frames in the output."}),
                "batch_num": ("INT", {"default": 1, "min": 1, "tooltip": "(Image) Batch number appended to filenames."}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("path_filename", "sidecar_text")
    FUNCTION = "resolve_v2"
    CATEGORY = "AUN Nodes/File Management/Preview"
    DESCRIPTION = "Recommended preview resolver for new workflows. Accepts a single path_filename_template input and returns a resolved path_filename."

    def resolve_v2(self, path_filename_template, **kwargs):
        path, filename_template = split_path_filename(path_filename_template)
        delimiter = kwargs.get("delimiter", " ")
        model_name = kwargs.get("model_name", "")
        sampler_name = kwargs.get("sampler_name", "euler")
        scheduler_name = kwargs.get("scheduler_name", "normal")
        steps_value = kwargs.get("steps_value", 20)
        cfg_value = kwargs.get("cfg_value", 7.5)
        seed_value = kwargs.get("seed_value", 123456)
        output_type = kwargs.get("output_type", "Video")
        sidecar_format = kwargs.get("sidecar_format", "Output only (text)")
        positive_prompt = kwargs.get("positive_prompt", "")
        negative_prompt = kwargs.get("negative_prompt", "")
        date_format = kwargs.get("date_format", "%Y-%m-%d")
        frame_rate = kwargs.get("frame_rate", 16.0)
        loop_count = kwargs.get("loop_count", 0)
        quality = kwargs.get("quality", 85)
        width = kwargs.get("width", 0)
        height = kwargs.get("height", 0)
        count = kwargs.get("count", 1)
        batch_num = kwargs.get("batch_num", 1)
        prompt = kwargs.get("prompt")
        extra_pnginfo = kwargs.get("extra_pnginfo")

        model_name_value = str(model_name or "")
        try:
            resolved_model_short = get_model_short_name(model_name_value)
        except Exception:
            base = os.path.basename(model_name_value.replace("\\", "/")) if model_name_value else ""
            resolved_model_short = os.path.splitext(base)[0] if base else ""

        model_base = ""
        if model_name_value:
            model_base = os.path.splitext(os.path.basename(model_name_value.replace("\\", "/")))[0]

        import datetime
        import re

        now = datetime.datetime.now()

        def java_to_python_datefmt(fmt):
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
            out = fmt
            for java_token, python_token in mapping:
                out = re.sub(rf"(?<!%)\b{java_token}\b", python_token, out)
            return out

        def normalize_date_format(fmt):
            fmt_str = str(fmt or "%Y-%m-%d")
            if "y" in fmt_str and "M" in fmt_str:
                return java_to_python_datefmt(fmt_str)
            return fmt_str

        def replace_datetime_placeholders(template):
            def _repl(match):
                fmt = match.group(2)
                pyfmt = java_to_python_datefmt(fmt)
                return now.strftime(pyfmt)

            return re.sub(r"%(date|time):([^%]+)%", _repl, template)

        filename_template = replace_datetime_placeholders(filename_template)

        python_date_format = normalize_date_format(date_format)
        date_token = now.strftime(python_date_format)
        if "%H" not in python_date_format and "%M" not in python_date_format and "%S" not in python_date_format:
            time_token = now.strftime(python_date_format + " %H:%M:%S")
        else:
            time_token = now.strftime(python_date_format)

        replacements = format_resolved_tokens(
            model_short=resolved_model_short,
            sampler_name=sampler_name,
            scheduler_name=scheduler_name,
            steps_value=steps_value,
            cfg_value=cfg_value,
            seed_value=seed_value,
            loras_value="",
        )
        replacements["%date%"] = date_token
        replacements["%date"] = date_token
        replacements["%time%"] = time_token
        replacements["%time"] = time_token
        is_video = output_type == "Video"

        if is_video:
            if seed_value is not None and isinstance(seed_value, int):
                replacements["%seed%"] = f"seed-{seed_value}"
                replacements["%seed"] = f"seed-{seed_value}"

            if steps_value is not None and isinstance(steps_value, int) and steps_value > 0:
                replacements["%steps%"] = f"steps-{steps_value}"
                replacements["%steps"] = f"steps-{steps_value}"

            if cfg_value is not None and isinstance(cfg_value, (int, float)) and float(cfg_value) > 0:
                cfg_str = ("%g" % cfg_value).rstrip()
                replacements["%cfg%"] = f"cfg-{cfg_str}"
                replacements["%cfg"] = f"cfg-{cfg_str}"

        filename = resolve_template(filename_template, replacements, delimiter)

        if not is_video:
            has_batch_token = any(token in filename for token in ("%batch_num%", "%batch_num", "%batch_number"))
            if not has_batch_token:
                if int(batch_num) > 1:
                    filename = _append_batch_suffix(filename, delimiter)
            else:
                filename = filename.replace("%batch_number", "%batch_num%")
                filename = filename.replace("%batch_num", "%batch_num%") if "%batch_num%" not in filename else filename
                if int(batch_num) <= 1:
                    filename = filename.replace("%batch_num%", "")
                    if delimiter:
                        filename = delimiter.join([part for part in filename.split(delimiter) if part])

        path_filename = os.path.join(path, filename) if path else filename

        try:
            cfg_number = float(cfg_value)
            cfg_display = str(int(cfg_number)) if cfg_number.is_integer() else str(cfg_number)
        except Exception:
            cfg_display = str(cfg_value)

        loras_detected = _build_loras_sidecar(prompt, extra_pnginfo)

        sidecar_ctx = {
            "seed": seed_value,
            "steps": steps_value,
            "cfg": cfg_display,
            "model": model_base if model_base else resolved_model_short,
            "model_short": resolved_model_short,
            "sampler_name": sampler_name,
            "scheduler": scheduler_name,
            "loras": loras_detected,
            "positive_prompt": positive_prompt or "",
            "negative_prompt": negative_prompt or "",
        }

        if is_video:
            try:
                frame_rate_display = str(int(frame_rate)) if float(frame_rate).is_integer() else str(frame_rate)
            except Exception:
                frame_rate_display = str(frame_rate)
            sidecar_ctx["frame_rate"] = frame_rate_display
            sidecar_ctx["loop_count"] = loop_count
            sidecar_ctx["quality"] = quality
            sidecar_ctx["width"] = width
            sidecar_ctx["height"] = height
            sidecar_ctx["count"] = count

        sidecar_ctx["timestamp"] = _build_sidecar_timestamp(python_date_format)
        sidecar_ctx["filename"] = filename

        if not is_video:
            sidecar_ctx["batch_num"] = batch_num

        sidecar_text = _format_sidecar(sidecar_ctx, sidecar_format)

        sidecar_selector = str(sidecar_format or "").lower()
        if "save" in sidecar_selector or "file" in sidecar_selector:
            try:
                ext = "json" if "json" in sidecar_selector else "txt"
                base = os.path.basename(filename) or "sidecar"
                output_root = folder_paths.get_output_directory()
                target_dir = path if os.path.isabs(path) else os.path.join(output_root, path) if path else output_root
                os.makedirs(target_dir, exist_ok=True)
                sidecar_path = os.path.join(target_dir, f"{base}.{ext}")
                with open(sidecar_path, "w", encoding="utf-8") as fh:
                    fh.write(sidecar_text)
            except Exception:
                pass

        return (path_filename, sidecar_text)


NODE_CLASS_MAPPINGS = {"AUNFilenameResolverPreviewV2": AUNFilenameResolverPreviewV2}

NODE_DISPLAY_NAME_MAPPINGS = {"AUNFilenameResolverPreviewV2": "Filename Resolver V2"}