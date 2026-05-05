from typing import Any


STACK_LORA_NODE_NAMES = {
    "AUNLoraStackWithTriggers",
    "LoRA Stack With Triggers",
    "AUNLoraStackWithTriggersModelClip",
    "LoRA Stack With Triggers (Model+Clip)",
}


BASIC_LORA_TARGET_NAMES = {
    "Power Lora Loader (rgthree)",
    "RgthreePowerLoraLoader",
    "Power Lora Loader",
    "LoraLoader",
    "LoraLoaderModelOnly",
    *STACK_LORA_NODE_NAMES,
}


def coerce_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        text = value.strip().lower()
        if not text:
            return default
        if text in ("true", "1", "on", "yes"):
            return True
        if text in ("false", "0", "off", "no"):
            return False
    return bool(value)


def extract_basic_loras_from_inputs(inputs: dict[str, Any]) -> list[dict]:
    items: list[dict] = []
    try:
        # rgthree Power Lora Loader: lora_1, lora_2, etc. as dicts
        for key, val in inputs.items():
            k = str(key).lower()
            if k.startswith("lora_") and isinstance(val, dict):
                if val.get("on", False) and "lora" in val:
                    items.append(
                        {
                            "name": val.get("lora"),
                            "strength": val.get("strength", None),
                            "strengthTwo": val.get("strengthTwo", None),
                        }
                    )

        # AUN stack nodes: lora_1 + enabled_1 + strength_model_1 (+ strength_clip_1)
        if not items:
            stack_active = coerce_bool(inputs.get("apply_stack"), default=True)
            if not stack_active:
                return items
            for key, val in inputs.items():
                k = str(key).lower()
                if not k.startswith("lora_") or isinstance(val, dict):
                    continue
                if not isinstance(val, str):
                    continue
                lora_name = val.strip()
                if not lora_name or lora_name.lower() == "none":
                    continue
                idx = k.split("_")[-1]
                enabled_key = f"enabled_{idx}" if idx.isdigit() else "enabled"
                enabled_value = coerce_bool(inputs.get(enabled_key), default=False)
                if not enabled_value:
                    continue
                strength_key = f"strength_model_{idx}" if idx.isdigit() else "strength_model"
                clip_key = f"strength_clip_{idx}" if idx.isdigit() else "strength_clip"
                items.append(
                    {
                        "name": lora_name,
                        "strength": inputs.get(strength_key),
                        "strengthTwo": inputs.get(clip_key),
                    }
                )

        # Standard LoraLoader: lora_name, strength_model, strength_clip
        if not items:
            lora_name = inputs.get("lora_name") or inputs.get("lora")
            if lora_name and isinstance(lora_name, str):
                items.append(
                    {
                        "name": lora_name,
                        "strength": inputs.get("strength_model"),
                        "strengthTwo": inputs.get("strength_clip"),
                    }
                )
    except Exception:
        pass
    return items