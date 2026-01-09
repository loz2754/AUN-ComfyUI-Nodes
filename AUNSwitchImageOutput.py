import comfy.utils

class AUNSwitchImageOutput:    
    def __init__(self):
        pass    

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "no_upscale": ("IMAGE", {
                    "forceInput": True,
                    "tooltip": "Image input for no upscale option (index 1)."
                }),                
                "latent_upscale": ("IMAGE", {
                    "forceInput": True,
                    "tooltip": "Image input for latent upscale option (index 2)."
                }),
                "image_upscale": ("IMAGE", {
                    "forceInput": True,
                    "tooltip": "Image input for image upscale option (index 3)."
                }),
                "both_upscale": ("IMAGE", {
                    "forceInput": True,
                    "tooltip": "Image input for both upscale types option (index 4)."
                }),
                "index": ("INT", {
                    "default": 1, "min": 1, "max": 4, "step": 1,
                    "tooltip": "Select which image input to output: 1=none, 2=latent upscale, 3=image upscale, 4=both upscale."
                }),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("image", "label")
    FUNCTION = "index_switch"
    CATEGORY = "AUN Nodes/Image"
    DESCRIPTION = "Switch between 4 image inputs based on upscale type. Designed for selecting different upscaling results. For use with AUN KSampler Plus"

    def index_switch(self, no_upscale, latent_upscale, image_upscale, both_upscale, index):
        options = [no_upscale, latent_upscale, image_upscale, both_upscale]
        labels = ["no_upscale","latent_upscale", "image_upscale", "both_upscale"]
        idx = max(1, min(4, index)) - 1  # Clamp index to 1-4, then zero-based
        return (options[idx], labels[idx])

NODE_CLASS_MAPPINGS = {
    "AUNSwitchImageOutput": AUNSwitchImageOutput,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNSwitchImageOutput": "AUN Switch Image Output",
}
