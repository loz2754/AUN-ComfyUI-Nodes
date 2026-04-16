import os
import re
from datetime import datetime

from .aun_path_filename_shared import build_path, crop_name


class AUNPathFilenameV2:
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
        required = {
            "MainFolder": ("STRING", {"multiline": False, "default": "Main", "forceInput": False, "tooltip": "The root output folder."}),
            "Date_Subfolder": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "If on, creates a subfolder using the selected date_format."}),
            "Subfolder_A": ("STRING", {"multiline": False, "default": "", "tooltip": "First level of custom subfolders. Add more levels by adding a / between them."}),
            "Subfolder_B": ("STRING", {"multiline": False, "default": "", "tooltip": "Second level of custom subfolders."}),
            "manual_name": ("STRING", {"multiline": False, "default": "Name", "tooltip": "Manual base name used when Name Mode is Manual."}),
            "name_mode": ("BOOLEAN", {"default": False, "label_on": "Manual", "label_off": "Auto", "tooltip": "Manual uses manual_name. Auto uses auto_name."}),
            "Date": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include the date placeholder (%date%) in the filename."}),
            "prefix_1": ("STRING", {"multiline": False, "default": "", "tooltip": "First custom prefix for the filename."}),
            "prefix_2": ("STRING", {"multiline": False, "default": "", "tooltip": "Second custom prefix for the filename."}),
            "Model": ("BOOLEAN", {"default": False, "label_on": "On", "label_off": "Off", "tooltip": "Include model placeholder (%model_short%) in the filename."}),
            "Sampler": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include sampler placeholder (%sampler_name%) in the filename."}),
            "Scheduler": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include scheduler placeholder (%scheduler%) in the filename."}),
            "Seed": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include the seed placeholder as seed_%seed% in the filename."}),
            "Steps": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include the steps placeholder as steps_%steps% in the filename."}),
            "CFG": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include the CFG placeholder as CFG_%cfg% in the filename."}),
            "Labels": ("STRING", {"default": "", "forceInput": False, "tooltip": "Additional labels to include in the filename."}),
            "suffix_1": ("STRING", {"multiline": False, "default": "", "tooltip": "First custom suffix for the filename."}),
            "suffix_2": ("STRING", {"multiline": False, "default": "", "tooltip": "Second custom suffix for the filename."}),
            "delimiter": ("STRING", {"multiline": False, "default": " ", "tooltip": "The character used to separate parts of the filename."}),
            "max_num_words": ("INT", {"default": 1, "min": 0, "max": 32, "step": 1, "tooltip": "Maximum number of words to keep from auto_name. Set to 0 for no limit."}),
            "date_format": (cls.date_format, {"tooltip": "Date format used for the dated subfolder output when Date_Subfolder is enabled."}),
        }
        return {
            "required": required,
            "optional": {
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 1000, "step": 1, "tooltip": "The batch size for the output."}),
                "auto_name": ("STRING", {"multiline": False, "default": "Name", "tooltip": "Auto mode base name source. Cropped using max_num_words."}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("path_filename", "date_format")
    FUNCTION = "generate_path_v2"
    CATEGORY = "AUN Nodes/File Management"
    DESCRIPTION = "Recommended image path/filename builder for new workflows. Returns path_filename plus date_format, and includes manual/auto naming controls so the older preview builder is no longer required for image workflows."

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
        date_subfolder = kwargs.get("Date_Subfolder", True)
        name_mode = kwargs.get("name_mode", False)
        manual_name = kwargs.get("manual_name", "Name")
        auto_name = kwargs.get("auto_name", "Name")
        max_num_words = kwargs.get("max_num_words", 1)
        delimiter = kwargs.get("delimiter", " ")

        base_name = manual_name if name_mode else crop_name(auto_name, max_num_words)
        name_parts = [base_name, kwargs.get("prefix_1", ""), kwargs.get("prefix_2", "")]

        if kwargs.get("Date", True):
            name_parts.append("%date%")
        if kwargs.get("Model", False):
            name_parts.append("%model_short%")
        if kwargs.get("Sampler", True):
            name_parts.append("%sampler_name%")
        if kwargs.get("Scheduler", True):
            name_parts.append("%scheduler%")
        if kwargs.get("Seed", True):
            name_parts.append("seed_%seed%")
        if kwargs.get("Steps", True):
            name_parts.append("steps_%steps%")
        if kwargs.get("CFG", True):
            name_parts.append("CFG_%cfg%")
        if kwargs.get("Labels", ""):
            name_parts.append(kwargs.get("Labels", ""))
        name_parts.extend([kwargs.get("suffix_1", ""), kwargs.get("suffix_2", "")])
        if kwargs.get("batch_size", 1) > 1:
            name_parts.append("batch_%batch_num%")

        filename = delimiter.join([part for part in name_parts if part])

        if date_subfolder:
            normalized_date_format = self._normalize_date_format(kwargs.get("date_format", "%Y-%m-%d"))
            try:
                current_date = datetime.now().strftime(normalized_date_format)
            except Exception:
                current_date = datetime.now().strftime("%Y-%m-%d")
            path = build_path(
                kwargs.get("MainFolder", "Main"),
                True,
                kwargs.get("Subfolder_A", ""),
                kwargs.get("Subfolder_B", ""),
                current_date=current_date,
            )
        return (os.path.join(path, filename) if path else filename, kwargs.get("date_format", "%Y-%m-%d"))

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")


NODE_CLASS_MAPPINGS = {"AUNPathFilenameV2": AUNPathFilenameV2}

NODE_DISPLAY_NAME_MAPPINGS = {"AUNPathFilenameV2": "Path Filename V2"}