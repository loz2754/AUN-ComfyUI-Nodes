import os
import random
import re
import time

import comfy.samplers
import comfy.sd
import comfy.utils
import folder_paths as comfy_paths
import torch

from .AUNResolutionHelper import ASPECT_RATIO_NAMES, ASPECT_MODE_OPTIONS, MEGAPIXELS_WIDGET, MULTIPLE_WIDGET, resolve_dimensions, apply_aspect_mode

class AnyType(str):

    def __ne__(self, __value: object) -> bool:
        return False

scheduler = AnyType("*")
sampler = AnyType("*")


class AUNInputsBasicSwitch:
    MAX_SLOTS = 20
    TEXT_KEYS = frozenset(f"text{i}" for i in range(1, MAX_SLOTS + 1))
    _rng = random.SystemRandom()
    _node_states = {}

    KNOWN_KEYS = {
        "model": ("STRING", ""),
        "sampler": ("STRING", ""),
        "scheduler": ("STRING", ""),
        "cfg": ("FLOAT", 2.0),
        "steps": ("INT", 10),
        "seed": ("INT", 0),
    }

    _KEY_VALUE_RE = re.compile(
        r"(?<!\S)([A-Za-z_][A-Za-z0-9_]*)="
        r'(?:"([^"]*)"|\'([^\']*)\'|([^\s"]+))'
    )

    @classmethod
    def INPUT_TYPES(cls):
        required = {
            "minimum": ("INT", {
                "default": 1,
                "min": 1,
                "max": cls.MAX_SLOTS,
                "tooltip": "Lowest text slot (1-20) that Increment and Random modes may select."
            }),
            "maximum": ("INT", {
                "default": 10,
                "min": 1,
                "max": cls.MAX_SLOTS,
                "tooltip": "Highest text slot (1-20) that Increment and Random modes may select."
            }),
            "mode": (["Select", "Increment", "Random", "Range"], {
                "default": "Select",
                "tooltip": "How the active text slot is chosen. Select = use the Index widget; Increment = step through the range each run; Random = random slot within the range; Range = pick from the Range list."
            }),
            "index": ("INT", {
                "default": 1,
                "min": 1,
                "max": cls.MAX_SLOTS,
                "step": 1,
                "tooltip": "The active text slot in Select mode - its text, label, and index are the outputs."
            }),
            "slot_count": ("INT", {
                "default": 2,
                "min": 1,
                "max": cls.MAX_SLOTS,
                "step": 1,
                "tooltip": "How many text slots are visible on the node. Hidden slots keep their values and remain selectable."
            }),
            "range": ("STRING", {
                "default": "1,2,5-8,12",
                "multiline": False,
                "tooltip": "In Range mode: comma-separated slots or ranges to pick from (e.g. 1, 2, 5-8, 12)."
            }),
        }

        for i in range(1, cls.MAX_SLOTS + 1):
            required[f"text{i}"] = ("STRING", {
                "multiline": True,
                "default": f"Slot {i}",
                "dynamicPrompts": True,
                "tooltip": f"The text content for slot {i}. Supports key=value tokens (model, sampler, scheduler, cfg, steps, seed) which are extracted and removed, overriding the matching loader widget values."
            })

        required.update({
            "ckpt_name": (comfy_paths.get_filename_list("checkpoints"), {"tooltip": "The checkpoint model file to load."}),
            "speed_lora": ("BOOLEAN", {"default": False, "label_on": "On", "label_off": "Off", "tooltip": "Enable or disable SpeedLoRA optimizations."}),
            "speed_lora_model": (comfy_paths.get_filename_list("loras") + ['None'], {"default": 'None', "tooltip": "The SpeedLoRA model to apply. Select 'None' to disable SpeedLoRA."}),
            "speed_lora_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 3.0, "step": 0.01, "round": 0.01, "tooltip": "Multiplier applied to the selected SpeedLoRA weights."}),
            "clip_skip": ("INT", {"default": -1, "min": -24, "max": -1, "step": 1, "tooltip": "Number of last layers of CLIP to skip. -1 is a good default."}),
            "sampler": (comfy.samplers.KSampler.SAMPLERS, {"tooltip": "The sampling algorithm to use."}),
            "scheduler": (comfy.samplers.KSampler.SCHEDULERS + ['AYS SDXL', 'AYS SD1', 'AYS SVD', 'GITS[coeff=1.2]'], {"tooltip": "The noise schedule to use."}),
            "cfg": ("FLOAT", {"default": 2.0, "min": -2.0, "max": 100.0, "step": 0.1, "round": 0.1, "tooltip": "Classifier-Free Guidance scale. Higher values increase prompt adherence."}),
            "steps": ("INT", {"default": 10, "min": 1, "max": 10000, "tooltip": "Number of sampling steps."}),
            "width": ("INT", {"default": 720, "min": 64, "max": 8192, "tooltip": "Image width. Used when 'aspect_ratio' is 'custom'."}),
            "height": ("INT", {"default": 720, "min": 64, "max": 8192, "tooltip": "Image height. Used when 'aspect_ratio' is 'custom'."}),
            "aspect_ratio": (ASPECT_RATIO_NAMES, {"tooltip": "Select a predefined aspect ratio or ratio to automatically set width and height."}),
            "aspect_mode": (ASPECT_MODE_OPTIONS, {"default": "Original", "tooltip": "Random swaps dimensions 50% of the time, Swap forces a swap, Original keeps the original order."}),
            "batch_size": ("INT", {"default": 1, "min": 1, "max": 64, "tooltip": "Number of latent images to generate in a batch."}),
            "seed": ("INT", {"default": 0, "min": -0xffffffffffffffff, "max": 0xffffffffffffffff, "tooltip": "The random seed for generation."}),
            "megapixels": MEGAPIXELS_WIDGET,
            "multiple": MULTIPLE_WIDGET,
        })

        return {
            "required": required,
            "optional": {},
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"}
        }

    RETURN_TYPES = (
        "MODEL", "CLIP", "VAE", "STRING",
        sampler,
        scheduler,
        "FLOAT",
        "INT",
        "LATENT",
        "INT",
        "INT",
        "INT",
        "INT",
        "STRING", "STRING", "INT",
    )
    RETURN_NAMES = (
        "MODEL",
        "CLIP",
        "VAE",
        "ckpt name",
        "sampler",
        "scheduler",
        "cfg",
        "steps",
        "latent",
        "width",
        "height",
        "seed",
        "batch size",
        "text",
        "label",
        "index",
    )
    FUNCTION = "switch_inputs"
    CATEGORY = "AUN Nodes/Loaders+Inputs"
    OUTPUT_NODE = True
    DESCRIPTION = ("All-in-one node combining a text index switch with AUN Inputs Basic: select one of up to 20 text slots, "
    "and load the checkpoint, latent and sampler settings in a single node. "
    "The selected text is scanned for key=value tokens (model, sampler, scheduler, cfg, steps, seed) which override the matching loader widgets and are removed from the text output."
    )

    def _clamp_slot_count(self, slot_count):
        return max(1, min(int(slot_count or 2), self.MAX_SLOTS))

    def _clamp_range(self, minimum, maximum, slot_count):
        max_slots = self._clamp_slot_count(slot_count)
        min_val = max(1, min(int(minimum or 1), max_slots))
        max_val = max(1, min(int(maximum or max_slots), max_slots))
        if min_val > max_val:
            min_val, max_val = max_val, min_val
        return min_val, max_val

    def _clamp_index(self, index, min_val, max_val):
        try:
            idx = int(index)
        except Exception:
            return min_val
        return max(min_val, min(idx, max_val))

    def _parse_range_string(self, range_str, min_val, max_val):
        valid_indices = []
        try:
            for part in str(range_str or "").split(","):
                part = part.strip()
                if not part:
                    continue
                if "-" in part:
                    start_str, end_str = part.split("-", 1)
                    start = int(start_str.strip())
                    end = int(end_str.strip())
                    if start > end:
                        start, end = end, start
                    valid_indices.extend(range(start, end + 1))
                else:
                    valid_indices.append(int(part))
        except Exception:
            pass

        valid_indices = [idx for idx in valid_indices if min_val <= idx <= max_val]
        valid_indices = sorted(set(valid_indices))
        if not valid_indices:
            valid_indices = [min_val]
        return valid_indices

    def _record_pginfo(self, extra_pnginfo, unique_id, payload):
        if not isinstance(extra_pnginfo, dict) or unique_id is None:
            return
        try:
            pginfo = extra_pnginfo.setdefault("aun_pginfo", {})
            if not isinstance(pginfo, dict):
                pginfo = {}
                extra_pnginfo["aun_pginfo"] = pginfo
            pginfo[str(unique_id)] = payload
        except Exception:
            pass

    def _emit_selected_index(self, unique_id, index, mode):
        if unique_id is None:
            return
        try:
            from server import PromptServer
            PromptServer.instance.send_sync(
                "AUN_random_text_index_selected",
                {
                    "node_id": str(unique_id),
                    "index": int(index),
                    "mode": str(mode),
                },
            )
        except Exception:
            pass

    def _parse_key_values(self, text):
        """Returns (extracted, cleaned_text).

        extracted: dict of lowercase key -> raw string value for known keys.
        cleaned_text: text with those known key=value tokens removed.
        """
        if not text:
            return {}, text
        extracted = {}
        spans = []
        for match in self._KEY_VALUE_RE.finditer(text):
            key = match.group(1).lower()
            if key not in self.KNOWN_KEYS:
                continue
            value = (
                match.group(2)
                if match.group(2) is not None
                else match.group(3)
                if match.group(3) is not None
                else match.group(4)
            )
            if value is not None:
                value = value.rstrip(",")
            extracted[key] = value
            spans.append(match.span())
        if not spans:
            return extracted, text
        cleaned = text
        for start, end in reversed(spans):
            cleaned = cleaned[:start] + cleaned[end:]
        cleaned = re.sub(r"[ \t]+", " ", cleaned)
        cleaned = re.sub(r"\n[ \t]+", "\n", cleaned)
        cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        return extracted, cleaned.strip()

    def _convert_value(self, key, raw):
        value_type, _default = self.KNOWN_KEYS[key]
        if raw is None:
            return None
        s = str(raw).strip()
        if not s:
            return None
        if value_type == "STRING":
            return s
        if value_type == "FLOAT":
            try:
                return float(s)
            except Exception:
                return None
        if value_type == "INT":
            try:
                return int(float(s))
            except Exception:
                return None
        return None

    @staticmethod
    def _clean_override(value):
        if value is None:
            return ""
        s = str(value).strip()
        return "" if s.lower() in ("", "none", "null") else s

    @staticmethod
    def _resolve_ckpt_name(override, current):
        override = AUNInputsBasicSwitch._clean_override(override)
        if not override:
            return current
        candidates = comfy_paths.get_filename_list("checkpoints")
        lowered = override.lower()
        for candidate in candidates:
            if candidate.lower() == lowered:
                return candidate
        for ext in (".safetensors", ".ckpt", ".pt", ".gguf"):
            for candidate in candidates:
                if candidate.lower() == (override + ext).lower():
                    return candidate
        for candidate in candidates:
            if os.path.basename(candidate).lower() == lowered:
                return candidate
        for ext in (".safetensors", ".ckpt", ".pt", ".gguf"):
            for candidate in candidates:
                if os.path.basename(candidate).lower() == (override + ext).lower():
                    return candidate
        print(f"AUNInputsBasicSwitch: checkpoint override '{override}' not found among {len(candidates)} installed checkpoints; falling back to widget value '{current}'.")
        return current

    def switch_inputs(self, minimum, maximum, mode, index, slot_count, range, ckpt_name,
                      speed_lora, speed_lora_model, speed_lora_strength, clip_skip,
                      sampler, scheduler, cfg, steps, width, height, aspect_ratio, aspect_mode,
                      batch_size, seed, megapixels=1.0, multiple=8,
                      unique_id=None, extra_pnginfo=None, **kwargs):

        if unique_id is None:
            unique_id = "default_node"
        slot_count = self._clamp_slot_count(slot_count)
        min_val, max_val = self._clamp_range(minimum, maximum, slot_count)
        index_val = self._clamp_index(index, 1, slot_count)

        if unique_id not in self._node_states:
            self._node_states[unique_id] = {
                "index": None,
                "range_index": 0
            }

        state = self._node_states[unique_id]

        if mode == "Random":
            final_index = self._rng.randint(min_val, max_val)
        elif mode == "Increment":
            if state["index"] is None:
                state["index"] = min_val - 1
            state["index"] += 1
            if state["index"] > max_val:
                state["index"] = min_val
            final_index = state["index"]
        elif mode == "Range":
            valid_indices = self._parse_range_string(range, min_val, max_val)
            if state["range_index"] >= len(valid_indices):
                state["range_index"] = 0
            final_index = valid_indices[state["range_index"]]
            state["range_index"] = (state["range_index"] + 1) % len(valid_indices)
        else:
            final_index = index_val

        key = f"text{final_index}"
        selected_text = kwargs.get(key, "") or ""
        extracted, cleaned_text = self._parse_key_values(selected_text)
        selected_label = key

        lines = cleaned_text.split("\n")
        first_line = lines[0].strip() if lines else ""
        if first_line:
            selected_label = first_line
            cleaned_text = "\n".join(lines[1:]).lstrip()

        self._emit_selected_index(unique_id, final_index, mode)

        self._record_pginfo(
            extra_pnginfo,
            unique_id,
            {
                "node": "AUNInputsBasicSwitch",
                "slot_count": slot_count,
                "index": final_index,
            },
        )

        model_input = self._clean_override(extracted.get("model"))
        sampler_input = self._clean_override(extracted.get("sampler"))
        scheduler_input = self._clean_override(extracted.get("scheduler"))
        cfg_input = extracted.get("cfg")
        steps_input = extracted.get("steps")
        seed_input = extracted.get("seed")

        cfg_converted = self._convert_value("cfg", cfg_input)
        steps_converted = self._convert_value("steps", steps_input)
        seed_converted = self._convert_value("seed", seed_input)

        ckpt_name = self._resolve_ckpt_name(model_input, ckpt_name)
        if sampler_input:
            sampler = sampler_input
        if scheduler_input:
            scheduler = scheduler_input
        if cfg_converted is not None:
            cfg = cfg_converted
        if steps_converted is not None:
            steps = steps_converted
        if seed_converted is not None:
            seed = seed_converted

        ckpt_path = comfy_paths.get_full_path("checkpoints", ckpt_name)
        out = comfy.sd.load_checkpoint_guess_config(ckpt_path, output_vae=True, output_clip=True, embedding_directory=comfy_paths.get_folder_paths("embeddings"))
        model, clip, vae = out[0], out[1], out[2]

        clip.clip_layer(clip_skip)

        if speed_lora:
            lora_choice = speed_lora_model if speed_lora_model not in (None, "", "None") else None
            if lora_choice:
                speed_lora_path = comfy_paths.get_full_path("loras", lora_choice)
                if speed_lora_path:
                    lora_weights = comfy.utils.load_torch_file(speed_lora_path, safe_load=True)
                    model, clip = comfy.sd.load_lora_for_models(model, clip, lora_weights, speed_lora_strength, 0.0)
                else:
                    print(f"AUNInputsBasicSwitch: SpeedLoRA model '{lora_choice}' not found; skipping SpeedLoRA load.")

        width, height = resolve_dimensions(width, height, aspect_ratio, megapixels, multiple)
        width, height = apply_aspect_mode(width, height, aspect_mode)

        latent = torch.zeros([batch_size, 4, height // 8, width // 8])

        return (model, clip, vae, os.path.splitext(os.path.basename(ckpt_name))[0],
                sampler, scheduler, cfg, steps, {"samples": latent}, width, height, seed,
                int(batch_size), cleaned_text, selected_label, final_index)

    @classmethod
    def IS_CHANGED(cls, minimum=None, maximum=None, mode=None, range=None, slot_count=None, index=None, **kwargs):
        if mode in ("Random", "Increment", "Range"):
            return time.time_ns()
        return (index, mode, slot_count, minimum, maximum, range,
                tuple(sorted((k, v) for k, v in kwargs.items() if k in cls.TEXT_KEYS)),
                tuple(sorted((k, v) for k, v in kwargs.items() if k not in cls.TEXT_KEYS)),
                )


NODE_CLASS_MAPPINGS = {
    "AUNInputsBasicSwitch": AUNInputsBasicSwitch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNInputsBasicSwitch": "Inputs Basic + Prompt Switch",
}
