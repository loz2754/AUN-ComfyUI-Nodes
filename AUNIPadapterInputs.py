class AnyType(str):
   
    def __ne__(self, __value: object) -> bool:
        return False

any_type = AnyType("*")

class AUNAny:
    
    @classmethod
    def INPUT_TYPES(cls):
      return {
        "optional": {
          "any": (any_type, {
              "tooltip": "Universal input that accepts any data type."
          }),
                  },
      }

class AUNIPadapterInputs:
    
    DESCRIPTION = "Designed specifically for use when creating a subgraph for IPadapter and FaceID. The use of Any type outputs allows for both setting parameters, and passing the values to other nodes, such as AUNPathFilename."
    RETURN_TYPES = (any_type, any_type, any_type, any_type, any_type, any_type, any_type, any_type, any_type, "STRING")
    RETURN_NAMES = ("IPadapter_preset", "Ipadapter_weight", "IP_weight_type", "FaceID_preset", "lora_strength", "provider", "faceID_weight", "faceID_face_weight", "faceID_weight_type", "labels")
    CATEGORY = "AUN Nodes/FaceID/IPadapter"   
    FUNCTION = "get_names"

    @classmethod
    def INPUT_TYPES(cls):
            return {
                "required": {
                    "IPadapter_preset": (["LIGHT - SD1.5 only (low strength)", "STANDARD (medium strength)", "VIT-G (medium strength)", "PLUS (high strength)", "PLUS FACE (portraits)", "FULL FACE -SD1.5 only (portraits stronger)"
                    ],),
                    "Ipadapter_weight": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 2.0, "step": 0.01
                    },),
                    "IP_weight_type": (["standard", "prompt is more important"
                    ],),
                    "FaceID_preset": (["FACEID", "FACEID PLUS - SD1.5 only", "FACEID PLUS V2", "FACEID PORTRAIT (style transfer)", "FACEID PORTRAIT UNNORM - SDXL only (strong)",
                    ],),                 
                    "lora_strength": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 3.0, "step": 0.01
                    }),
                    "provider": (["CPU", "CUDA", "ROCM", "DirectML", "OpenVINO", "CoreML"
                    ],),
                    "faceID_weight": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 2.0, "step": 0.01
                    }),
                    "faceID_face_weight": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 4.0, "step": 0.01
                    }),
                    "faceID_weight_type": (["linear", "ease in", "ease out", "ease in-out", "reverse in-out", "weak input", "weak output", "weak middle", "strong middle", "style transfer", "composition", "strong style transfer"
                    ],),
                },
                "hidden": {"prompt": "PROMPT"}
            }

    def get_names(self,  IPadapter_preset=None, Ipadapter_weight=None, IP_weight_type=None,  FaceID_preset=None, lora_strength=None, provider=None, faceID_weight=None, faceID_face_weight=None, faceID_weight_type=None, labels=None, prompt=None):
        labels = IPadapter_preset, Ipadapter_weight, IP_weight_type, FaceID_preset, lora_strength, faceID_weight, faceID_face_weight, faceID_weight_type



        return (IPadapter_preset, Ipadapter_weight, IP_weight_type, FaceID_preset, lora_strength, provider, faceID_weight, faceID_face_weight, faceID_weight_type, str(labels))


NODE_CLASS_MAPPINGS = {
    "AUNIPadapterInputs": AUNIPadapterInputs,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNIPadapterInputs": "AUN IPadapter Inputs"
}
