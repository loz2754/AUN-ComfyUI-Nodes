class AUNManualAutoTextSwitch:
    @classmethod
   
    def INPUT_TYPES(cls):

        return {     
            'required': {
                        'Filename': ('STRING', {'multiline': False, 'default': '',"forceInput": False, "tooltip": "The automatically generated filename."}),
                        'ManualName': ('STRING', {'multiline': False, 'default': '',"forceInput": False, "tooltip": "A manually specified name to use instead of the automatic filename."}),
                        'name_mode': ("BOOLEAN", {"default": False, "label_on": "Manual", "label_off": "Auto", "tooltip": "Switch between 'Auto' (uses Filename) and 'Manual' (uses ManualName)."}),
                        }}
                
    RETURN_TYPES = ('STRING', 'BOOLEAN')
    RETURN_NAMES = ('Filename', 'Name Mode',)
    FUNCTION = 'output'
    CATEGORY = 'AUN Nodes/Text'
    DESCRIPTION = "Switch between a manual name and an automatic filename for the output path. Returns the selected filename along with a boolean which can be used to switch other nodes."
    
    def output(self, ManualName, name_mode, Filename=None):  
        if name_mode:
            return ManualName, name_mode
        else:
            return Filename, name_mode                
    
NODE_CLASS_MAPPINGS = {
    "AUNManualAutoTextSwitch": AUNManualAutoTextSwitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {

    "AUNManualAutoTextSwitch": "Manual/Auto Text Switch",
}
