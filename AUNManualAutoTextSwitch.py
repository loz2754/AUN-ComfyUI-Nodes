class AUNManualAutoTextSwitch:
    @classmethod
   
    def INPUT_TYPES(cls):

        return {     
            'required': {
                        'Filename': ('STRING', {'multiline': False, 'default': '',"forceInput": False, "tooltip": "The automatically generated filename."}),
                        'ManualName': ('STRING', {'multiline': False, 'default': '',"forceInput": False, "tooltip": "A manually specified name to use instead of the automatic filename."}),
                        'name_mode': (["Auto", "Manual"], {"default": "Auto", "tooltip": "Switch between Auto (uses Filename) and Manual (uses ManualName)."}),
                        }}
                
    RETURN_TYPES = ('STRING', 'STRING', 'BOOLEAN')
    RETURN_NAMES = ('Filename', 'ManualName', 'Name Mode',)
    FUNCTION = 'output'
    CATEGORY = 'AUN Nodes/Text'
    DESCRIPTION = "Switch between a manual name and an automatic filename for the output path. Returns the selected filename along with a boolean which can be used to switch other nodes."

    @staticmethod
    def _to_bool(value):
        # Normalize legacy bool-like inputs and selector values to a single boolean.
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"manual", "man", "m", "1", "true", "yes", "on"}:
                return True
            if normalized in {"auto", "a", "0", "false", "no", "off"}:
                return False
        return bool(value)

    @classmethod
    def IS_CHANGED(cls, Filename, ManualName, name_mode):
        # Promoted subgraph widgets can fail to invalidate inner-node cache keys.
        # Returning NaN forces this lightweight node to re-evaluate each run.
        return float("nan")
    
    def output(self, Filename, ManualName, name_mode):
        resolved_mode = self._to_bool(name_mode)
        if resolved_mode:
            return ManualName, ManualName, resolved_mode
        return Filename, ManualName, resolved_mode
    
NODE_CLASS_MAPPINGS = {
    "AUNManualAutoTextSwitch": AUNManualAutoTextSwitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {

    "AUNManualAutoTextSwitch": "Manual/Auto Text Switch",
}
