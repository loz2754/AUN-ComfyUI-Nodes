import random, time
class AUNBoolean:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "state": (["True", "False", "Randomize"], {
                    "default": "False", "tooltip": "Select True, False, or Randomize (re-evaluates each run)."
                })
            },
            "optional": {
                "label": ("STRING", {
                    "default": "label",
                    "tooltip": "Optional text label to identify this boolean in your workflow."
                })
            }
        }

    RETURN_TYPES = ("BOOLEAN", "STRING")
    RETURN_NAMES = ("Boolean", "Label (when True)")
    FUNCTION = "execute"
    CATEGORY = "AUN Nodes/Logic"
    DESCRIPTION = "Boolean switch with a single selector: True, False, or Randomize. Always outputs the resolved boolean and optional label."

    def execute(self, state, label):
        if state == "Randomize":
            value = random.choice([True, False])
        else:
            value = (state == "True")
        out_label = label if value else ""
        return (value, out_label)
        
    @classmethod
    def IS_CHANGED(cls, state, label):
        if state == "Randomize":
            return time.time()
        return (state, label)

NODE_CLASS_MAPPINGS = {"AUNBoolean": AUNBoolean}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNBoolean": "AUN Boolean"}
