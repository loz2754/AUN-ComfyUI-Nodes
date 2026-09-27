import comfy.model_management

from .logger import log_exception


class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False


any_type = AlwaysEqualProxy("*")


class AUNCleanVRAM:
    DESCRIPTION = "Pass-through node that frees GPU memory mid-workflow and returns its input unchanged. On execution it unloads all cached models and empties the CUDA cache, so place it where a heavy model is no longer needed (e.g. between KSampler and VAEDecode, mirroring the CleanVRAM (obvpm) position in MiniMax-H3 workflows). Downstream nodes lazily reload whatever they still need, with no external dependencies."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "anything": (any_type, {"forceInput": True, "tooltip": "Any value to pass through. Connect the output that should trigger the VRAM cleanup (e.g. the sampled LATENT)."}),
            },
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("output",)
    OUTPUT_NODE = True
    FUNCTION = "clean"
    CATEGORY = "AUN Nodes/Utility"

    def clean(self, anything=None):
        try:
            comfy.model_management.unload_all_models()
            comfy.model_management.soft_empty_cache()
        except Exception as e:
            log_exception("AUNCleanVRAM: VRAM cleanup failed:", e)
        return (anything,)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")


NODE_CLASS_MAPPINGS = {
    "AUNCleanVRAM": AUNCleanVRAM,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNCleanVRAM": "AUN Clean VRAM",
}
