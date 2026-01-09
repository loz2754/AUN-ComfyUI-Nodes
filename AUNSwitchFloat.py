class AUNSwitchFloat:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "float_1": ("FLOAT", {
                    "default": 0.40, "min": 0.00, "max": 100.00, "step": 0.01,
                    "tooltip": "Float value to output when boolean is True."
                }),
                "float_2": ("FLOAT", {
                    "default": 1.00, "min": 0.00, "max": 100.00, "step": 0.01,
                    "tooltip": "Float value to output when boolean is False."
                }),
                "boolean": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Switch control. True = output float_1 value, False = output float_2 value."
                })
            }
        }

    CATEGORY = "AUN Nodes/Utility"
    RETURN_TYPES = ("FLOAT",)
    RETURN_NAMES = ("float",)
    FUNCTION = "execute"
    DESCRIPTION = "Switch between two float values based on boolean input. Useful for conditional parameter control and A/B testing."

    def execute(self, float_1, float_2, boolean=True):
       
        if boolean:
            return (float_1,)
        else:
            return (float_2,)
        
NODE_CLASS_MAPPINGS = {
    "AUNSwitchFloat": AUNSwitchFloat
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNSwitchFloat": "AUN Switch Float"
}
