import random
import time

class AUNRandomIndexSwitch:
    def __init__(self):
        self.index = None
        self.range_index = 0
        self._rng = random.SystemRandom()

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
                "mode": (["Select", "Increment", "Random", "Range"], {
                    "default": "Random",
                    "tooltip": "Select mode: Select for fixed index, Increment for cycling through range, Random for random index within range, Range for selecting from a list of indices."
                }), 
                "range": ("STRING", {
                    "default": "1,2,5-8,12",
                    "multiline": False,
                    "tooltip": "A comma-separated list of indices or ranges to select from in 'Range' mode (e.g. 1, 2, 5-8, 12)."
                }),                
                "select": ("INT", {
                    "default": 1, "min": 1, "max": 100000,
                    "tooltip": "The integer value to output when in 'Select' mode."
                }),
            }
        }
    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("index",)
    FUNCTION = "do"
    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = (
        "Outputs an integer based on mode:\n"
        "• Select: fixed value from 'select' parameter\n"
        "• Increment: cycles through min to max range\n"
        "• Random: random value within min-max range\n"
        "• Range: cycles through comma-separated list (e.g. '1,2,5-8,12')"
    )
    OUTPUT_NODE = True

    def _parse_range_string(self, range_str):
        """Parse a range string like '1,2,5-8,12' into a list [1,2,5,6,7,8,12]"""
        valid_indices = []
        try:
            for part in str(range_str or "").split(","):
                part = part.strip()
                if not part:
                    continue
                if "-" in part:
                    start_str, end_str = part.split("-", 1)
                    start = int(start_str.strip())
                    end = int(end_str.strip())
                    if start > end:
                        start, end = end, start
                    valid_indices.extend(list(range(start, end + 1)))
                else:
                    valid_indices.append(int(part))
        except Exception:
            pass

        # Remove duplicates and sort
        return sorted(set(valid_indices))
    
    def do(self, minimum, maximum, mode, select, range):
        if mode == "Random":
            if minimum > maximum:
                minimum = 0
            return (self._rng.randint(minimum, maximum),)
        elif mode == "Increment":
            if self.index is None:
                self.index = minimum - 1
            self.index += 1
            if self.index > maximum:
                self.index = minimum
            return (self.index,)
        elif mode == "Range":
            valid_indices = self._parse_range_string(range)
            if not valid_indices:
                return (1,)
            # Cycle through the parsed range
            index = valid_indices[self.range_index % len(valid_indices)]
            self.range_index = (self.range_index + 1) % len(valid_indices)
            return (index,)
        else:  # Select
            return (select,)

    @classmethod
    def IS_CHANGED(cls, minimum=None, maximum=None, mode=None, select=None, range=None):
        # Return current time to force re-execution when random, increment, or range is chosen
        if mode in ("Random", "Increment", "Range"):
            return time.time()
        return (select,)
        
NODE_CLASS_MAPPINGS = {
    "AUNRandomIndexSwitch": AUNRandomIndexSwitch,
}   
    
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNRandomIndexSwitch": "AUN Select/Increment/Random INT",
}