"""Strip the '-audio' filename suffix that VHS Video Combine appends to muxed output files.

Wraps the registered VHS_VideoCombine.combine_video after all custom nodes are loaded,
renames the muxed file onto the suffix-free name and fixes the returned preview/output
paths. VHS files themselves are never modified. Disable with AUN_VHS_STRIP_AUDIO_SUFFIX=0.
"""

import functools
import os
import threading
import time

import nodes as comfy_nodes

from .logger import logger

_AUDIO_SUFFIX = "-audio"
_POLL_INTERVAL = 0.5
_POLL_ATTEMPTS = 240


def _strip_audio_suffix(name):
    stem, ext = os.path.splitext(name)
    if stem.endswith(_AUDIO_SUFFIX):
        return stem[: -len(_AUDIO_SUFFIX)] + ext
    return None


def _rewrite_output(result):
    try:
        if not isinstance(result, dict):
            return result
        gifs = (result.get("ui") or {}).get("gifs")
        if not gifs:
            return result
        preview = gifs[0]
        old_path = preview.get("fullpath")
        old_name = preview.get("filename")
        if not old_path or not old_name:
            return result
        new_name = _strip_audio_suffix(old_name)
        new_path = _strip_audio_suffix(old_path)
        if new_path is None:
            return result
        save_output, output_files = result["result"][0]
        rewritten = [new_path if p == old_path else p for p in output_files]
        seen = set()
        deduped = []
        for p in rewritten:
            if p not in seen:
                seen.add(p)
                deduped.append(p)
        if new_path != old_path:
            os.replace(old_path, new_path)
        preview["filename"] = new_name if new_name is not None else os.path.basename(new_path)
        preview["fullpath"] = new_path
        result["result"] = ((save_output, deduped),)
    except Exception as e:
        logger.warning(f"VHS -audio suffix strip skipped: {e}")
    return result


def _patch_vhs():
    cls = comfy_nodes.NODE_CLASS_MAPPINGS.get("VHS_VideoCombine")
    if cls is None:
        return False
    if getattr(cls, "_aun_suffix_patched", False):
        return True
    original = cls.combine_video

    @functools.wraps(original)
    def combine_video(self, *args, **kwargs):
        return _rewrite_output(original(self, *args, **kwargs))

    cls.combine_video = combine_video
    cls._aun_suffix_patched = True
    logger.info("VHS '-audio' suffix stripping is active on Video Combine")
    return True


def _wait_and_patch():
    for _ in range(_POLL_ATTEMPTS):
        if _patch_vhs():
            return
        time.sleep(_POLL_INTERVAL)


def _init():
    if os.environ.get("AUN_VHS_STRIP_AUDIO_SUFFIX", "1") == "0":
        logger.info("VHS '-audio' suffix stripping disabled via AUN_VHS_STRIP_AUDIO_SUFFIX")
        return
    if _patch_vhs():
        return
    threading.Thread(target=_wait_and_patch, daemon=True).start()


_init()
