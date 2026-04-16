from .AUNSaveImage import AUNSaveImage
from .aun_path_filename_shared import split_path_filename, strip_lora_filename_tokens


class AUNSaveImageV2(AUNSaveImage):
    @classmethod
    def INPUT_TYPES(cls):
        optional = dict(AUNSaveImage.INPUT_TYPES()["optional"])
        optional.pop("loras_delimiter", None)
        optional.pop("save_sidecar_to_file", None)
        optional.pop("time_format", None)
        return {
            "required": {
                "images": ("IMAGE", {"tooltip": "Input images to save. Can be single image or batch."}),
                "path_filename": ("STRING", {"default": "%date%_%basemodelname%_%seed%", "tooltip": "Combined subfolder path and filename pattern. Supports canonical %token% placeholders, legacy %token placeholders, and %date:<format>% / %time:<format>% forms."}),
                "extension": (["png", "jpg", "webp"], {"default": "png", "tooltip": "Image format to save in."}),
            },
            "optional": optional,
            "hidden": AUNSaveImage.INPUT_TYPES()["hidden"],
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("filename", "sidecar_text")
    FUNCTION = "save_files_v2"
    OUTPUT_NODE = True
    CATEGORY = "AUN Nodes/Image"
    DESCRIPTION = "Recommended image saver for new workflows. Accepts a single path_filename input while reusing the current AUNSaveImage behavior through a compatibility-safe V2 node."

    def save_files_v2(self, images, path_filename, extension, **kwargs):
        kwargs.pop("loras_delimiter", None)
        path_filename = strip_lora_filename_tokens(path_filename)
        path, filename = split_path_filename(path_filename)
        return self.save_files(images, filename, path, extension, **kwargs)


NODE_CLASS_MAPPINGS = {"AUNSaveImageV2": AUNSaveImageV2}

NODE_DISPLAY_NAME_MAPPINGS = {"AUNSaveImageV2": "AUN Save Image V2 (Recommended)"}