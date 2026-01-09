import os
from datetime import datetime
from sys import float_info
import json
import piexif
import piexif.helper
from PIL import Image
from PIL.PngImagePlugin import PngInfo
import numpy as np
import torch
import comfy.sd

class AnyType(str):
   
    def __ne__(self, __value: object) -> bool:
        return False

scheduler = AnyType("*")
sampler = AnyType("*")

class KSamplerInputs:
    

    RETURN_TYPES = (sampler, scheduler, "FLOAT", "INT")
    RETURN_NAMES = ("ksampler", "scheduler", "cfg", "steps",)
    CATEGORY = "AUN Nodes/KSampler"   
    FUNCTION = "get_names"
    DESCRIPTION = "This node provides a convenient way to set the KSampler inputs (sampler, scheduler, CFG, and steps) in one place. This is useful for organizing your workflow and making it easier to manage these common parameters."

    @classmethod
    def INPUT_TYPES(cls):
            return {
                "required": {
                    "sampler": (comfy.samplers.KSampler.SAMPLERS, {"tooltip": "The sampler to use for the KSampler."}),
                    "scheduler": (comfy.samplers.KSampler.SCHEDULERS + ['AYS SDXL', 'AYS SD1', 'AYS SVD', 'GITS[coeff=1.2]'], {"tooltip": "The scheduler to use for the KSampler."}), 
                    "cfg": ("FLOAT", {"default": 2.0, "min": -2.0, "max": 100.0, "step": 0.1, "round": 0.1, "tooltip": "The CFG (Classifier-Free Guidance) value to use."}),
                    "steps": ("INT", {"default": 10, "tooltip": "The number of steps to use for the KSampler."}),
                }
            }
    def get_names(self, sampler, scheduler, cfg, steps,):
        return (sampler, scheduler, cfg, steps)


NODE_CLASS_MAPPINGS = {
    "KSamplerInputs": KSamplerInputs
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "KSamplerInputs": "KSampler Inputs"
}
