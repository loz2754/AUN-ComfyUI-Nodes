class AUNWidgetConfig:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "configure"
    OUTPUT_NODE = True
    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = ("Helper node: right-click -> 'Configure widget targets' to choose which nodes get the "
                   "'Configure widgets' option (checkbox list of all AUN nodes). "
                   "Save, then reload ComfyUI to apply. "
                   "Alternatively, edit web/AUN_widget_config_targets.js directly.")

    def configure(self, unique_id=None):
        return {"ui": {}}

NODE_CLASS_MAPPINGS = {"AUNWidgetConfig": AUNWidgetConfig}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNWidgetConfig": "AUN Widget Config"}