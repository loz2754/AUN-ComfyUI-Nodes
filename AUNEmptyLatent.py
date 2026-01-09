import torch
import time
import random
import numpy as np

class AUNEmptyLatent:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        aspect_ratios = ["custom",
                          "512x512",
                          "512x682",
                          "512x768",
                          "720x720",
                          "640x1536",
                          "768x1344",
                          "832x1216",
                          "896x1152",                   
                          "910x512",
                          "952x512",
                          "1024x512",
                          "1024x1024",
                          "1224x512",                          
                          ]
        return {
            "required": {
                "width": ("INT", {"default": 720, "min": 64, "max": 8192, "tooltip": "The width of the latent image."}),
                "height": ("INT", {"default": 720, "min": 64, "max": 8192, "tooltip": "The height of the latent image."}),
                "aspect_ratio": (aspect_ratios, {"tooltip": "Choose a predefined aspect ratio, or 'custom' to use the width and height inputs."}),
                "mode": (["random", "fixed"], {"default": "fixed", "tooltip": "In 'random' mode, there's a 50% chance of swapping width and height. In 'fixed' mode, the dimensions are used as specified."}),
                "swap_dimensions": (["Yes", "No"], {"default": "No", "tooltip": "Explicitly swap the width and height dimensions."}),
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 64, "tooltip": "The number of latent images to generate in a batch."}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The seed for the random number generator."})}
        }
 
    RETURN_TYPES = ("LATENT", "INT", "INT", "INT")
    RETURN_NAMES = ("latent", "width", "height", "seed")
    FUNCTION = "EmptyLatent"
    CATEGORY = "AUN Nodes/Image"
    DESCRIPTION = "This node generates an empty latent image with specified dimensions. It offers options for predefined aspect ratios, random dimension swapping, and batching, making it a flexible starting point for your image generation workflows."        


    def EmptyLatent(self, width, height, aspect_ratio, mode, swap_dimensions, batch_size, seed):
        # Set dimensions based on aspect ratio
        if aspect_ratio == "512x512":
            width, height = 512, 512
        elif aspect_ratio == "720x720":
            width, height = 720, 720
        elif aspect_ratio == "512x768":
            width, height = 512, 768
        elif aspect_ratio == "910x512":
            width, height = 910, 512
        elif aspect_ratio == "512x682":
            width, height = 512, 682
        elif aspect_ratio == "952x512":
            width, height = 952, 512
        elif aspect_ratio == "1024x512":
            width, height = 1024, 512
        elif aspect_ratio == "1224x512":
            width, height = 1224, 512
        elif aspect_ratio == "1024x1024":
            width, height = 1024, 1024
        elif aspect_ratio == "896x1152":
            width, height = 896, 1152
        elif aspect_ratio == "832x1216":
            width, height = 832, 1216
        elif aspect_ratio == "768x1344":
            width, height = 768, 1344
        elif aspect_ratio == "640x1536":
            width, height = 640, 1536

        # Store original dimensions
        original_width, original_height = width, height
        
        # Handle random mode
        if mode == "random":                 
            should_swap = random.random() < 0.5            
            if should_swap:
                width, height = height, width

        # Otherwise use the swap_dimensions parameter
        elif swap_dimensions == "Yes":
            width, height = height, width

        # Create the empty latent
        latent = torch.zeros([batch_size, 4, height // 8, width // 8])
        
        return ({"samples": latent}, width, height, seed)   
    
    @classmethod
    def IS_CHANGED(self, width, height, aspect_ratio, mode, swap_dimensions, batch_size,seed):
        # Always return True to force re-execution
        time.time()
        if mode == "fixed":
                return (width, height, aspect_ratio, mode, swap_dimensions, batch_size,seed)        
        else:
                return float("NaN")

NODE_CLASS_MAPPINGS = {
    "AUNEmptyLatent": AUNEmptyLatent
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNEmptyLatent": "AUN Empty Latent"
}
