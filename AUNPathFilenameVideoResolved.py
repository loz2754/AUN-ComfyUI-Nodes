import os
import datetime
import json
import time
import re
from .model_utils import (
    get_short_name as get_model_short_name_common,
    get_sampler_short_name,
    get_scheduler_short_name,
)
from .misc import get_clean_filename, convert_relative_comfyui_path_to_full_path
from .AUNSaveVideo import AUNSaveVideo

def _sanitize_token_str(value: str) -> str:
    if value is None:
        return ""
    s = str(value).strip()
    s = s.replace("\\", "/").split("/")[-1]
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^A-Za-z0-9._(),;+\-@]", "", s)
    s = re.sub(r"[_\-]{3,}", "--", s)
    return s

class AUNPathFilenameVideoResolved:

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "MainFolder": ("STRING", {"multiline": False, "default": f"Videos", "tooltip": "Top-level folder under which the path will be created (e.g., Videos)."}),
                "Date_Subfolder": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert a YYYY-MM-DD subfolder beneath MainFolder."}),
                "SubfolderA": ("STRING", {"multiline": False, "default": "Wan22", "tooltip": "Optional subfolder A (e.g., project/model name)."}),
                "SubfolderB": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional subfolder B (e.g., variant)."}),
                "manual_name": ("STRING", {"multiline": False, "default": "Name", "tooltip": "Manual name value used only when Name Mode is Manual."}),
                "name_mode": ("BOOLEAN", {"default": False, "label_on": "Manual", "label_off": "Auto", "tooltip": "Manual: use 'manual_name'. Auto: use 'auto_name' input."}),
                "NameCrop": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "When Auto mode, keep only the first N words of 'auto_name'."}),
                "NameCropWords": ("INT", {"default": 1, "min": 1, "max": 6, "step": 1, "tooltip": "Max words from 'auto_name' to keep when NameCrop is On."}),
                "prefix_1": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional free-text prefix #1 to include before tokens."}),
                "prefix_2": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional free-text prefix #2."}),
                "Model": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert model name token replaced by actual model string here."}),
                "Sampler": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert sampler name."}),
                "Scheduler": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert scheduler name."}),
                "Steps": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert steps value formatted as 'steps-<v>' when > 0."}),
                "Cfg": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert cfg value formatted as 'cfg-<v>' when > 0."}),
                #"Include_Loras": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Append loras string at the end when On."}),
                "suffix_1": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional free-text suffix #1 placed after tokens."}),
                "suffix_2": ("STRING", {"multiline": False, "default": "", "tooltip": "Optional free-text suffix #2."}),
                "Seed": ("BOOLEAN", {"default": True, "label_on": "On", "label_off": "Off", "tooltip": "Insert seed value formatted as 'seed-<v>' (0 allowed)."}),
                "delimiter": ("STRING", {"multiline": False, "default": " ", "tooltip": "String used to join parts (prefixes/tokens/suffixes) into the filename."}),     
            },
            "optional": {
                "auto_name": ("STRING", {"multiline": False, "default": "Name", "tooltip": "Auto mode name source. Cropped to the first N words when NameCrop is On."}),
                # Actual value inputs to replace tokens
                "model_short": ("STRING", {"multiline": False, "default": "%model%", "tooltip": "Actual model short name to insert when Model is On."}),
                "model_name": ("STRING", {"multiline": False, "default": "", "tooltip": "Full model name (used in sidecar 'model' field)."}),
                "sampler_name": ("STRING", {"multiline": False, "default": "%sampler%", "tooltip": "Actual sampler name to insert when Sampler is On."}),
                "scheduler_name": ("STRING", {"multiline": False, "default": "%scheduler%", "tooltip": "Actual scheduler name to insert when Scheduler is On."}),
                "steps_value": ("INT", {"default": 20, "min": 0, "tooltip": "Actual steps value (integer)."}),
                "cfg_value": ("FLOAT", {"default": 7.5, "min": 0.0, "tooltip": "Actual cfg value (float)."}),
                "seed_value": ("INT", {"default": 123456, "min": 0, "tooltip": "Actual seed value (integer)."}),
                #"loras_value": ("STRING", {"multiline": False, "default": "", "tooltip": "Comma-separated lora descriptions to append when Include_Loras is On."}),
                "sidecar_format": ([
                    "Output only (text)",
                    "Output only (json)",
                    "Save to file (text)",
                    "Save to file (json)",
                ], {"default": "Output only (text)", "tooltip": "Choose sidecar output format. 'Save to file' writes the .txt/.json into ComfyUI's output folder next to the output; the node always returns the sidecar text as its fourth output."}),
            },
                "hidden": {
                    "prompt": "PROMPT",
                    "extra_pnginfo": "EXTRA_PNGINFO",
                },
        }

    RETURN_TYPES = ("STRING", "STRING",)
    RETURN_NAMES = ("path_filename", "sidecar_text",)
    FUNCTION = "generate_path"
    CATEGORY = "AUN Nodes/File Management"
    DESCRIPTION = (
        "Build a folder path and a filename for AUN Save Video with resolved values. Path = MainFolder/(optional date)/SubfolderA/SubfolderB. "
    "Filename is joined by the delimiter from: (auto/manual name), optional prefixes, actual token values (model/sampler/... formatted), optional loras, and optional suffixes."
    )

    def generate_path(self, **kwargs):
        """
        Generates the file path by concatenating the enabled segments using the correct path separator for the OS.
        Replaces token placeholders with provided actual values.
        """
        # Extract inputs (required + optional)
        MainFolder = kwargs.get("MainFolder", "Videos")
        Date_Subfolder = kwargs.get("Date_Subfolder", True)
        SubfolderA = kwargs.get("SubfolderA", "")
        SubfolderB = kwargs.get("SubfolderB", "")
        manual_name = kwargs.get("manual_name", "Name")
        name_mode = kwargs.get("name_mode", False)
        NameCrop = kwargs.get("NameCrop", True)
        NameCropWords = kwargs.get("NameCropWords", 1)
        prefix_1 = kwargs.get("prefix_1", "")
        prefix_2 = kwargs.get("prefix_2", "")
        Model = kwargs.get("Model", True)
        Sampler = kwargs.get("Sampler", True)
        Scheduler = kwargs.get("Scheduler", True)
        Steps = kwargs.get("Steps", True)
        Cfg = kwargs.get("Cfg", True)
        suffix_1 = kwargs.get("suffix_1", "")
        suffix_2 = kwargs.get("suffix_2", "")
        Seed = kwargs.get("Seed", True)
        #Include_Loras = kwargs.get("Include_Loras", True)
        delimiter = kwargs.get("delimiter", " ")
        auto_name = kwargs.get("auto_name", "Name")

        # Actual value inputs
        model_short = kwargs.get("model_short", "")
        model_name = kwargs.get("model_name", "")
        sampler_name = kwargs.get("sampler_name", "")
        scheduler_name = kwargs.get("scheduler_name", "")
        steps_value = kwargs.get("steps_value", 0)
        cfg_value = kwargs.get("cfg_value", 0.0)
        seed_value = kwargs.get("seed_value", 0)
        loras_value = kwargs.get("loras_value", "")
        prompt = kwargs.get("prompt", None)
        extra_pnginfo = kwargs.get("extra_pnginfo", None)

        # If no explicit loras token provided, try to auto-detect from the workflow like AUNSaveVideo
        try:
            if not loras_value:
                loras_value = AUNSaveVideo._build_loras_token(prompt, extra_pnginfo, "full")
        except Exception:
            loras_value = loras_value or ""

        Name = manual_name if name_mode else auto_name

        # Prepare path/name parts
        path_parts = []
        name_parts = []

        # Build path parts
        path_parts.append(MainFolder)
        if Date_Subfolder:
            path_parts.append(datetime.datetime.now().strftime('%Y-%m-%d'))
        path_parts.append(SubfolderA)
        path_parts.append(SubfolderB)

        # Normalize short-name values using model_utils helpers
        try:
            # If explicit short provided, use it; otherwise derive from full model name when available
            if model_short:
                model_short_resolved = get_model_short_name_common(model_short)
            elif model_name:
                model_short_resolved = get_model_short_name_common(model_name)
            else:
                model_short_resolved = ""
        except Exception:
            model_short_resolved = model_short or ""
        try:
            sampler_short = get_sampler_short_name(sampler_name) if sampler_name else ""
        except Exception:
            sampler_short = sampler_name or ""
        try:
            scheduler_short = get_scheduler_short_name(scheduler_name) if scheduler_name else ""
        except Exception:
            scheduler_short = scheduler_name or ""

        # sanitize resolved short names for safe filenames (match AUNSaveVideo behavior)
        model_short_resolved = _sanitize_token_str(model_short_resolved) if model_short_resolved else ""
        sampler_short = _sanitize_token_str(sampler_short) if sampler_short else ""
        scheduler_short = _sanitize_token_str(scheduler_short) if scheduler_short else ""

        # Build name parts
        if NameCrop and not name_mode:
            name_words = Name.split()
            if len(name_words) > 0:
                name_parts = [' '.join(name_words[:min(NameCropWords, len(name_words))])]
            else:
                name_parts = [Name]
        else:
            name_parts = [Name]

        # prefixes
        name_parts.append(prefix_1)
        name_parts.append(prefix_2)

        # actual token values
        if Model and model_short_resolved:
            name_parts.append(model_short_resolved)
        if Sampler and sampler_short:
            name_parts.append(sampler_short)
        if Scheduler and scheduler_short:
            name_parts.append(scheduler_short)
        if Steps:
            try:
                sv = int(steps_value)
            except Exception:
                sv = 0
            if sv > 0:
                name_parts.append(f"steps-{sv}")
        if Cfg:
            try:
                cv = float(cfg_value)
            except Exception:
                cv = 0.0
            # Only include cfg if > 0
            if cv > 0:
                # remove trailing .0 for integers
                if cv.is_integer():
                    cfg_str = f"cfg-{int(cv)}"
                else:
                    cfg_str = f"cfg-{cv}"
                name_parts.append(cfg_str)
        #if Include_Loras and loras_value:
        #    name_parts.append(loras_value)

        # suffixes
        name_parts.append(suffix_1)
        name_parts.append(suffix_2)

        if Seed:
            try:
                sd = int(seed_value)
            except Exception:
                sd = None
            if sd is not None:
                name_parts.append(f"seed-{sd}")

        # Filter out empty parts and join with delimiter
        filename = delimiter.join([p for p in name_parts if p not in (None, "")])
        path = os.path.join(*[p for p in path_parts if p not in (None, "")]) if path_parts else ""
        path_filename = os.path.join(path, filename) if path else filename

        # Build sidecar context (mirror of AUNSaveVideo minimal fields)
        sidecar_format = kwargs.get("sidecar_format", "Output only (text)")
        try:
            cfg_str = f"{float(cfg_value):.1f}" if cfg_value is not None else ""
        except Exception:
            cfg_str = str(cfg_value) if cfg_value is not None else ""

        # Determine full comfy output directory for sidecar path
        try:
            comfy_output_root = convert_relative_comfyui_path_to_full_path("output")
        except Exception:
            comfy_output_root = None

        full_output_dir_for_sidecar = os.path.join(comfy_output_root, path) if comfy_output_root and path else (comfy_output_root or path)

        # Sidecar: include full model name and shortened model name
        # Build PowerLoraLoader-style lines from workflow LoRAs for sidecar, and parse LoRAs into structured form
        _lora_power_lines = []
        try:
            _items = AUNSaveVideo._extract_loras(prompt, extra_pnginfo)
        except Exception:
            _items = []
        def _fmt_strength_display(value):
            try:
                if value is None:
                    return None
                return f"{float(value):.2f}"
            except Exception:
                return None
        for _it in _items or []:
            _raw = _it.get('name')
            if not _raw:
                continue
            _base = os.path.splitext(os.path.basename(str(_raw)))[0]
            if not _base:
                continue
            _sm = _it.get('strength')
            _sc = _it.get('strengthTwo') or _it.get('strength_clip')
            _sm_disp = _fmt_strength_display(_sm)
            _sc_disp = _fmt_strength_display(_sc)
            _tag = f"<lora:{_base}"
            if _sm_disp:
                _tag += f":{_sm_disp}"
            if _sc_disp:
                _tag += f":{_sc_disp}"
            _tag += ">"
            _lora_power_lines.append(_tag)

        _loras_sidecar = ""
        if _lora_power_lines:
            _formatted = "\n".join(line.strip() for line in _lora_power_lines)
            _loras_sidecar = f"PowerLoraLoader loras:\n{_formatted}".strip()

        sidecar_ctx = {
            "filename": f"{filename}",
            "seed": seed_value,
            "steps": steps_value,
            "cfg": cfg_str,
            "model": os.path.basename(model_name) if model_name else "",
            "model_short": model_short_resolved or "",
            "sampler_name": sampler_short or "",
            "scheduler": scheduler_short or "",
            # LoRA representation: human-readable PowerLoraLoader block
            "loras": _loras_sidecar,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

        def _format_sidecar(rec: dict, fmt: str) -> str:
            s = str(fmt or "").lower()
            if "json" in s:
                try:
                    return json.dumps(rec, indent=2, sort_keys=True)
                except Exception:
                    return str(rec)
            # text formatting
            lines = []
            for k, v in rec.items():
                try:
                    lines.append(f"{k}: {v}")
                except Exception:
                    lines.append(f"{k}: {str(v)}")
            return "\n".join(lines)

        sidecar_text = _format_sidecar(sidecar_ctx, sidecar_format)

        # If the user selected a save-to-file sidecar mode, write the sidecar next to the output path
        s = str(sidecar_format or "").lower()
        save_to_file = ("save" in s) or ("file" in s)
        fmt = "json" if "json" in s else "text"
        if save_to_file:
            try:
                ext = "json" if fmt == "json" else "txt"
                # Use the full filename (may include dots like 6.0) so we don't lose trailing tokens
                base = os.path.basename(filename) or "sidecar"
                # Write sidecar next to the comfyui output path
                target_dir = full_output_dir_for_sidecar or "."
                # Ensure directory exists
                try:
                    os.makedirs(target_dir, exist_ok=True)
                except Exception:
                    pass
                sidecar_path = os.path.join(target_dir, f"{base}.{ext}")
                # Write text (JSON string if json format)
                with open(sidecar_path, "w", encoding="utf-8") as fh:
                    fh.write(sidecar_text)
            except Exception:
                # Do not fail node on inability to write; keep returning sidecar text
                pass

        return (path_filename, sidecar_text,)

NODE_CLASS_MAPPINGS = {"AUNPathFilenameVideoResolved": AUNPathFilenameVideoResolved,
                    }

NODE_DISPLAY_NAME_MAPPINGS = {"AUNPathFilenameVideoResolved": "AUN Path Filename Video (Resolved)",}
