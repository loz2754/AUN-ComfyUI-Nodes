import random
import time

# This proxy class allows the node to accept any input type by always returning True for equality checks.
class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True
    def __ne__(self, _):
        return False

any_type = AlwaysEqualProxy("*")

class AUNRandomAnySwitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "Seed for the random selection. Changing this will change the choice."}),
            },
            "optional": {
                "input_1": (any_type, {"tooltip": "Optional candidate #1 (any type)."}),
                "input_2": (any_type, {"tooltip": "Optional candidate #2 (any type)."}),
                "input_3": (any_type, {"tooltip": "Optional candidate #3 (any type)."}),
                "input_4": (any_type, {"tooltip": "Optional candidate #4 (any type)."}),
                "input_5": (any_type, {"tooltip": "Optional candidate #5 (any type)."}),
            }
        }

    RETURN_TYPES = (any_type, "INT",)
    RETURN_NAMES = ("output", "selected_index",)
    FUNCTION = "random_switch"
    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "Randomly selects one of several connected inputs of any type and outputs it, along with the index of the selected input."

    def random_switch(self, seed, input_1=None, input_2=None, input_3=None, input_4=None, input_5=None):
        # Create a list of all potential inputs with their original 1-based index
        all_inputs = [input_1, input_2, input_3, input_4, input_5]
        indexed_inputs = [(i + 1, val) for i, val in enumerate(all_inputs) if val is not None]

        if not indexed_inputs:
            # Return None for the output and 0 for the index if nothing is connected
            return (None, 0)

        # Use the provided seed for reproducible random choices
        random.seed(seed)
        
        # Randomly select one of the connected (index, value) tuples
        selected_tuple = random.choice(indexed_inputs)
        
        return (selected_tuple[1], selected_tuple[0]) # Return (value, 1-based index)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Always re-run to ensure a new random choice can be made if the seed changes or on re-queue.
        return time.time()

NODE_CLASS_MAPPINGS = { "AUNRandomAnySwitch": AUNRandomAnySwitch, }
NODE_DISPLAY_NAME_MAPPINGS = { "AUNRandomAnySwitch": "AUN Random Any Switch", }
