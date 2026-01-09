class AUNNameCrop:
    """
    A node that crops a string to a specified number of words.
    """

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "name": ("STRING", {"multiline": False, "default": "Name", "forceInput": True, "tooltip": "The input string to crop."}),
                "crop": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Enable or disable cropping."}),
                "words": ("INT", {"default": 1, "min": 1, "max": 10, "step": 1, "tooltip": "The number of words to keep from the start of the string."}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("cropped_name",)
    FUNCTION = "crop_name"
    CATEGORY = "AUN Nodes/Text"
    DESCRIPTION = "Crops a string to a specified number of words."

    def crop_name(self, name, crop, words):
        if not crop:
            return (name,)

        name_words = name.split()
        if not name_words:
            return (name,)

        cropped_name = ' '.join(name_words[:min(words, len(name_words))])
        return (cropped_name,)

NODE_CLASS_MAPPINGS = { "AUNNameCrop": AUNNameCrop, }
NODE_DISPLAY_NAME_MAPPINGS = { "AUNNameCrop": "AUN Name Crop", }
