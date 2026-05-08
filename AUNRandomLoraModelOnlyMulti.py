import comfy.sd
import comfy.utils
import folder_paths


class AUNRandomLoraModelOnlyMulti:
    MAX_PROMPTS = 20
    LORAS_PER_PROMPT = 3

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
            "prompt_index": (
                "INT",
                {
                    "default": 1,
                    "min": 1,
                    "max": cls.MAX_PROMPTS,
                    "tooltip": "Prompt index (1-20) determines which LoRAs to apply.",
                },
            ),
            "num_prompts": (
                "INT",
                {
                    "default": 5,
                    "min": 1,
                    "max": cls.MAX_PROMPTS,
                    "tooltip": "Number of prompts to configure (1-20).",
                },
            ),
            "apply_lora": (
                "BOOLEAN",
                {
                    "default": True,
                    "tooltip": "When disabled, returns the input model unchanged.",
                },
            ),
        }
        optional = {
            "clip": ("CLIP",),
            "base_prompt": (
                "STRING",
                {
                    "default": "",
                    "multiline": True,
                    "forceInput": True,
                    "tooltip": "Optional prompt text appended after trigger words.",
                },
            ),
        }
        
        # Add slots for each prompt (1-20)
        for p in range(1, cls.MAX_PROMPTS + 1):
            # Add 3 LoRA slots per prompt
            for s in range(1, cls.LORAS_PER_PROMPT + 1):
                required[f"p{p}_lora{s}"] = (
                    choices,
                    {
                        "default": "None",
                        "tooltip": f"Prompt {p}, LoRA slot {s}.",
                    },
                )
                required[f"p{p}_strength_model{s}"] = (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": -20.0,
                        "max": 20.0,
                        "step": 0.01,
                        "tooltip": f"Prompt {p}, LoRA {s} model strength.",
                    },
                )
                required[f"p{p}_strength_clip{s}"] = (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": -20.0,
                        "max": 20.0,
                        "step": 0.01,
                        "tooltip": f"Prompt {p}, LoRA {s} clip strength.",
                    },
                )
                required[f"p{p}_trigger{s}"] = (
                    "STRING",
                    {
                        "default": "",
                        "multiline": False,
                        "tooltip": f"Prompt {p}, LoRA {s} trigger words.",
                    },
                )

        hidden = {
            "unique_id": "UNIQUE_ID",
        }
        return {"required": required, "optional": optional, "hidden": hidden}

    RETURN_TYPES = ("MODEL", "CLIP", "STRING", "INT", "STRING", "STRING", "STRING")
    RETURN_NAMES = (
        "MODEL",
        "CLIP",
        "selected loras",
        "prompt_index",
        "lora_labels",
        "trigger words",
        "trigger + prompt",
    )
    FUNCTION = "load_loras_for_prompt"
    CATEGORY = "AUN Nodes/Utility"
    OUTPUT_NODE = False
    DESCRIPTION = (
        "Experimental multi-LoRA loader where prompt index determines which 1-3 LoRAs to apply. "
        "Each prompt can have different LoRAs and strengths applied sequentially to the same model+clip. "
        "Double-click to toggle compact mode for quick preview. "
        "Right-click menu: Hide/Show clip strength, Hide/Show footer with trigger words."
    )

    def _is_empty_slot(self, value):
        return not value or value == "None"

    def _normalize_node_id(self, unique_id):
        value = unique_id
        if isinstance(value, (list, tuple)) and value:
            value = value[0]
        if isinstance(value, dict):
            value = value.get("node_id", value.get("id", value))
        text = str(value or "").strip()
        if not text:
            return None
        if text.isdigit():
            return int(text)
        return text

    def _compose_trigger_prompt(self, trigger_words, base_prompt):
        trigger = str(trigger_words or "").strip()
        base = str(base_prompt or "").strip()
        if trigger and base:
            return f"{trigger}, {base}"
        return trigger or base

    def _emit_selected_loras(
        self,
        unique_id,
        prompt_index,
        selected_loras,
        lora_labels,
        trigger_words_list,
        apply_lora=True,
    ):
        if unique_id is None:
            return
        try:
            from server import PromptServer  # type: ignore[import-not-found]

            node_id = self._normalize_node_id(unique_id)
            if node_id is None:
                return
            PromptServer.instance.send_sync(
                "AUN_random_lora_multi_selected",
                {
                    "node_id": str(node_id),
                    "prompt_index": int(prompt_index or 0),
                    "selected_loras": [str(l or "None") for l in selected_loras],
                    "lora_labels": [str(l or "none") for l in lora_labels],
                    "trigger_words_list": [str(t or "") for t in trigger_words_list],
                    "apply_lora": bool(apply_lora),
                },
            )
        except Exception:
            pass

    def load_loras_for_prompt(
        self,
        model,
        prompt_index,
        apply_lora,
        unique_id=None,
        clip=None,
        **kwargs,
    ):
        base_prompt = kwargs.get("base_prompt", "")
        
        # Clamp prompt index
        prompt_idx = max(1, min(int(prompt_index or 1), self.MAX_PROMPTS))
        
        # If apply_lora is disabled, return early
        if not bool(apply_lora):
            self._emit_selected_loras(
                unique_id,
                prompt_idx,
                [],
                [],
                [],
                apply_lora,
            )
            return (model, clip, "None", prompt_idx, "", "", str(base_prompt or ""))

        # Gather LoRAs for this prompt
        selected_loras = []
        selected_strengths_model = []
        selected_strengths_clip = []
        selected_triggers = []

        for s in range(1, self.LORAS_PER_PROMPT + 1):
            lora_key = f"p{prompt_idx}_lora{s}"
            strength_model_key = f"p{prompt_idx}_strength_model{s}"
            strength_clip_key = f"p{prompt_idx}_strength_clip{s}"
            trigger_key = f"p{prompt_idx}_trigger{s}"

            lora_name = str(kwargs.get(lora_key, "None") or "None").strip()
            strength_model = float(kwargs.get(strength_model_key, 1.0) or 1.0)
            strength_clip = float(kwargs.get(strength_clip_key, 1.0) or 1.0)
            trigger_words = str(kwargs.get(trigger_key, "") or "").strip()

            if not self._is_empty_slot(lora_name):
                selected_loras.append(lora_name)
                selected_strengths_model.append(strength_model)
                selected_strengths_clip.append(strength_clip)
                selected_triggers.append(trigger_words)

        # If no LoRAs found, return model unchanged
        if not selected_loras:
            self._emit_selected_loras(
                unique_id,
                prompt_idx,
                [],
                [],
                [],
                apply_lora,
            )
            return (model, clip, "None", prompt_idx, "", "", str(base_prompt or ""))

        # Apply LoRAs sequentially
        current_model = model
        current_clip = clip
        lora_labels = []
        all_triggers = []

        for i, (lora_name, strength_m, strength_c, trigger) in enumerate(
            zip(
                selected_loras,
                selected_strengths_model,
                selected_strengths_clip,
                selected_triggers,
            )
        ):
            lora_path = folder_paths.get_full_path("loras", lora_name)
            if not lora_path:
                lora_labels.append("missing")
                all_triggers.append(trigger)
                continue

            try:
                lora_weights = comfy.utils.load_torch_file(lora_path, safe_load=True)
                current_model, current_clip = comfy.sd.load_lora_for_models(
                    current_model,
                    current_clip,
                    lora_weights,
                    float(strength_m),
                    float(strength_c) if current_clip is not None else 0.0,
                )
                # Extract basename for label
                base = lora_name.split("/")[-1].split("\\")[-1]
                for ext in (".safetensors", ".ckpt", ".pt", ".bin"):
                    if base.lower().endswith(ext):
                        base = base[: -len(ext)]
                        break
                lora_labels.append(base)
                all_triggers.append(trigger)
            except Exception:
                lora_labels.append("error")
                all_triggers.append(trigger)

        # Compose output strings
        selected_loras_str = ", ".join(selected_loras)
        lora_labels_str = ", ".join(lora_labels)
        combined_triggers = ", ".join([t for t in all_triggers if t])
        composed_prompt = self._compose_trigger_prompt(combined_triggers, base_prompt)

        self._emit_selected_loras(
            unique_id,
            prompt_idx,
            selected_loras,
            lora_labels,
            all_triggers,
            apply_lora,
        )

        return (
            current_model,
            current_clip,
            selected_loras_str,
            prompt_idx,
            lora_labels_str,
            combined_triggers,
            composed_prompt,
        )


NODE_CLASS_MAPPINGS = {
    "AUNRandomLoraModelOnlyMulti": AUNRandomLoraModelOnlyMulti,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNRandomLoraModelOnlyMulti": "AUN Random Lora Model Only Multi (Experimental)",
}
