class AUNCFG:
    RETURN_TYPES = ("FLOAT",)
    FUNCTION = "get_float"
    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "CFG scale selector with finer control. Provides a convenient way to set and adjust Classifier-Free Guidance values."

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"float": ("FLOAT", {
            "default": 2, "min": -2, "max": 100, "step": 0.1, "round": 0.1,
            #"tooltip": "CFG (Classifier-Free Guidance) scale value. 7-12 typical for most models. Higher = more prompt adherence."
        })}}

    def get_float(self, float):
        return (float,)
    
NODE_CLASS_MAPPINGS = {
        "AUNCFG": AUNCFG
}

NODE_DISPLAY_NAME_MAPPINGS = {

        "AUNCFG": "Cfg Selector"
}
