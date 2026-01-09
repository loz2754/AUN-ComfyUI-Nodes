import os
import datetime

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
                "NameCrop": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "When Auto mode, keep only the first N words of 'auto_name'."}),
                "NameCropWords": ("INT", {"default": 1, "min": 1, "max": 6, "step": 1, "tooltip": "Max words from 'auto_name' to keep when NameCrop is On."}),               
                "prefix_1": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional free-text prefix #1 to include before tokens."}),
                #"Prefix_1": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include prefix_1 in the filename when On."}),
                "prefix_2": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional free-text prefix #2."}),
                #"Prefix_2": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include prefix_2 in the filename when On."}),
                "Model": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert %model_short% token (replaced later by AUN Save Video)."}),
                "Sampler": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert %sampler_name% token."}),
                "Scheduler": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert %scheduler% token."}),
                "Steps": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert %steps% token. AUN Save Video formats it as 'steps-<v>' when > 0."}),
                "Cfg": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert %cfg% token. AUN Save Video formats it as 'cfg-<v>' when > 0."}),
                "Include_Loras": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Append %loras% token at the end when On."}),
                "suffix_1": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional free-text suffix #1 placed after tokens."}),
                #"Suffix_1": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include suffix_1 in the filename when On."}),
                "suffix_2": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional free-text suffix #2."}), 
                #"Suffix_2": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include suffix_2 in the filename when On."}),
                "Seed": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert %seed% token. AUN Save Video formats it as 'seed-<v>' (0 allowed)."}),
                "delimiter": ("STRING", {"multiline": False, "default": " ", "tooltip": "String used to join parts (prefixes/tokens/suffixes) into the filename."}),     
                
            },
            "optional": {
                "auto_name": ("STRING", {"multiline": False, "default": "Name", "tooltip": "Auto mode name source. Cropped to the first N words when NameCrop is On."}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING",)
    RETURN_NAMES = ("path", "filename", "path_filename",)
    FUNCTION = "generate_path"
    CATEGORY = "AUN Nodes/File Management"
    DESCRIPTION = (
        "Build a folder path and a tokenized filename for AUN Save Video. Path = MainFolder/(optional date)/SubfolderA/SubfolderB. "
    "Filename is joined by the delimiter from: (auto/manual name), optional prefixes, tokens (%model_short%, %sampler_name%, %scheduler%, %steps%, %cfg%, %seed%), optional %loras% (when Include_Loras is On), and optional suffixes."
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
        NameCrop = kwargs.get("NameCrop", True)
        NameCropWords = kwargs.get("NameCropWords", 1)
        prefix_1 = kwargs.get("prefix_1", "")
        #Prefix_1 = kwargs.get("Prefix_1", True)
        prefix_2 = kwargs.get("prefix_2", "")
        #Prefix_2 = kwargs.get("Prefix_2", True)
        Model = kwargs.get("Model", True)
        Sampler = kwargs.get("Sampler", True)
        Scheduler = kwargs.get("Scheduler", True)
        Steps = kwargs.get("Steps", True)
        Cfg = kwargs.get("Cfg", True)
        suffix_1 = kwargs.get("suffix_1", "")
        #Suffix_1 = kwargs.get("Suffix_1", True)
        suffix_2 = kwargs.get("suffix_2", "")
        #Suffix_2 = kwargs.get("Suffix_2", True)
        Seed = kwargs.get("Seed", True)
        Include_Loras = kwargs.get("Include_Loras", True)
        delimiter = kwargs.get("delimiter", " ")
        auto_name = kwargs.get("auto_name", "Name")

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
        if NameCrop and not name_mode:
            name_words = Name.split()
            if len(name_words) > 0:
                name_parts = [' '.join(name_words[:min(NameCropWords, len(name_words))])]
            else:
                name_parts = [Name]
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

NODE_DISPLAY_NAME_MAPPINGS = {"AUNPathFilenameVideo": "AUN Path Filename Video",}