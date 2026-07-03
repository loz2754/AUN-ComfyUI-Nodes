import comfy.sd
import comfy.utils
import folder_paths


class AUNLoraStackWithTriggers:
    MAX_SLOTS = 10

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
            "num_slots": (
                "INT",
                {
                    "default": 4,
                    "min": 1,
                    "max": cls.MAX_SLOTS,
                    "tooltip": "How many stack slots are active and visible.",
                },
            ),
            "apply_stack": (
                "BOOLEAN",
                {
                    "default": True,
                    "tooltip": "When disabled, returns the input model unchanged and suppresses trigger text outputs.",
                },
            ),
            "trigger_joiner": (
                "STRING",
                {
                    "default": ", ",
                    "multiline": False,
                    "tooltip": "String used to join trigger words from active slots.",
                },
            ),
            "dedupe_triggers": (
                "BOOLEAN",
                {
                    "default": True,
                    "tooltip": "Remove duplicate trigger entries across slots and base prompt while preserving order.",
                },
            ),
        }

        for i in range(1, cls.MAX_SLOTS + 1):
            required[f"lora_{i}"] = (
                choices,
                {
                    "default": "None",
                    "tooltip": f"LoRA file for slot {i}.",
                },
            )
            required[f"strength_model_{i}"] = (
                "FLOAT",
                {
                    "default": 1.0,
                    "min": -20.0,
                    "max": 20.0,
                    "step": 0.01,
                    "tooltip": f"Model strength for slot {i}.",
                },
            )
            required[f"enabled_{i}"] = (
                "BOOLEAN",
                {
                    "default": i == 1,
                    "tooltip": f"Enable LoRA slot {i}.",
                },
            )
            required[f"trigger_{i}"] = (
                "STRING",
                {
                    "default": "",
                    "multiline": False,
                    "tooltip": f"Trigger words for slot {i}.",
                },
            )

        optional = {
            "base_prompt": (
                "STRING",
                {
                    "default": "",
                    "multiline": True,
                    "forceInput": True,
                    "tooltip": "Optional prompt text appended after all active trigger words.",
                },
            ),
            "selected_LoRAs": (
                "STRING",
                {
                    "default": "",
                    "multiline": False,
                    "forceInput": True,
                    "tooltip": "Pass-through and concatenate selected_LoRAs text.",
                },
            ),
        }

        return {"required": required, "optional": optional}

    RETURN_TYPES = ("MODEL", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = (
        "MODEL",
        "selected LoRAs",
        "labels",
        "trigger words",
        "trigger + prompt",
    )
    FUNCTION = "load_stack"
    CATEGORY = "AUN Nodes/Loras"
    OUTPUT_NODE = False
    DESCRIPTION = (
        "[DEPRECATED] Stacks multiple LoRAs with per-slot trigger words. "
        "This node will be removed in a future release. Please use AUNLoraStackWithTriggersModelClip instead, "
        "which provides CLIP support, compact mode with overlay UI, and additional features. "
        "Use num_slots to show only the slots you need, and compact mode to keep the node small."
    )

    def _normalize_slot_count(self, num_slots):
        try:
            return max(1, min(int(num_slots or 1), self.MAX_SLOTS))
        except Exception:
            return 1

    def _is_empty_slot(self, value):
        return not value or value == "None"

    def _basename_label(self, value):
        base = str(value or "").replace("\\", "/").split("/")[-1]
        for ext in (".safetensors", ".ckpt", ".pt", ".bin"):
            if base.lower().endswith(ext):
                return base[: -len(ext)]
        return base

    def _compose_trigger_prompt(self, trigger_words, base_prompt, joiner):
        trigger = str(trigger_words or "").strip()
        base = str(base_prompt or "").strip()
        glue = str(joiner if joiner is not None else ", ")
        if trigger and base:
            trigger_parts = [p.strip() for p in trigger.split(glue) if p.strip()]
            base_parts = [p.strip() for p in base.split(",") if p.strip()]
            seen = set()
            deduped = []
            for part in trigger_parts + base_parts:
                key = part.lower()
                if key not in seen:
                    seen.add(key)
                    deduped.append(part)
            return glue.join(deduped)
        return trigger or base

    def _dedupe_trigger_parts(self, parts, dedupe_triggers):
        if not dedupe_triggers:
            return parts
        seen = set()
        result = []
        for part in parts:
            key = part.lower()
            if key in seen:
                continue
            seen.add(key)
            result.append(part)
        return result

    def _resolve_active_slots(self, num_slots, kwargs):
        slots = []
        slot_count = self._normalize_slot_count(num_slots)
        for i in range(1, slot_count + 1):
            enabled = bool(kwargs.get(f"enabled_{i}", False))
            lora_name = str(kwargs.get(f"lora_{i}", "None") or "None").strip()
            if not enabled or self._is_empty_slot(lora_name):
                continue
            trigger = str(kwargs.get(f"trigger_{i}", "") or "").strip()
            try:
                strength_model = float(kwargs.get(f"strength_model_{i}", 1.0) or 1.0)
            except Exception:
                strength_model = 1.0
            slots.append(
                {
                    "index": i,
                    "lora": lora_name,
                    "label": self._basename_label(lora_name),
                    "trigger": trigger,
                    "strength_model": strength_model,
                }
            )
        return slots

    def load_stack(
        self,
        model,
        num_slots,
        apply_stack,
        trigger_joiner,
        dedupe_triggers,
        base_prompt=None,
        selected_LoRAs="",
        **kwargs,
    ):
        active_slots = self._resolve_active_slots(num_slots, kwargs)
        base_prompt_text = str(base_prompt or "")
        upstream_loras = str(selected_LoRAs or "").strip()

        if not bool(apply_stack) or not active_slots:
            return (model, upstream_loras, "", "", base_prompt_text)

        trigger_parts = [item["trigger"] for item in active_slots if item["trigger"]]
        trigger_parts = self._dedupe_trigger_parts(trigger_parts, bool(dedupe_triggers))
        joiner = str(trigger_joiner if trigger_joiner is not None else ", ")
        trigger_words = joiner.join(trigger_parts)
        trigger_prompt = (
            self._compose_trigger_prompt(trigger_words, base_prompt, joiner)
            if trigger_words
            else base_prompt_text
        )
        labels = " + ".join(item["label"] for item in active_slots if item["label"])
        # Format: <lora:filename:model_strength>
        lora_tags = []
        for item in active_slots:
            if item["lora"] != "None":
                basename = item["lora"].split("/")[-1].split("\\")[-1]
                lora_tags.append(f"<lora:{basename}:{item['strength_model']:.2f}>")
        local_selected_loras = ", ".join(lora_tags)

        # Concatenate with upstream selected_LoRAs input if provided
        if upstream_loras:
            selected_loras = upstream_loras + ", " + local_selected_loras
        else:
            selected_loras = local_selected_loras

        loaded_model = model
        for item in active_slots:
            lora_path = folder_paths.get_full_path("loras", item["lora"])
            if not lora_path:
                continue
            try:
                lora_weights = comfy.utils.load_torch_file(lora_path, safe_load=True)
                loaded_model, _ = comfy.sd.load_lora_for_models(
                    loaded_model,
                    None,
                    lora_weights,
                    float(item["strength_model"]),
                    0.0,
                )
            except Exception:
                continue

        return (
            loaded_model,
            selected_loras,
            labels,
            trigger_words,
            trigger_prompt,
        )

    @classmethod
    def IS_CHANGED(
        cls,
        num_slots=None,
        apply_stack=None,
        base_prompt=None,
        trigger_joiner=None,
        dedupe_triggers=None,
        selected_LoRAs="",
        **kwargs,
    ):
        return (
            num_slots,
            apply_stack,
            base_prompt,
            trigger_joiner,
            dedupe_triggers,
            selected_LoRAs,
            tuple(sorted(kwargs.items())),
        )


NODE_CLASS_MAPPINGS = {
    "AUNLoraStackWithTriggers": AUNLoraStackWithTriggers,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNLoraStackWithTriggers": "LoRA Stack With Triggers",
}