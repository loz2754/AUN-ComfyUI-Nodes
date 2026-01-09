import os
import folder_paths as comfy_paths
import comfy.sd

class AUNCheckpointLoaderWithClipSkip:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
                "ckpt_name": (comfy_paths.get_filename_list("checkpoints"), {"tooltip": "Select the checkpoint to load."}),
                "clip_skip": ("INT", {"default": -1, "min": -24, "max": -1, "step": 1, "tooltip": "Set the clip skip value. This determines how many layers of the CLIP model to skip."}),
             },
             "hidden": {"prompt": "PROMPT"}
             }
    
    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "STRING", "INT")
    RETURN_NAMES = ("MODEL", "CLIP", "VAE", "name", "clip skip")
    FUNCTION = "load_checkpoint_with_clip_skip"
    CATEGORY = "AUN Nodes/Loaders"
    DESCRIPTION = "Loads a checkpoint and applies a specified Clip Skip value. It also outputs the checkpoint name, which is useful for file naming or other metadata in your workflow."

    def load_checkpoint_with_clip_skip(self, ckpt_name, clip_skip, prompt=None):
        ckpt_path = comfy_paths.get_full_path("checkpoints", ckpt_name)
        out = comfy.sd.load_checkpoint_guess_config(ckpt_path, output_vae=True, output_clip=True, embedding_directory=comfy_paths.get_folder_paths("embeddings"))
        
        # Apply clip_skip to the CLIP model
        clip = out[1]
        clip.clip_layer(clip_skip)
        
        return (out[0], clip, out[2], os.path.splitext(os.path.basename(ckpt_name))[0], clip_skip)

NODE_CLASS_MAPPINGS = {
    "AUNCheckpointLoaderWithClipSkip": AUNCheckpointLoaderWithClipSkip
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNCheckpointLoaderWithClipSkip": "AUN Ckpt Load With Clip Skip"
}
