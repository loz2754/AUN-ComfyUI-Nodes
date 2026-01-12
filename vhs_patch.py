import importlib
import importlib.abc
import importlib.machinery
import json
import os
import shutil
import sys
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import folder_paths  # type: ignore
import torch  # type: ignore
from .AUNSaveVideo import AUNSaveVideo
from .logger import logger

SIDE_CAR_OPTIONS = (
    "Output only (text)",
    "Output only (json)",
    "Save to file (text)",
    "Save to file (json)",
)


def _is_videohelpersuite_nodes(module: Any) -> bool:
    path = getattr(module, "__file__", None)
    if not path:
        return False
    try:
        norm = Path(path).resolve()
    except Exception:
        return False
    return "comfyui-videohelpersuite" in norm.parts and norm.name == "nodes.py"


def _find_vhs_module() -> Optional[Any]:
    for mod in sys.modules.values():
        if _is_videohelpersuite_nodes(mod):
            return mod
    return None


def _normalize_sidecar(choice: str) -> Tuple[str, bool]:
    s = (choice or "").strip().lower()
    if not s:
        return ("text", False)
    if "output" in s and "json" in s:
        return ("json", False)
    if "output" in s and "text" in s:
        return ("text", False)
    if ("save" in s or "file" in s) and "json" in s:
        return ("json", True)
    if ("save" in s or "file" in s) and "text" in s:
        return ("text", True)
    legacy_text = {
        "text",
        "txt",
        "text (save)",
        "txt (save)",
        "text save",
        "text save to file",
        "text save to file (txt)",
        "save to file (txt)",
        "save to file txt",
        "save txt",
    }
    legacy_json = {
        "json",
        "json (save)",
        "json save",
        "json save to file",
        "json save to file (json)",
        "save to file (json)",
        "save json",
    }
    if s in legacy_json:
        return ("json", True)
    if s in legacy_text:
        return ("text", True)
    return ("text", False)


def _format_sidecar(record: Dict[str, Any], fmt: str) -> str:
    fmt = (fmt or "text").lower()
    if fmt == "json":
        try:
            return json.dumps(record, ensure_ascii=False, indent=2)
        except Exception:
            return json.dumps(record, ensure_ascii=False)
    lines: List[str] = []
    for key, value in record.items():
        try:
            if isinstance(value, (dict, list)):
                rendered = json.dumps(value, ensure_ascii=False)
            else:
                rendered = value
        except Exception:
            rendered = value
        lines.append(f"{key}: {rendered}")
    return "\n".join(lines)


def _infer_dims_snapshot(images: Any) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    try:
        if images is None:
            return (None, None, None)
        if isinstance(images, torch.Tensor):
            tensor = images
            if tensor.dim() >= 4:
                tensor = tensor[0]
            if tensor.dim() == 3:
                if tensor.shape[0] in (1, 3, 4):
                    height = int(tensor.shape[1])
                    width = int(tensor.shape[2])
                else:
                    height = int(tensor.shape[0])
                    width = int(tensor.shape[1])
                return (width, height, int(images.shape[0]) if images.dim() >= 4 else 1)
            return (None, None, None)
        if isinstance(images, (list, tuple)) and images:
            frame = images[0]
            if isinstance(frame, torch.Tensor):
                if frame.dim() == 3:
                    if frame.shape[-1] in (1, 3, 4):
                        height = int(frame.shape[0])
                        width = int(frame.shape[1])
                    else:
                        height = int(frame.shape[1])
                        width = int(frame.shape[2])
                    return (width, height, len(images))
            if hasattr(frame, "shape") and len(frame.shape) == 3:
                shape = frame.shape
                if shape[-1] in (1, 3, 4):
                    height = int(shape[0])
                    width = int(shape[1])
                else:
                    height = int(shape[1])
                    width = int(shape[2])
                return (width, height, len(images))
    except Exception:
        return (None, None, None)
    return (None, None, None)


