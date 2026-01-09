class MainFolderManualName:
    @classmethod
   
    def INPUT_TYPES(s):

        return {'required': {
                            'MainFolder': ('STRING', {'multiline': False, 'default': 'MainFolder',"forceInput": False, "tooltip": "The main folder for the output path."}),
                            'Filename': ('STRING', {'multiline': False, 'default': 'Filename',"forceInput": True, "tooltip": "The automatically generated filename."}),
                            'ManualName': ('STRING', {'multiline': False, 'default': 'Name',"forceInput": False, "tooltip": "A manually specified name to use instead of the automatic filename."}),
                            'name_mode': ("BOOLEAN", {"default": False, "label_on": "Manual", "label_off": "Auto", "tooltip": "Switch between 'Auto' (uses Filename) and 'Manual' (uses ManualName)."}),
                            }}
                
    RETURN_TYPES = ('STRING', 'STRING', 'BOOLEAN')
    RETURN_NAMES = ('MainFolder', 'Filename', 'Name Mode',)
    FUNCTION = 'output'
    CATEGORY = 'AUN Nodes/File Management'
    DESCRIPTION = "Switch between a manual name and an automatic filename for the output path. Also returns the MainFolder, useful if you want to use the MainFolder in another node, and a boolean which can be used to switch other nodes."
    
    def output(self, MainFolder, Filename, ManualName, name_mode,):            
    
        if name_mode == True:
            return MainFolder, ManualName, name_mode
        else:
            return MainFolder, Filename, name_mode
    
NODE_CLASS_MAPPINGS = {
    "MainFolderManualName": MainFolderManualName,
}

NODE_DISPLAY_NAME_MAPPINGS = {

    "MainFolderManualName": "MainFolder ManualName",
}
