class TextSwitch2InputWithTextOutput:
    @classmethod

    def INPUT_TYPES(cls):
        return {'required': {
                             'text_a': ('STRING', {'multiline': False, "forceInput": False, 'tooltip': 'First text option.'}),
                             'label_a': ('STRING', {'default': 'Text A', 'tooltip': 'Label used to select text_a.'}),
                             'text_b': ('STRING', {'multiline': False, "forceInput": False, 'tooltip': 'Second text option.'}),
                             'label_b': ('STRING', {'default': 'Text B', 'tooltip': 'Label used to select text_b.'}),
                             'choose': ('STRING', {'default': 'None', 'tooltip': "Which label to output. Set to label_a to output text_a, label_b to output text_b, otherwise outputs empty."}),
                            }}
                
    RETURN_TYPES = ('STRING',)
    RETURN_NAMES = ('text',)
    FUNCTION = 'output'
    CATEGORY = 'AUN Nodes/Text'
    DESCRIPTION = "Allows you to choose between 2 text inputs, or none, with text output. Labels can be customized."
    
    def output(self, text_a, label_a, text_b, label_b, choose):     
        if choose == label_a:
            return (text_a,)
        elif choose == label_b:
            return (text_b,)
        else:
            return ("",)
    
NODE_CLASS_MAPPINGS = {
     "TextSwitch2InputWithTextOutput": TextSwitch2InputWithTextOutput,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TextSwitch2InputWithTextOutput": "Text Switch 2 Input With Text Output",
}
