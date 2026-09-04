"""Audio input options node (extracted from AUNSaveVideo.py).

Registered as "AudioInputOptions" in __init__.py.
"""
import copy

from .misc import resolve_file_path

class AudioInputOptions:

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": 
                    {
                        "audio_input_path": ("STRING", {
                            "default": "/path/",
                            "tooltip": "Path to the audio file to use with the video.",
                        }),
                        "clip_audio": ("BOOLEAN", {
                            "default": False,
                            "tooltip": "Enable to clip the audio to a start time and duration.",
                        }),
                        "audio_clip_start_seconds": ("FLOAT", {
                            "default": 0, "min": 0, "max": 3.402823466e+38,
                            "tooltip": "Start time in seconds for audio clipping (when clip_audio is enabled).",
                        }),
                        "audio_clip_duration": ("FLOAT", {
                            "default": 0, "min": 0, "max": 3.402823466e+38,
                            "tooltip": "Duration in seconds for audio clipping (when clip_audio is enabled).",
                        }),
                     },
                "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }
        
    RETURN_TYPES = ("AUDIO_INPUT_OPTIONS",)
    FUNCTION = "execute"
    CATEGORY = "AUN Nodes/Deprecated/Video"
    DESCRIPTION = (
        "Deprecated helper that packages an audio file path with optional clip start/duration "
        "settings into a single AUDIO_INPUT_OPTIONS value for video nodes. "
        "Prefer passing audio directly to current save/combine nodes."
    )

    def execute(self, **kwargs):
        kwargs_copy = copy.deepcopy(kwargs)
        kwargs_copy["audio_input_path"] = resolve_file_path(kwargs["audio_input_path"])
        return (kwargs_copy,)

