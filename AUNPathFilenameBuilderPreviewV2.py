from .AUNPathFilenameV2 import AUNPathFilenameV2
from .AUNPathFilenameVideoV2 import AUNPathFilenameVideoV2


class AUNPathFilenameBuilderPreviewV2:
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
        return {
            "required": {
                "MainFolder": ("STRING", {"multiline": False, "default": "Videos", "tooltip": "Top-level output folder."}),
                "Date_Subfolder": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert a YYYY-MM-DD subfolder."}),
                "SubfolderA": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional subfolder A."}),
                "SubfolderB": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional subfolder B."}),
                "manual_name": ("STRING", {"multiline": False, "default": "Name", "tooltip": "Manual base name when Name Mode is Manual."}),
                "name_mode": ("BOOLEAN", {"default": False, "label_on": "Manual", "label_off": "Auto", "tooltip": "Manual uses manual_name. Auto uses auto_name."}),
                "max_num_words": ("INT", {"default": 1, "min": 0, "max": 32, "step": 1, "tooltip": "Maximum number of words to keep from auto_name. Set to 0 for no limit."}),
                "prefix_1": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional prefix #1."}),
                "prefix_2": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional prefix #2."}),
                "Date": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include %date/%date% token in the filename template."}),
                "Model": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include %model_short% token."}),
                "Sampler": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include %sampler_name% token."}),
                "Scheduler": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include %scheduler% token."}),
                "Steps": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include %steps% token."}),
                "Cfg": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include %cfg% token."}),
                "suffix_1": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional suffix #1."}),
                "suffix_2": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional suffix #2."}),
                "Seed": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include %seed% token."}),
                "date_format": (cls.date_format, {"tooltip": "The format for the date placeholder in filenames."}),
                "token_style": (["Image (AUN Save Image)", "Video (AUN Save Video)"], {"default": "Image (AUN Save Image)", "tooltip": "Image style uses %token plus steps_/cfg_/seed_ prefixes. Video style uses %token% placeholders."}),
                "delimiter": ("STRING", {"multiline": False, "default": " ", "tooltip": "String used to join filename parts."}),
            },
            "optional": {
                "auto_name": ("STRING", {"multiline": False, "default": "Name", "tooltip": "Auto mode base name source."}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("path_filename_template", "date_format")
    FUNCTION = "build_v2"
    CATEGORY = "AUN Nodes/File Management/Preview"
    DESCRIPTION = "Compatibility wrapper for the V2 builder family. Emits path_filename_template and date_format for resolver-based workflows, but delegates generation to Path Filename V2 or Path Filename Video V2."

    def build_v2(self, **kwargs):
        token_style = kwargs.get("token_style", "Image (AUN Save Image)")

        if token_style == "Video (AUN Save Video)":
            path_filename, date_format = AUNPathFilenameVideoV2().generate_path_v2(
                MainFolder=kwargs.get("MainFolder", "Videos"),
                Date_Subfolder=kwargs.get("Date_Subfolder", True),
                SubfolderA=kwargs.get("SubfolderA", ""),
                SubfolderB=kwargs.get("SubfolderB", ""),
                manual_name=kwargs.get("manual_name", "Name"),
                name_mode=kwargs.get("name_mode", False),
                auto_name=kwargs.get("auto_name", "Name"),
                max_num_words=kwargs.get("max_num_words", 1),
                prefix_1=kwargs.get("prefix_1", ""),
                prefix_2=kwargs.get("prefix_2", ""),
                Date=kwargs.get("Date", True),
                Model=kwargs.get("Model", True),
                Sampler=kwargs.get("Sampler", True),
                Scheduler=kwargs.get("Scheduler", True),
                Steps=kwargs.get("Steps", True),
                Cfg=kwargs.get("Cfg", True),
                suffix_1=kwargs.get("suffix_1", ""),
                suffix_2=kwargs.get("suffix_2", ""),
                Seed=kwargs.get("Seed", True),
                date_format=kwargs.get("date_format", "%Y-%m-%d"),
                delimiter=kwargs.get("delimiter", " "),
            )
            return (path_filename, date_format)

        path_filename, date_format = AUNPathFilenameV2().generate_path_v2(
            MainFolder=kwargs.get("MainFolder", "Main"),
            Date_Subfolder=kwargs.get("Date_Subfolder", True),
            Subfolder_A=kwargs.get("SubfolderA", ""),
            Subfolder_B=kwargs.get("SubfolderB", ""),
            manual_name=kwargs.get("manual_name", "Name"),
            name_mode=kwargs.get("name_mode", False),
            auto_name=kwargs.get("auto_name", "Name"),
            max_num_words=kwargs.get("max_num_words", 1),
            prefix_1=kwargs.get("prefix_1", ""),
            prefix_2=kwargs.get("prefix_2", ""),
            suffix_1=kwargs.get("suffix_1", ""),
            suffix_2=kwargs.get("suffix_2", ""),
            Date=kwargs.get("Date", True),
            Model=kwargs.get("Model", True),
            Sampler=kwargs.get("Sampler", True),
            Scheduler=kwargs.get("Scheduler", True),
            Steps=kwargs.get("Steps", True),
            CFG=kwargs.get("Cfg", True),
            Seed=kwargs.get("Seed", True),
            Labels="",
            batch_size=1,
            date_format=kwargs.get("date_format", "%Y-%m-%d"),
            delimiter=kwargs.get("delimiter", " "),
        )
        return (path_filename, date_format)


NODE_CLASS_MAPPINGS = {"AUNPathFilenameBuilderPreviewV2": AUNPathFilenameBuilderPreviewV2}

NODE_DISPLAY_NAME_MAPPINGS = {"AUNPathFilenameBuilderPreviewV2": "Filename Builder V2"}