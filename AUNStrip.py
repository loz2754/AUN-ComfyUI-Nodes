import re

class AUNStrip:
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("cleaned text",)
    FUNCTION = "strip_text"
    CATEGORY = "AUN Nodes/Text"
    DESCRIPTION = "Trim digits and whitespace from the start and end of a string. Simple cleaner for building filenames or labels."

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"text": ("STRING", {"default": "", "forceInput": True})}}

    def strip_text(self, text):
        
        text = text.strip("0123456789 ")               

        return (text,)
    
NODE_CLASS_MAPPINGS = {
        "AUNStrip": AUNStrip
}

NODE_DISPLAY_NAME_MAPPINGS = {

        "AUNStrip": "AUN Strip"
}
