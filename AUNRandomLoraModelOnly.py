import random
import time

import comfy.sd
import comfy.utils
import folder_paths


class AUNRandomLoraModelOnly:
    MAX_LORAS = 10

    def __init__(self):
        self.index = None
        self.range_index = 0
        self._rng = random.SystemRandom()

    @classmethod
    def _lora_choices(cls):
        try:
            files = folder_paths.get_filename_list("loras")
        except Exception:
            files = []
        if not isinstance(files, list):
            files = []
        return ["None"] + files

    @classmethod
    def INPUT_TYPES(cls):
        choices = cls._lora_choices()
        required = {
            "model": ("MODEL",),
            "mode": (
                ["Select", "Increment", "Random", "Range"],
                {
                    "default": "Random",
                    "tooltip": "Select mode: fixed, incrementing, random, or explicit range list.",
                },
            ),
            "select": (
                "INT",
                {
                    "default": 1,
                    "min": 1,
                    "max": cls.MAX_LORAS,
                    "tooltip": "Fixed slot index for Select mode.",
                },
            ),
            "minimum": (
                "INT",
                {
                    "default": 1,
                    "min": 1,
                    "max": cls.MAX_LORAS,
                    "tooltip": "Minimum slot index for Increment/Random (inclusive).",
                },
            ),
            "maximum": (
                "INT",
                {
                    "default": 3,
                    "min": 1,
                    "max": cls.MAX_LORAS,
                    "tooltip": "Maximum slot index for Increment/Random (inclusive).",
                },
            ),
            "range": (
                "STRING",
                {
                    "default": "1,2,3",
                    "multiline": False,
                    "tooltip": "Comma-separated list or ranges for Range mode (for example 1,3,5-6).",
                },
            ),
            "apply_lora": (
                "BOOLEAN",
                {
                    "default": True,
                    "tooltip": "When disabled, returns the input model unchanged.",
                },
            ),
            "strength_model": (
                "FLOAT",
                {
                    "default": 1.0,
                    "min": -20.0,
                    "max": 20.0,
                    "step": 0.01,
                    "tooltip": "LoRA strength applied to the model.",
                },
            ),
            "base_prompt": (
                "STRING",
                {
                    "default": "",
                    "multiline": True,
                    "tooltip": "Optional prompt text appended after trigger words.",
                },
            ),
        }
        for i in range(1, cls.MAX_LORAS + 1):
            required[f"lora_{i}"] = (
                choices,
                {
                    "default": "None",
                    "tooltip": f"LoRA slot {i}.",
                },
            )
            required[f"trigger_{i}"] = (
                "STRING",
                {
                    "default": "",
                    "multiline": False,
                    "tooltip": f"Trigger words for LoRA slot {i}.",
                },
            )
        hidden = {
            "unique_id": "UNIQUE_ID",
        }
        return {"required": required, "hidden": hidden}

    RETURN_TYPES = ("MODEL", "STRING", "INT", "STRING", "STRING", "STRING")
    RETURN_NAMES = (
        "MODEL",
        "selected_lora",
        "index",
        "prefixed_label",
        "trigger_words",
        "prefixed_trigger_prompt",
    )
    FUNCTION = "load_random_lora"
    CATEGORY = "AUN Nodes/Utility"
    OUTPUT_NODE = False
    DESCRIPTION = (
        "Compact all-in-one random LoRA model loader with multiple selectable LoRA slots. "
        "TIP: Double-click the node or right-click and select 'Compact mode' to hide configuration widgets."
    )

    def _clamp_range(self, minimum, maximum, slot_count):
        min_val = max(1, min(int(minimum or 1), slot_count))
        max_val = max(1, min(int(maximum or slot_count), slot_count))
        if min_val > max_val:
            min_val, max_val = max_val, min_val
        return min_val, max_val

    def _clamp_index(self, index, min_val, max_val):
        if index is None:
            return min_val
        return max(min_val, min(int(index), max_val))

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
                    valid_indices.extend(list(range(start, end + 1)))
                else:
                    valid_indices.append(int(part))
        except Exception:
            pass

        valid_indices = [idx for idx in valid_indices if min_val <= idx <= max_val]
        if not valid_indices:
            valid_indices = [min_val]
        return sorted(set(valid_indices))

    def _build_slot_values(self, kwargs):
        values = []
        for i in range(1, self.MAX_LORAS + 1):
            key = f"lora_{i}"
            value = str(kwargs.get(key, "None") or "None").strip()
            values.append(value)
        return values

    def _build_trigger_values(self, kwargs):
        values = []
        for i in range(1, self.MAX_LORAS + 1):
            key = f"trigger_{i}"
            value = str(kwargs.get(key, "") or "").strip()
            values.append(value)
        return values

    def _compose_trigger_prompt(self, trigger_words, base_prompt):
        trigger = str(trigger_words or "").strip()
        base = str(base_prompt or "").strip()
        if trigger and base:
            return f"{trigger}, {base}"
        return trigger or base

    def _is_empty_slot(self, value):
        return not value or value == "None"

    def _emit_selected_lora(
        self,
        unique_id,
        selected_lora,
        index,
        mode,
        trigger_words="",
        strength_model=1.0,
        apply_lora=True,
    ):
        if unique_id is None:
            return
        try:
            from server import PromptServer  # type: ignore[import-not-found]

            node_id = (
                unique_id[0]
                if isinstance(unique_id, (list, tuple)) and unique_id
                else unique_id
            )
            PromptServer.instance.send_sync(
                "AUN_random_lora_selected",
                {
                    "node_id": str(node_id),
                    "selected_lora": str(selected_lora or "None"),
                    "index": int(index or 0),
                    "mode": str(mode),
                    "trigger_words": str(trigger_words or ""),
                    "strength_model": float(strength_model),
                    "apply_lora": bool(apply_lora),
                },
            )
        except Exception:
            pass

    def _find_next_filled_slot(self, slots, start_index):
        slot_count = len(slots)
        if slot_count <= 0:
            return None

        for step in range(slot_count):
            candidate = ((start_index - 1 + step) % slot_count) + 1
            if not self._is_empty_slot(slots[candidate - 1]):
                return candidate
        return None

    def _pick_index(self, mode, select, minimum, maximum, range_str, slot_count):
        min_val, max_val = self._clamp_range(minimum, maximum, slot_count)
        select_val = self._clamp_index(select, min_val, max_val)

        if mode == "Random":
            index = self._rng.randint(min_val, max_val)
        elif mode == "Increment":
            if self.index is None:
                self.index = min_val - 1
            self.index += 1
            if self.index > max_val:
                self.index = min_val
            index = self.index
        elif mode == "Range":
            valid_indices = self._parse_range_string(range_str, min_val, max_val)
            if self.range_index >= len(valid_indices):
                self.range_index = 0
            index = valid_indices[self.range_index]
            self.range_index = (self.range_index + 1) % len(valid_indices)
        else:
            index = select_val

        return index

    def load_random_lora(
        self,
        model,
        mode,
        select,
        minimum,
        maximum,
        range,
        apply_lora,
        strength_model,
        base_prompt,
        unique_id=None,
        **kwargs,
    ):
        slots = self._build_slot_values(kwargs)
        triggers = self._build_trigger_values(kwargs)
        slot_count = len(slots)
        index = self._pick_index(mode, select, minimum, maximum, range, slot_count)

        if self._is_empty_slot(slots[index - 1] if 1 <= index <= slot_count else "None"):
            fallback_index = self._find_next_filled_slot(slots, index)
            if fallback_index is not None:
                index = fallback_index
            else:
                # No usable LoRA in any slot: return model unchanged instead of raising.
                self._emit_selected_lora(
                    unique_id,
                    "None",
                    0,
                    mode,
                    "",
                    strength_model,
                    apply_lora,
                )
                return (model, "None", 0, "0-none", "", str(base_prompt or ""))

        selected_name = slots[index - 1] if 1 <= index <= slot_count else "None"
        selected_trigger = triggers[index - 1] if 1 <= index <= len(triggers) else ""
        composed_prompt = self._compose_trigger_prompt(selected_trigger, base_prompt)
        if self._is_empty_slot(selected_name):
            self._emit_selected_lora(
                unique_id,
                "None",
                0,
                mode,
                "",
                strength_model,
                apply_lora,
            )
            return (model, "None", 0, "0-none", "", str(base_prompt or ""))

        base = selected_name.split("/")[-1].split("\\")[-1]
        for ext in (".safetensors", ".ckpt", ".pt", ".bin"):
            if base.lower().endswith(ext):
                base = base[: -len(ext)]
                break

        prefixed_label = f"{index}-{base}"
        if not bool(apply_lora):
            self._emit_selected_lora(
                unique_id,
                selected_name,
                index,
                mode,
                selected_trigger,
                strength_model,
                apply_lora,
            )
            return (
                model,
                selected_name,
                index,
                prefixed_label,
                selected_trigger,
                composed_prompt,
            )

        lora_path = folder_paths.get_full_path("loras", selected_name)
        if not lora_path:
            self._emit_selected_lora(
                unique_id,
                selected_name,
                index,
                mode,
                selected_trigger,
                strength_model,
                apply_lora,
            )
            return (
                model,
                selected_name,
                index,
                f"{index}-missing",
                selected_trigger,
                composed_prompt,
            )

        try:
            lora_weights = comfy.utils.load_torch_file(lora_path, safe_load=True)
            loaded_model, _ = comfy.sd.load_lora_for_models(
                model,
                None,
                lora_weights,
                float(strength_model),
                0.0,
            )
        except Exception:
            self._emit_selected_lora(
                unique_id,
                selected_name,
                index,
                mode,
                selected_trigger,
                strength_model,
                apply_lora,
            )
            return (
                model,
                selected_name,
                index,
                f"{index}-error",
                selected_trigger,
                composed_prompt,
            )
        self._emit_selected_lora(
            unique_id,
            selected_name,
            index,
            mode,
            selected_trigger,
            strength_model,
            apply_lora,
        )
        return (
            loaded_model,
            selected_name,
            index,
            prefixed_label,
            selected_trigger,
            composed_prompt,
        )

    @classmethod
    def IS_CHANGED(
        cls,
        mode=None,
        select=None,
        minimum=None,
        maximum=None,
        range=None,
        apply_lora=None,
        strength_model=None,
        base_prompt=None,
        **kwargs,
    ):
        if mode in ["Random", "Increment", "Range"]:
            return time.time_ns()
        return (
            mode,
            select,
            minimum,
            maximum,
            range,
            apply_lora,
            strength_model,
            base_prompt,
            tuple(sorted(kwargs.items())),
        )


NODE_CLASS_MAPPINGS = {
    "AUNRandomLoraModelOnly": AUNRandomLoraModelOnly,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNRandomLoraModelOnly": "Random LoRA Model Loader (Compact)",
}