def _sanitize_filename_component(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return "AnimateDiff"
    normalized = raw.replace("\\", "/")
    normalized = normalized.split("/")[-1]
    if hasattr(AUNSaveVideo, "_cleanup_filename_core"):
        try:
            return AUNSaveVideo._cleanup_filename_core(normalized)
        except Exception:
            return normalized
    return normalized


def _split_prefix(filename_prefix: str) -> Tuple[str, str]:
    prefix = (filename_prefix or "AnimateDiff").strip()
    prefix = prefix.replace("\\", "/")
    if "/" in prefix:
        folder_part, name_part = os.path.split(prefix)
        return (folder_part, name_part or "AnimateDiff")
    return ("", prefix or "AnimateDiff")


def _normalize_override_dir(base_dir: str, override: str) -> str:
    if not override:
        return base_dir
    override = override.strip()
    if not override:
        return base_dir
    normalized = os.path.normpath(override)
    if not os.path.isabs(normalized):
        normalized = os.path.normpath(os.path.join(base_dir, normalized))
    return normalized


def _collect_suffix_matrix(output_files: Sequence[str]) -> List[Tuple[str, str]]:
    suffixes: List[Tuple[str, str]] = []
    for idx, src in enumerate(output_files):
        ext = Path(src).suffix or ""
        tag = ""
        if idx == 0:
            ext = ".png"
        elif "-audio" in os.path.basename(src).lower():
            tag = "-audio"
        suffixes.append((tag, ext))
    return suffixes


def _ensure_unique_stem(folder: str, stem: str, suffixes: Sequence[Tuple[str, str]]) -> str:
    candidate = stem
    attempt = 1
    while True:
        conflict = False
        for tag, ext in suffixes:
            target = os.path.join(folder, f"{candidate}{tag}{ext}")
            if os.path.exists(target):
                conflict = True
                break
        if not conflict:
            return candidate
        attempt += 1
        candidate = f"{stem}_{attempt:03d}"


def _build_loras_block(prompt: Any, extra_pnginfo: Any) -> str:
    try:
        items = AUNSaveVideo._extract_loras(prompt, extra_pnginfo)
    except Exception:
        items = []
    if not items:
        return ""
    lines: List[str] = []
    for item in items:
        raw = item.get("name")
        if not raw:
            continue
        base = Path(str(raw)).stem
        first = item.get("strength")
        second = item.get("strengthTwo") or item.get("strength_clip")
        try:
            first_txt = f"{float(first):.2f}" if first is not None else None
        except Exception:
            first_txt = None
        try:
            second_txt = f"{float(second):.2f}" if second is not None else None
        except Exception:
            second_txt = None
        tag = f"<lora:{base}"
        if first_txt:
            tag += f":{first_txt}"
        if second_txt:
            tag += f":{second_txt}"
        tag += ">"
        lines.append(tag)
    if not lines:
        return ""
    return "PowerLoraLoader loras:\n" + "\n".join(line.strip() for line in lines)


def _build_sidecar_context(
    frame_rate: float,
    loop_count: int,
    cfg_value: Optional[float],
    model_name: str,
    sampler_name_value: str,
    scheduler_value: str,
    short_manual_model_name: str,
    prompt: Any,
    extra_pnginfo: Any,
    width: Optional[int],
    height: Optional[int],
    frame_count: Optional[int],
) -> Dict[str, Any]:
    cfg_str = ""
    if cfg_value is not None:
        try:
            cfg_str = f"{float(cfg_value):.1f}"
        except Exception:
            cfg_str = str(cfg_value)
    if short_manual_model_name:
        model_short = short_manual_model_name
    else:
        try:
            model_short = AUNSaveVideo.get_model_short_name(model_name) if model_name else ""
        except Exception:
            model_short = ""
    try:
        pos_prompt, neg_prompt = AUNSaveVideo._extract_text_prompts(prompt, extra_pnginfo)
    except Exception:
        pos_prompt, neg_prompt = ("", "")

    return {
        "frame_rate": frame_rate,
        "loop_count": loop_count,
        "cfg": cfg_str,
        "model": os.path.basename(model_name) if model_name else "",
        "model_short": model_short,
        "sampler_name": sampler_name_value or "",
        "scheduler": scheduler_value or "",
        "positive_prompt": pos_prompt,
        "negative_prompt": neg_prompt,
        "width": width,
        "height": height,
        "count": frame_count,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
    }


class _VHSPatchLoader(importlib.abc.Loader):
    def __init__(self, wrapped_loader: importlib.abc.Loader):
        self._wrapped = wrapped_loader

    def create_module(self, spec):
        if hasattr(self._wrapped, "create_module"):
            return self._wrapped.create_module(spec)
        return None

    def exec_module(self, module):
        self._wrapped.exec_module(module)
        _apply_patch(module)


class _VHSPatchFinder(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path, target=None):
        if not fullname.lower().endswith("videohelpersuite.nodes"):
            return None
        spec = importlib.machinery.PathFinder.find_spec(fullname, path)
        if spec and spec.loader and spec.origin:
            try:
                origin_path = Path(spec.origin).resolve()
            except Exception:
                origin_path = None
            if origin_path and "comfyui-videohelpersuite" in origin_path.parts and origin_path.name == "nodes.py":
                spec.loader = _VHSPatchLoader(spec.loader)
        return spec


def _install_finder():
    finder = _VHSPatchFinder()
    if finder not in sys.meta_path:
        sys.meta_path.insert(0, finder)


def _apply_patch(module: Any):
    if getattr(module, "_AUN_PATCHED", False):
        return
    base_cls = getattr(module, "VideoCombine", None)
    if base_cls is None:
        return

    class VideoCombinePatched(base_cls):  # type: ignore[misc]
        RETURN_TYPES = ("VHS_FILENAMES", "STRING")
        RETURN_NAMES = ("Filenames", "sidecar_text")

        @classmethod
        def INPUT_TYPES(cls):
            base_inputs = super().INPUT_TYPES()
            optional = dict(base_inputs.get("optional", {}))
            optional.update(
                {
                    # Many workflows are saved without these fields; making them socket-only avoids
                    # ComfyUI showing transient "undefined" widget values when loading older JSON.
                    "path_override": (
                        "STRING",
                        {
                            "default": "",
                            "forceInput": True,
                            "tooltip": "Absolute or relative directory to save into. Leave empty to use the VHS folder selection.",
                        },
                    ),
                    "filename_override": (
                        "STRING",
                        {
                            "default": "",
                            "forceInput": True,
                            "tooltip": "Literal filename (without extension). Leave empty to reuse VHS prefix.",
                        },
                    ),
                    "save_png": ("BOOLEAN", {"default": True, "tooltip": "Save a PNG file containing the workflow metadata."}),
                    "apply_aun_tokens": ("BOOLEAN", {"default": False, "tooltip": "Apply AUN token replacements (%seed%, %steps%, etc.) when renaming."}),
                    "seed_value": (
                        "INT",
                        {
                            "default": 0,
                            "min": 0,
                            # Keep this within JS safe integer range to avoid UI oddities.
                            "max": 0xFFFFFFFF,
                            "forceInput": True,
                            "tooltip": "Value for %seed% token.",
                        },
                    ),
                    "steps_value": (
                        "INT",
                        {
                            "default": 0,
                            "min": 0,
                            "forceInput": True,
                            "tooltip": "Value for %steps% token.",
                        },
                    ),
                    "cfg_value": (
                        "FLOAT",
                        {
                            "default": 0.0,
                            "forceInput": True,
                            "tooltip": "Value for %cfg% token.",
                        },
                    ),
                    "model_name": (
                        "STRING",
                        {
                            "default": "",
                            "multiline": False,
                            "forceInput": True,
                            "tooltip": "Value for %model% token.",
                        },
                    ),
                    "sampler_name_value": (
                        "STRING",
                        {
                            "default": "",
                            "multiline": False,
                            "forceInput": True,
                            "tooltip": "Value for %sampler_name% token.",
                        },
                    ),
                    "scheduler_value": (
                        "STRING",
                        {
                            "default": "",
                            "multiline": False,
                            "forceInput": True,
                            "tooltip": "Value for %scheduler% token.",
                        },
                    ),
                    "short_manual_model_name": (
                        "STRING",
                        {
                            "default": "",
                            "multiline": False,
                            "forceInput": True,
                            "tooltip": "Manual override for %model_short%.",
                        },
                    ),
                    "sidecar_format": (SIDE_CAR_OPTIONS, {"default": SIDE_CAR_OPTIONS[0], "tooltip": "Select how to emit sidecar metadata."}),
                }
            )
            base_inputs["optional"] = optional
            return base_inputs

        def combine_video(
            self,
            frame_rate: int,
            loop_count: int,
            images=None,
            latents=None,
            filename_prefix="AnimateDiff",
            format="image/gif",
            pingpong=False,
            save_output=True,
            prompt=None,
            extra_pnginfo=None,
            audio=None,
            unique_id=None,
            manual_format_widgets=None,
            meta_batch=None,
            vae=None,
            path_override: str = "",
            filename_override: str = "",
            save_png: bool = True,
            apply_aun_tokens: bool = False,
            seed_value: Optional[int] = 0,
            steps_value: Optional[int] = None,
            cfg_value: Optional[float] = None,
            model_name: str = "",
            sampler_name_value: str = "",
            scheduler_value: str = "",
            short_manual_model_name: str = "",
            sidecar_format: str = SIDE_CAR_OPTIONS[0],
            **kwargs,
        ):
            if latents is not None and images is None:
                images = latents
            width_hint, height_hint, frame_count_hint = _infer_dims_snapshot(images)
            loras_token = ""
            if AUNSaveVideo and apply_aun_tokens:
                try:
                    loras_token = AUNSaveVideo._build_loras_token(
                        prompt,
                        extra_pnginfo,
                        "full",
                        ";",
                    )
                except Exception:
                    loras_token = ""
            sidecar_ctx = _build_sidecar_context(
                frame_rate,
                loop_count,
                cfg_value,
                model_name,
                sampler_name_value,
                scheduler_value,
                short_manual_model_name,
                prompt,
                extra_pnginfo,
                width_hint,
                height_hint,
                frame_count_hint,
            )
            sidecar_ctx["loras"] = _build_loras_block(prompt, extra_pnginfo)
            sidecar_ctx["seed"] = seed_value
            sidecar_ctx["steps"] = steps_value

            base_result = super().combine_video(
                frame_rate,
                loop_count,
                images=images,
                latents=latents,
                filename_prefix=filename_prefix,
                format=format,
                pingpong=pingpong,
                save_output=save_output,
                prompt=prompt,
                extra_pnginfo=extra_pnginfo,
                audio=audio,
                unique_id=unique_id,
                manual_format_widgets=manual_format_widgets,
                meta_batch=meta_batch,
                vae=vae,
                **kwargs,
            )

            sidecar_text = ""
            try:
                if not isinstance(base_result, dict):
                    return base_result
                result_payload = base_result.get("result")
                if not result_payload:
                    base_result["result"] = ((save_output, []), sidecar_text)
                    return base_result
                save_flag, output_files = result_payload[0]
                if not output_files:
                    base_result["result"] = ((save_flag, []), sidecar_text)
                    return base_result

                if not save_png:
                    filtered = []
                    for f in output_files:
                        if f.lower().endswith(".png"):
                            try:
                                if os.path.exists(f):
                                    os.remove(f)
                            except Exception:
                                pass
                        else:
                            filtered.append(f)
                    output_files = filtered

                final_files = list(output_files)
                updated_preview = base_result.get("ui", {}).get("gifs") or base_result.get("ui", {}).get("images")
                rename_needed = bool(path_override.strip() or filename_override.strip() or apply_aun_tokens)
                if rename_needed:
                    final_files = self._retarget_outputs(
                        final_files,
                        save_flag,
                        filename_prefix,
                        path_override,
                        filename_override,
                        apply_aun_tokens,
                        format,
                        loras_token,
                        seed_value,
                        steps_value,
                        cfg_value,
                        model_name,
                        sampler_name_value,
                        scheduler_value,
                        short_manual_model_name,
                    )
                    base_result.setdefault("ui", {})
                    previews = updated_preview or base_result["ui"].get("gifs") or base_result["ui"].get("images")
                    if previews:
                        preview = previews[0]
                        preview["filename"] = os.path.basename(final_files[-1])
                        preview["workflow"] = os.path.basename(final_files[0])
                        preview["fullpath"] = final_files[-1]
                        base_dir = folder_paths.get_output_directory() if save_flag else folder_paths.get_temp_directory()
                        try:
                            rel = os.path.relpath(Path(final_files[-1]).parent, base_dir)
                            preview["subfolder"] = "" if rel == "." else rel
                        except Exception:
                            preview["subfolder"] = ""
                base_result["result"] = ((save_flag, final_files), sidecar_text)

                if sidecar_format:
                    fmt, save_file = _normalize_sidecar(sidecar_format)
                    
                    record = dict(sidecar_ctx)
                    record.update(
                        {
                            "filename": os.path.basename(final_files[-1]),
                            "extension": Path(final_files[-1]).suffix.lstrip("."),
                        }
                    )
                    sidecar_text = _format_sidecar(record, fmt)
                    base_result["result"] = ((save_flag, final_files), sidecar_text)
                    if save_file:
                        base = os.path.splitext(final_files[-1])[0]
                        out_path = base + (".json" if fmt == "json" else ".txt")
                        with open(out_path, "w", encoding="utf-8") as handle:
                            handle.write(sidecar_text)
            except Exception as exc:  # pragma: no cover
                logger.warning(f"AUN VHS patch failed to post-process output: {exc}")
            return base_result

        def _retarget_outputs(
            self,
            output_files: List[str],
            save_output: bool,
            filename_prefix: str,
            path_override: str,
            filename_override: str,
            apply_aun_tokens: bool,
            output_format: str,
            loras_token: str,
            seed_value: Optional[int],
            steps_value: Optional[int],
            cfg_value: Optional[float],
            model_name: str,
            sampler_name_value: str,
            scheduler_value: str,
            short_manual_model_name: str,
        ) -> List[str]:
            base_dir = folder_paths.get_output_directory() if save_output else folder_paths.get_temp_directory()
            prefix_folder, prefix_name = _split_prefix(filename_prefix)
            target_dir = _normalize_override_dir(base_dir, path_override) if path_override.strip() else os.path.join(base_dir, prefix_folder) if prefix_folder else base_dir
            extra_subdir, override_name = os.path.split(filename_override.replace("\\", "/")) if filename_override else ("", "")
            if extra_subdir:
                target_dir = os.path.join(target_dir, extra_subdir)
            os.makedirs(target_dir, exist_ok=True)
            template = override_name or prefix_name or "AnimateDiff"
            template = _sanitize_filename_component(template)

            records: List[Tuple[str, str, str]] = []
            for idx, src in enumerate(output_files):
                if not src:
                    continue
                suffix = Path(src).suffix or ""
                tag = ""
                if "-audio" in os.path.basename(src).lower():
                    tag = "-audio"
                records.append((src, tag, suffix))

            if not records:
                return output_files

            suffixes = [(tag, suffix) for (_, tag, suffix) in records]
            stem = template
            if apply_aun_tokens and AUNSaveVideo:
                try:
                    dummy_format = output_format
                    resolved_path, _, _, _ = AUNSaveVideo.determine_file_name(
                        template,
                        target_dir,
                        dummy_format,
                        seed_value,
                        steps_value,
                        cfg_value,
                        model_name,
                        sampler_name_value,
                        scheduler_value,
                        short_manual_model_name,
                        loras_value=loras_token,
                    )
                    stem = os.path.splitext(os.path.basename(resolved_path))[0]
                except Exception:
                    stem = template
            stem = _ensure_unique_stem(target_dir, stem, suffixes)

            renamed: List[str] = []
            for src, tag, suffix in records:
                dest = os.path.join(target_dir, f"{stem}{tag}{suffix}")
                if not os.path.exists(src):
                    logger.warning(f"AUN VHS patch: source file missing during retarget -> {src}")
                    continue
                if os.path.abspath(src) != os.path.abspath(dest):
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    try:
                        shutil.move(src, dest)
                    except FileNotFoundError:
                        logger.warning(f"AUN VHS patch: unable to move '{src}' to '{dest}' (source vanished)")
                        continue
                renamed.append(dest)
            return renamed

    module.VideoCombine = VideoCombinePatched
    try:
        module.NODE_CLASS_MAPPINGS["VHS_VideoCombine"] = VideoCombinePatched
    except Exception:
        pass

    module._AUN_PATCHED = True
    logger.info("AUN VHS patch installed successfully.")


_existing = _find_vhs_module()
if _existing is not None:
    _apply_patch(_existing)
else:
    _install_finder()
