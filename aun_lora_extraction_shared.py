import re
from typing import Any


STACK_LORA_NODE_NAMES = {
    "AUNLoraStackWithTriggers",
    "LoRA Stack With Triggers",
    "AUNLoraStackWithTriggersModelClip",
    "LoRA Stack With Triggers (Model+Clip)",
}


PROMPT_INDEX_LORA_NODE_NAMES = {
    "AUNLoRAsByPromptIndex",
    "AUNRandomLoraModelOnlyMulti",
}


BASIC_LORA_TARGET_NAMES = {
    "Power Lora Loader (rgthree)",
    "RgthreePowerLoraLoader",
    "Power Lora Loader",
    "LoraLoader",
    "LoraLoaderModelOnly",
    *STACK_LORA_NODE_NAMES,
    *PROMPT_INDEX_LORA_NODE_NAMES,
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


_PROMPT_INDEX_SLOT_RE = re.compile(r"^p\d+_lora\d+$", re.IGNORECASE)


def _resolve_static_prompt_index(value: Any) -> int | None:
    """Return the prompt index when it is a literal, else None (linked input)."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def extract_prompt_index_loras_from_inputs(inputs: dict[str, Any]) -> list[dict]:
    """Extract LoRAs applied by an index-driven loader (AUNLoRAsByPromptIndex
    and its AUNRandomLoraModelOnlyMulti predecessor).

    Only the statically-known branch is reported: when ``prompt_index`` is
    driven by a link (range/random index node) the executed index is unknown
    when the prompt is built, so nothing is returned. In that case wire the
    node's runtime ``selected LoRAs`` output into a save node's
    ``selected_lora`` input.
    """
    if not isinstance(inputs, dict):
        return []
    if not any(_PROMPT_INDEX_SLOT_RE.match(str(key)) for key in inputs):
        return []
    if not coerce_bool(inputs.get("apply_lora"), default=True):
        return []
    index = _resolve_static_prompt_index(inputs.get("prompt_index"))
    if index is None:
        return []
    index = max(1, min(index, 20))

    items: list[dict] = []
    for slot in (1, 2, 3):
        name = inputs.get(f"p{index}_lora{slot}")
        if not isinstance(name, str):
            continue
        name = name.strip()
        if not name or name.lower() == "none":
            continue
        if not coerce_bool(inputs.get(f"p{index}_enabled{slot}"), default=True):
            continue
        items.append(
            {
                "name": name,
                "strength": inputs.get(f"p{index}_strength_model{slot}"),
                "strengthTwo": inputs.get(f"p{index}_strength_clip{slot}"),
            }
        )
    return items


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
        # Index-driven loaders: AUNLoRAsByPromptIndex / AUNRandomLoraModelOnlyMulti
        if not items:
            items.extend(extract_prompt_index_loras_from_inputs(inputs))
    except Exception:
        pass
    return items