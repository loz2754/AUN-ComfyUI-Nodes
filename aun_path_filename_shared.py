import datetime
import json
import os


PLACEHOLDER_TOKENS = {
    "date": "%date",
    "model_short": "%model_short",
    "sampler_name": "%sampler_name",
    "scheduler": "%scheduler",
    "steps": "%steps",
    "cfg": "%cfg",
    "seed": "%seed",
    "loras": "%loras",
}


PLACEHOLDER_TOKENS_VIDEO = {
    "date": "%date%",
    "model_short": "%model_short%",
    "sampler_name": "%sampler_name%",
    "scheduler": "%scheduler%",
    "steps": "%steps%",
    "cfg": "%cfg%",
    "seed": "%seed%",
    "loras": "%loras%",
}


def join_nonempty(parts, delimiter):
    return delimiter.join([part for part in parts if part not in (None, "")])


def build_path(main_folder, date_subfolder, subfolder_a, subfolder_b, current_date=None):
    path_parts = [main_folder]
    if date_subfolder:
        date_value = current_date or datetime.datetime.now().strftime("%Y-%m-%d")
        path_parts.append(date_value)
    path_parts.append(subfolder_a)
    path_parts.append(subfolder_b)
    return os.path.join(*[part for part in path_parts if part not in (None, "")])


def split_path_filename(path_filename):
    value = str(path_filename or "").strip()
    if not value:
        return "", ""
    normalized = value.replace("\\", "/").rstrip("/")
    if "/" not in normalized:
        return "", normalized
    path, filename = normalized.rsplit("/", 1)
    return path.replace("/", os.sep), filename


def strip_lora_filename_tokens(path_filename):
    value = str(path_filename or "")
    for token in ("%loras_group%", "%loras_group", "%loras%", "%loras"):
        value = value.replace(token, "")
    return value


def crop_name(name, max_num_words):
    """Crop name to max_num_words words. 0 means no cropping."""
    if not max_num_words or max_num_words <= 0:
        return name
    words = str(name).split()
    if not words:
        return name
    return " ".join(words[:min(max_num_words, len(words))])


def build_template_filename(
    base_name,
    delimiter,
    prefix_1="",
    prefix_2="",
    include_date=False,
    suffix_1="",
    suffix_2="",
    include_model=True,
    include_sampler=True,
    include_scheduler=True,
    include_steps=True,
    include_cfg=True,
    include_seed=True,
    include_loras=False,
    token_style="image",
):
    token_map = PLACEHOLDER_TOKENS_VIDEO

    name_parts = [base_name, prefix_1, prefix_2]
    if include_date:
        name_parts.append(token_map["date"])
    if include_model:
        name_parts.append(token_map["model_short"])
    if include_sampler:
        name_parts.append(token_map["sampler_name"])
    if include_scheduler:
        name_parts.append(token_map["scheduler"])
    if include_steps:
        if token_style == "video":
            name_parts.append(token_map["steps"])
        else:
            name_parts.append("steps_" + token_map["steps"])
    if include_cfg:
        if token_style == "video":
            name_parts.append(token_map["cfg"])
        else:
            name_parts.append("CFG_" + token_map["cfg"])
    if include_loras:
        name_parts.append(token_map["loras"])
    name_parts.extend([suffix_1, suffix_2])
    if include_seed:
        if token_style == "video":
            name_parts.append(token_map["seed"])
        else:
            name_parts.append("seed_" + token_map["seed"])
    return join_nonempty(name_parts, delimiter)


def format_resolved_tokens(
    model_short="",
    sampler_name="",
    scheduler_name="",
    steps_value=0,
    cfg_value=0.0,
    seed_value=0,
    loras_value="",
    date_value="",
):
    if date_value:
        resolved_date = str(date_value)
    else:
        resolved_date = datetime.datetime.now().strftime("%Y-%m-%d")

    try:
        steps_number = int(steps_value)
        steps_str = str(steps_number) if steps_number > 0 else ""
    except Exception:
        steps_str = ""

    try:
        cfg_number = float(cfg_value)
        if cfg_number > 0:
            cfg_str = str(int(cfg_number)) if cfg_number.is_integer() else str(cfg_number)
        else:
            cfg_str = ""
    except Exception:
        cfg_str = ""

    try:
        seed_str = str(int(seed_value))
    except Exception:
        seed_str = ""

    return {
        PLACEHOLDER_TOKENS["date"]: resolved_date,
        "%date": resolved_date,
        PLACEHOLDER_TOKENS["model_short"]: model_short,
        "%model_short": model_short,
        "%model": model_short,
        PLACEHOLDER_TOKENS["sampler_name"]: sampler_name,
        "%sampler_name": sampler_name,
        PLACEHOLDER_TOKENS["scheduler"]: scheduler_name,
        "%scheduler": scheduler_name,
        PLACEHOLDER_TOKENS["steps"]: steps_str,
        "%steps": steps_str,
        PLACEHOLDER_TOKENS["cfg"]: cfg_str,
        "%cfg": cfg_str,
        PLACEHOLDER_TOKENS["seed"]: seed_str,
        "%seed": seed_str,
        PLACEHOLDER_TOKENS["loras"]: loras_value,
        "%loras": loras_value,
        PLACEHOLDER_TOKENS_VIDEO["model_short"]: model_short,
        PLACEHOLDER_TOKENS_VIDEO["date"]: resolved_date,
        PLACEHOLDER_TOKENS_VIDEO["sampler_name"]: sampler_name,
        PLACEHOLDER_TOKENS_VIDEO["scheduler"]: scheduler_name,
        PLACEHOLDER_TOKENS_VIDEO["steps"]: steps_str,
        PLACEHOLDER_TOKENS_VIDEO["cfg"]: cfg_str,
        PLACEHOLDER_TOKENS_VIDEO["seed"]: seed_str,
        PLACEHOLDER_TOKENS_VIDEO["loras"]: loras_value,
    }


def resolve_template(template, replacements, delimiter):
    resolved = str(template)
    # Replace longer placeholders first so %token% is resolved before %token.
    for placeholder in sorted(replacements.keys(), key=len, reverse=True):
        value = replacements[placeholder]
        resolved = resolved.replace(placeholder, value or "")
    collapsed = [part for part in resolved.split(delimiter) if part]
    return delimiter.join(collapsed)


def build_sidecar_text(path, filename_template, resolved_filename, replacements):
    payload = {
        "path": path,
        "filename_template": filename_template,
        "resolved_filename": resolved_filename,
        "replacements": {
            key: value
            for key, value in replacements.items()
            if key in PLACEHOLDER_TOKENS.values() and value
        },
    }
    return json.dumps(payload, indent=2)