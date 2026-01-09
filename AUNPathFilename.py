import os
import datetime
import folder_paths
import comfy.sd

class AUNPathFilename:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "MainFolder": ("STRING", {"multiline": False, "default": "Main", "forceInput": False, "tooltip": "The root output folder."}),
                "Date_Subfolder": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "If on, creates a subfolder with the current date (YYYY-MM-DD)."}),
                "Subfolder_A": ("STRING", {"multiline": False, "default": "", "tooltip": "First level of custom subfolders. Add more levels by adding a / between them."}),
                "Subfolder_B": ("STRING", {"multiline": False, "default": "", "tooltip": "Second level of custom subfolders."}),
                "name": ("STRING", {"multiline": False, "default": "Name", "tooltip": "The base name for the file."}),
                "Date": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include the date placeholder (%date) in the filename."}),
                "prefix_1": ("STRING", {"multiline": False, "default": "", "tooltip": "First custom prefix for the filename."}),
                "prefix_2": ("STRING", {"multiline": False, "default": "", "tooltip": "Second custom prefix for the filename."}),
                "Model": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include model placeholder (%model_short) in the filename."}),
                "Sampler": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include sampler placeholder (%sampler_name) in the filename."}),
                "Scheduler": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include scheduler placeholder (%scheduler) in the filename."}),
                #"Include_LoRAs": ("BOOLEAN", {"default": False, "label_on": "On", "label_off": "Off", "tooltip": "Include %loras placeholder (grouped, e.g., (LORAS-A+B)) from rgthree Power Lora Loader. %loras_group remains a compatible alias."}),
                "Seed": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include the seed placeholder in the filename."}),
                "Steps": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include steps placeholder in the filename."}),
                "CFG": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Include CFG placeholder in the filename."}),
                "Labels": ("STRING", {"default": "", "forceInput": False, "tooltip": "Additional labels to include in the filename."}),
                "suffix_1": ("STRING", {"multiline": False, "default": "", "tooltip": "First custom suffix for the filename."}),
                "suffix_2": ("STRING", {"multiline": False, "default": "", "tooltip": "Second custom suffix for the filename."}),
                "delimiter": ("STRING", {"multiline": False, "default": " ", "tooltip": "The character used to separate parts of the filename."}),
            },
            "optional": {
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 1000, "step": 1, "tooltip": "The batch size for the output."}),
            },
        }
    DESCRIPTION = "Generates a file path and filename from various components and placeholders. Ideal for creating dynamic and organized output structures for saved images and videos."
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("path", "filename")
    FUNCTION = "generate_path"
    CATEGORY = "AUN Nodes/File Management"

    def generate_path(
        self,
        MainFolder,
        Subfolder_A,
        Subfolder_B,
        Date_Subfolder,
        name,
        prefix_1,
        prefix_2,
        suffix_1,
        suffix_2,
        Date,
        Model,
        Sampler,
        Scheduler,
        Seed,
        Steps,
        CFG,
        #Include_LoRAs,
        Labels,
        batch_size,
        delimiter,
    ):

        Name = name

        # Prepare the list to store each valid path component
        path_parts = []
        name_parts = []

        date = "%date"
        Model = "%model"
        model_short = "%model_short"
        basemodelshort = "%basemodelshort"
        sampler = "%sampler_name"
        scheduler = "%scheduler"
        # Use consolidated %loras (saver treats %loras and %loras_group the same)
        #loras = "%loras"
        seed = "%seed"
        steps = "%steps"
        cfg = "%cfg"

        # Append each part based on the corresponding dropdown value and non-empty string
        path_parts.append(MainFolder)
        if Date_Subfolder:
            path_parts.append(datetime.datetime.now().strftime('%Y-%m-%d'))
        path_parts.append(Subfolder_A)
        path_parts.append(Subfolder_B)

        name_parts = [Name]

        # if Prefix_1 and prefix_1:
        name_parts.append(prefix_1)
        # if Prefix_2 and prefix_2:
        name_parts.append(prefix_2)
        if Date:
            name_parts.append(date)
        # Model / Sampler / Scheduler toggles
        if Model:
            name_parts.append(model_short)
        if Sampler:
            name_parts.append(sampler)
        if Scheduler:
            name_parts.append(scheduler)
        #if Include_LoRAs:
        #    name_parts.append(loras)
        if Seed:
            name_parts.append("seed_" + seed)
        if Steps:
            name_parts.append("steps_" + steps)
        if CFG:
            name_parts.append("CFG_" + cfg)

        # Add generic labels if not empty
        if Labels:
            name_parts.append(Labels)

        # if Suffix_1 and suffix_1:
        name_parts.append(suffix_1)

        # if Suffix_2 and suffix_2:
        name_parts.append(suffix_2)

        if batch_size > 1:
            name_parts.append("batch_%batch_num")

        # Filter out empty strings before joining
        name_parts = [part for part in name_parts if part]
        filename = delimiter.join(name_parts)
        # Use os.path.join to construct the final path
        path = os.path.join(*path_parts)

        return (path, filename)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        """
        Determine if the node should be re-executed.
        """
        return float("nan")

NODE_CLASS_MAPPINGS = {"AUNPathFilename": AUNPathFilename,}

NODE_DISPLAY_NAME_MAPPINGS = {"AUNPathFilename": "AUN Path/Filename",}
