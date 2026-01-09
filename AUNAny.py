    
class AnyType(str):
   
    def __ne__(self, __value: object) -> bool:
        return False

any_type = AnyType("*")

class AUNAny:
    
    @classmethod
    def INPUT_TYPES(s):
      return {
        "required": {
          "any": (any_type, {
              "tooltip": "Universal input that accepts any data type. Useful for workflow organization and data routing."
          }),
                  },
      }

    RETURN_TYPES = (any_type, )
    RETURN_NAMES = ("scheduler", )
    OUTPUT_NODE = True
    FUNCTION = "process"
    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "Universal pass-through node that accepts any data type. Useful for workflow organization and flexible data routing."

    def process(self, any):
            
        return (any,)

    
NODE_CLASS_MAPPINGS = {
     "AUNAny": AUNAny,
     "AnyType(str)": AnyType(str)
}

NODE_DISPLAY_NAME_MAPPINGS = {

    "AUNAny": "AUNAny",
    "AnyType(str)": "AnyType(str)"
}
