import random
import time

class AUNRandomIndexSwitch:
    def __init__(self):
        self.index = None

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "minimum": ("INT", {
                    "default": 0, "min": 0, "max": 100000,
                    "tooltip": "The minimum value for random number generation (inclusive)."
                }),
                "maximum": ("INT", {
                    "default": 1, "min": 1, "max": 100000,
                    "tooltip": "The maximum value for random number generation (inclusive)."
                }),
                "mode": (["Select", "Increment", "Random"], {"default": "Select", "tooltip": "Select mode: Select for fixed value, Increment for cycling through range, Random for random value."
                }),
                "select": ("INT", {
                    "default": 1, "min": 1, "max": 10,
                    "tooltip": "The integer value to output when in 'Select' mode."
                }),
            }
        }
    RETURN_TYPES = ("INT",)
    FUNCTION = "do"
    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "Outputs an integer based on mode: Select for fixed value, Increment for cycling through range, Random for random value within range."
    OUTPUT_NODE = True
    
    def do(self, minimum, maximum, mode, select):
        if mode == "Random":
            if minimum > maximum:
                minimum = 0
            return (random.randint(minimum, maximum),)
        elif mode == "Increment":
            if self.index is None:
                self.index = minimum - 1
            self.index += 1
            if self.index > maximum:
                self.index = minimum
            return (self.index,)
        else:  # Select
            return (select,)

    @classmethod
    def IS_CHANGED(cls, minimum=None, maximum=None, mode=None, select=None):
        # Return current time to force re-execution when random or increment is chosen
        if mode == "Random" or mode == "Increment":
            return time.time()
        return (select,)
        
NODE_CLASS_MAPPINGS = {
    "AUNRandomIndexSwitch": AUNRandomIndexSwitch,
}   
    
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNRandomIndexSwitch": "AUN Select/Increment/Random INT",
}