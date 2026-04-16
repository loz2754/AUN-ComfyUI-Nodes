import os
import datetime

from .aun_path_filename_shared import crop_name

class AUNPathFilenameVideo:

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "MainFolder": ("STRING", {"multiline": False, "default": f"Videos", "tooltip": "Top-level folder under which the path will be created (e.g., Videos)."}),
                "Date_Subfolder": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert a YYYY-MM-DD subfolder beneath MainFolder."}),
                "SubfolderA": ("STRING", {"multiline": False, "default": "Wan22", "tooltip": "Optional subfolder A (e.g., project/model name)."}),
                "SubfolderB": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional subfolder B (e.g., variant)."}),                
                "manual_name": ("STRING", {"multiline": False, "default": "Name", "tooltip": "Manual name value used only when Name Mode is Manual."}),
                "name_mode": ("BOOLEAN", {"default": False, "label_on": "Manual", "label_off": "Auto", "tooltip": "Manual: use 'manual_name'. Auto: use 'auto_name' input."}),
                "NameCrop": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Legacy auto-name cropping toggle kept for older workflows. When Off, auto_name is not cropped."}),
                "NameCropWords": ("INT", {"default": 1, "min": 1, "max": 6, "step": 1, "tooltip": "Legacy auto-name crop count kept for older workflows."}),
                "prefix_1": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional free-text prefix #1 to include before tokens."}),
                #"Prefix_1": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include prefix_1 in the filename when On."}),
                "prefix_2": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional free-text prefix #2."}),
                #"Prefix_2": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include prefix_2 in the filename when On."}),
                "Model": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert the %model_short% placeholder."}),
                "Sampler": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert the %sampler_name% placeholder."}),
                "Scheduler": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert the %scheduler% placeholder."}),
                "Steps": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert the bare %steps% placeholder. AUN Save Video formats it as steps-<v> when > 0."}),
                "Cfg": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert the bare %cfg% placeholder. AUN Save Video formats it as cfg-<v> when > 0."}),
                "Include_Loras": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Legacy LoRA token toggle kept for older workflows. When On, appends %loras% to the filename."}),
                "suffix_1": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional free-text suffix #1 placed after tokens."}),
                #"Suffix_1": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include suffix_1 in the filename when On."}),
                "suffix_2": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional free-text suffix #2."}), 
                #"Suffix_2": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include suffix_2 in the filename when On."}),
                "Seed": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert the bare %seed% placeholder. AUN Save Video formats it as seed-<v> (0 allowed)."}),
                "delimiter": ("STRING", {"multiline": False, "default": " ", "tooltip": "String used to join parts (prefixes/tokens/suffixes) into the filename."}),     
                "max_num_words": ("INT", {"default": 1, "min": 0, "max": 32, "step": 1, "tooltip": "Maximum number of words to keep from auto_name. Set to 0 for no limit."}),
                
            },
            "optional": {
                "auto_name": ("STRING", {"multiline": False, "default": "Name", "tooltip": "Auto mode name source. Cropped using max_num_words."}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING",)
    RETURN_NAMES = ("path", "filename", "path_filename",)
    FUNCTION = "generate_path"
    CATEGORY = "AUN Nodes/File Management"
    DESCRIPTION = (
        "Legacy video path/filename builder for existing multi-socket workflows. "
        "Uses canonical %token% placeholders and leaves %steps%, %cfg%, and %seed% bare for saver-side formatting. "
        "Use Path Filename Video V2 for new single path_filename workflows."
    )

    def generate_path(self, **kwargs):
        """
        Generates the file path by concatenating the enabled segments using the correct path separator for the OS.
        """
        # Extract inputs (required + optional)
        MainFolder = kwargs.get("MainFolder", "Videos")
        Date_Subfolder = kwargs.get("Date_Subfolder", True)
        SubfolderA = kwargs.get("SubfolderA", "")
        SubfolderB = kwargs.get("SubfolderB", "")
        manual_name = kwargs.get("manual_name", "Name")
        name_mode = kwargs.get("name_mode", False)
        max_num_words = kwargs.get("max_num_words", None)
        prefix_1 = kwargs.get("prefix_1", "")
        #Prefix_1 = kwargs.get("Prefix_1", True)
        prefix_2 = kwargs.get("prefix_2", "")
        #Prefix_2 = kwargs.get("Prefix_2", True)
        Model = kwargs.get("Model", True)
        Sampler = kwargs.get("Sampler", True)
        Scheduler = kwargs.get("Scheduler", True)
        Steps = kwargs.get("Steps", True)
        Cfg = kwargs.get("Cfg", True)
        Include_Loras = kwargs.get("Include_Loras", True)
        suffix_1 = kwargs.get("suffix_1", "")
        #Suffix_1 = kwargs.get("Suffix_1", True)
        suffix_2 = kwargs.get("suffix_2", "")
        #Suffix_2 = kwargs.get("Suffix_2", True)
        Seed = kwargs.get("Seed", True)
        delimiter = kwargs.get("delimiter", " ")
        auto_name = kwargs.get("auto_name", "Name")

        # Legacy workflow fallback: NameCrop=False means no cropping, otherwise use NameCropWords.
        if max_num_words is None:
            legacy_crop_enabled = kwargs.get("NameCrop", True)
            if legacy_crop_enabled:
                max_num_words = kwargs.get("NameCropWords", 1)
            else:
                max_num_words = 0

        Name = manual_name if name_mode else auto_name

        # Prepare path/name parts
        path_parts = []
        name_parts = []

        model = "%model_short%"
        sampler = "%sampler_name%"
        scheduler = "%scheduler%"
        steps = "%steps%"
        cfg = "%cfg%"
        seed = "%seed%"
        loras = "%loras%"
        # Build path parts
        path_parts.append(MainFolder)
        if Date_Subfolder:
            path_parts.append(datetime.datetime.now().strftime('%Y-%m-%d'))
        path_parts.append(SubfolderA)
        path_parts.append(SubfolderB)

        # Build name parts
        if not name_mode:
            name_parts = [crop_name(Name, max_num_words)]
        else:
            name_parts = [Name]

        #if Prefix_1 and prefix_1:
        name_parts.append(prefix_1)
        #if Prefix_2 and prefix_2:
        name_parts.append(prefix_2)
        if Model:
            name_parts.append(model)
        if Sampler:
            name_parts.append(sampler)
        if Scheduler:
            name_parts.append(scheduler)
        if Steps:
            name_parts.append(steps)
        if Cfg:
            name_parts.append(cfg)
        if Include_Loras:
            name_parts.append(loras)
        #if Suffix_1 and suffix_1:
        name_parts.append(suffix_1)
        #if Suffix_2 and suffix_2:
        name_parts.append(suffix_2)
        if Seed:
            name_parts.append(seed)

        filename = delimiter.join([p for p in name_parts if p != ""])        
        path = os.path.join(*[p for p in path_parts if p != ""]) if path_parts else ""
        path_filename = os.path.join(path, filename) if path else filename

        return (path, filename, path_filename,)

NODE_CLASS_MAPPINGS = {"AUNPathFilenameVideo": AUNPathFilenameVideo,
                    }

NODE_DISPLAY_NAME_MAPPINGS = {"AUNPathFilenameVideo": "AUN Path Filename Video (Legacy)",}