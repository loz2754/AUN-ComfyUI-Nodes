from .aun_bundle_shared import BUNDLE, pack


class AUNImageToBundle:
    DESCRIPTION = "Wraps an image (and optional filename) into an OBVPM bundle so it can be stored as a constant via 'set' and read back by an OBVPM Unbundle (get) or KJ Get. Use this to make any image (e.g. from AUN Image Single Batch 3) available as a setter."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {"tooltip": "Image to pack into the bundle."}),
            },
            "optional": {
                "filename": ("STRING", {"default": "", "tooltip": "Optional filename to include in the bundle."}),
                "cleaned_filename": ("STRING", {"default": "", "tooltip": "Optional cleaned filename to include in the bundle."}),
                "set": ("STRING", {"default": "", "tooltip": "Constant name. When non-empty, this node sets an OBVPM bundle constant readable by an OBVPM Unbundle (get) or KJ Get."}),
            },
        }

    RETURN_TYPES = (BUNDLE,)
    RETURN_NAMES = ("bundle",)
    FUNCTION = "pack_bundle"
    CATEGORY = "AUN Nodes/Image"

    def pack_bundle(self, image, filename="", cleaned_filename="", set=""):
        bundle = pack({"image": image, "filename": filename, "cleaned_filename": cleaned_filename})
        return (bundle,)


NODE_CLASS_MAPPINGS = {"AUNImageToBundle": AUNImageToBundle}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNImageToBundle": "AUN Image To Bundle"}