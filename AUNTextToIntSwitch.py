import random
import time

class AUNTextToIntSwitch:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "minimum": ("INT", {"default": 0, "min": 0, "max": 100000}),
                "maximum": ("INT", {"default": 1, "min": 1, "max": 100000}),
                "rand_or_select": ("BOOLEAN", {"default": False, "label_off": "Select", "label_on": "Random"}),
                "select": ("INT", {"default": 0, "min": 0, "max": 10}),        
            }
        }
    RETURN_TYPES = ("INT",)
    FUNCTION = "text_input_switch"
    CATEGORY = "AUN Nodes/Text"   
    DESCRIPTION = "Outputs either a random integer in a range or a selected fixed integer. Handy for indexing text choices or routing branches."
    
    def text_input_switch(self, minimum, maximum, rand_or_select, select):
        if rand_or_select:
            if minimum > maximum:
                minimum = 0
            return (random.randint(minimum, maximum),)
        else:
            return (select,)

    @classmethod
    def IS_CHANGED(cls, minimum=None, maximum=None, rand_or_select=None, select=None):
        # Return current time to force re-execution when random is chosen
        if rand_or_select:
            return time.time()
        return (select,)
        
NODE_CLASS_MAPPINGS = {
    "AUNTextToIntSwitch": AUNTextToIntSwitch
}   
    
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNTextToIntSwitch": "AUN Random/Select INT",
    }
