class AUNManualAutoTextSwitch:
    @classmethod
   
    def INPUT_TYPES(cls):

        return {     
            'required': {
                        'Filename': ('STRING', {'multiline': False, 'default': '',"forceInput": False, "tooltip": "The automatically generated filename."}),
                        'ManualName': ('STRING', {'multiline': False, 'default': '',"forceInput": False, "tooltip": "A manually specified name to use instead of the automatic filename."}),
                        'name_mode': ("BOOLEAN", {"default": False, "label_on": "Manual", "label_off": "Auto", "tooltip": "Switch between 'Auto' (uses Filename) and 'Manual' (uses ManualName)."}),
                        }}
                
    RETURN_TYPES = ('STRING', 'STRING', 'BOOLEAN')
    RETURN_NAMES = ('Filename', 'ManualName', 'Name Mode',)
    FUNCTION = 'output'
    CATEGORY = 'AUN Nodes/Text'
    DESCRIPTION = "Switch between a manual name and an automatic filename for the output path. Returns the selected filename along with a boolean which can be used to switch other nodes."
    
    def output(self, Filename, ManualName, name_mode):
        if name_mode:
            return ManualName, ManualName, name_mode
        else:
            return Filename, ManualName, name_mode
    
NODE_CLASS_MAPPINGS = {
    "AUNManualAutoTextSwitch": AUNManualAutoTextSwitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {

    "AUNManualAutoTextSwitch": "Manual/Auto Text Switch",
}
