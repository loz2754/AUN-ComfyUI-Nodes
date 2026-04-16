import os
import re
from datetime import datetime

from .AUNPathFilenameVideo import AUNPathFilenameVideo
from .aun_path_filename_shared import build_path, crop_name


class AUNPathFilenameVideoV2:
    date_format = [
        "%Y-%m-%d",
        "%Y-%m-%d-%H_%M_%S",
        "%Y-%m-%d-%H_%M",
        "%Y-%m-%d %H-%M-%S",
        "%Y-%m-%d %H-%M",
        "%Y-%d-%m",
        "%Y-%d-%m %H-%M-%S",
        "%Y-%d-%m %H-%M",
        "%H-%M",
        "%H-%M-%S",
        "yyyy-MM-dd",
        "yyyy-MM-dd HH-mm-ss",
        "yyyy-dd-MM",
        "yyyy-dd-MM H-mm-ss",
    ]

    @classmethod
    def INPUT_TYPES(cls):
        legacy = AUNPathFilenameVideo.INPUT_TYPES()
        required = dict(legacy["required"])
        required.pop("NameCrop", None)
        required.pop("NameCropWords", None)
        required.pop("Include_Loras", None)
        required["Date"] = ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include the %date% placeholder in the filename template."})
        required["date_format"] = (cls.date_format, {"tooltip": "Date format used for the dated subfolder output and returned for downstream V2 saver nodes."})
        return {
            "required": required,
            "optional": dict(legacy.get("optional", {})),
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("path_filename", "date_format")
    FUNCTION = "generate_path_v2"
    CATEGORY = "AUN Nodes/File Management"
    DESCRIPTION = "Recommended video path/filename builder for new workflows. Returns path_filename plus date_format for direct use with Save Video V2."

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

    def generate_path_v2(self, **kwargs):
        main_folder = kwargs.get("MainFolder", "Videos")
        date_subfolder = kwargs.get("Date_Subfolder", True)
        subfolder_a = kwargs.get("SubfolderA", "")
        subfolder_b = kwargs.get("SubfolderB", "")
        manual_name = kwargs.get("manual_name", "Name")
        name_mode = kwargs.get("name_mode", False)
        auto_name = kwargs.get("auto_name", "Name")
        max_num_words = kwargs.get("max_num_words", 1)
        delimiter = kwargs.get("delimiter", " ")
        date_format = kwargs.get("date_format", "%Y-%m-%d")

        base_name = manual_name if name_mode else crop_name(auto_name, max_num_words)
        name_parts = [base_name, kwargs.get("prefix_1", ""), kwargs.get("prefix_2", "")]

        if kwargs.get("Date", True):
            name_parts.append("%date%")

        if kwargs.get("Model", True):
            name_parts.append("%model_short%")
        if kwargs.get("Sampler", True):
            name_parts.append("%sampler_name%")
        if kwargs.get("Scheduler", True):
            name_parts.append("%scheduler%")
        if kwargs.get("Steps", True):
            name_parts.append("%steps%")
        if kwargs.get("Cfg", True):
            name_parts.append("%cfg%")
        name_parts.extend([kwargs.get("suffix_1", ""), kwargs.get("suffix_2", "")])
        if kwargs.get("Seed", True):
            name_parts.append("%seed%")

        normalized_date_format = self._normalize_date_format(date_format)
        try:
            current_date = datetime.now().strftime(normalized_date_format)
        except Exception:
            current_date = datetime.now().strftime("%Y-%m-%d")

        path = build_path(main_folder, date_subfolder, subfolder_a, subfolder_b, current_date=current_date)
        filename = delimiter.join([part for part in name_parts if part not in (None, "")])
        path_filename = os.path.join(path, filename) if path else filename
        return (path_filename, date_format)


NODE_CLASS_MAPPINGS = {"AUNPathFilenameVideoV2": AUNPathFilenameVideoV2}

NODE_DISPLAY_NAME_MAPPINGS = {"AUNPathFilenameVideoV2": "AUN Path Filename Video V2 (Recommended)"}