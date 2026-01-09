import random
import time

class AUNRandomNumber:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "minimum": ("INT", {
                    "default": 0, "min": 0, "max": 100000,
                    "tooltip": "Minimum value for random number generation (inclusive)."
                }),
                "maximum": ("INT", {
                    "default": 1, "min": 1, "max": 100000,
                    "tooltip": "Maximum value for random number generation (inclusive)."
                }),
            }
}

    RETURN_TYPES = ("INT",)
    FUNCTION = "random_number"
    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "Generates random integers within specified range. Useful for seed variation and randomization in workflows."

    def random_number(self, minimum, maximum, number=None):
        if minimum > maximum:
            minimum = 0
        number = random.randint(minimum, maximum)
        
        return (number,)
       
    @classmethod
    def IS_CHANGED(self, minimum, maximum, number=None):
        # Always return True to force re-execution
        time.time()
        if number is not None:
                return number      
        else:
                return float("NaN")
    
NODE_CLASS_MAPPINGS = {
    "AUNRandomNumber": AUNRandomNumber
}  
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNRandomNumber": "AUN Random Number",
}  
