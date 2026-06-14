from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import struct
from typing import Any

from aiohttp import ClientError, ClientSession, ClientTimeout, web
from PIL import Image, ImageOps

import folder_paths
from server import PromptServer

_MAX_SAFETENSORS_HEADER = 8 * 1024 * 1024
_MAX_PREVIEWS = 6
_CIVITAI_LOOKUP_TIMEOUT = 5
_LORA_INFO_CACHE: dict[str, tuple[tuple[int, int], dict[str, Any]]] = {}
_CIVITAI_HASH_CACHE: dict[str, dict[str, Any] | None] = {}


def _safe_read_json(path: str) -> dict[str, Any] | None:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _safe_read_text(path: str, limit: int = 4000) -> str | None:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            text = handle.read(limit + 1)
        if len(text) > limit:
            text = text[:limit].rstrip() + "..."
        return text.strip() or None
    except Exception:
        return None


def _pick_first(mapping: dict[str, Any] | None, *keys: str) -> Any:
    if not isinstance(mapping, dict):
        return None
    lowered = {str(key).lower(): value for key, value in mapping.items()}
    for key in keys:
        if key in mapping:
            return mapping[key]
        lowered_key = key.lower()
        if lowered_key in lowered:
            return lowered[lowered_key]
    return None


def _normalize_words(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        result = []
        for item in value:
            text = str(item or "").strip()
            if text:
                result.append(text)
        return result
    text = str(value).strip()
    if not text:
        return []
    if "," in text:
        return [part.strip() for part in text.split(",") if part.strip()]
    return [text]


def _normalize_words_with_source(value: Any, source: str) -> list[dict[str, str]]:
    return [{"word": w, "source": source} for w in _normalize_words(value)]


def _append_unique_words(target: list[str], value: Any, seen: set[str]) -> None:
    for item in _normalize_words(value):
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        target.append(item)


def _merge_trained_words(*word_lists: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[str] = set()
    result: list[dict[str, str]] = []
    for word_list in word_lists:
        if not word_list:
            continue
        for entry in word_list:
            if not isinstance(entry, dict):
                continue
            word = str(entry.get("word") or "").strip()
            if not word:
                continue
            key = word.casefold()
            if key in seen:
                continue
            seen.add(key)
            result.append({"word": word, "source": str(entry.get("source") or "metadata")})
    return result


def _parse_jsonish(value: Any) -> Any:
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return json.loads(text)
        except Exception:
            return value
    return value


def _extract_tag_frequency_words(value: Any, limit: int = 32) -> list[str]:
    parsed = _parse_jsonish(value)
    if not isinstance(parsed, dict):
        return []

    counts: dict[str, float] = {}

    def add_count(tag: Any, count: Any) -> None:
        text = str(tag or "").strip()
        if not text:
            return
        try:
            numeric = float(count)
        except Exception:
            numeric = 0.0
        counts[text] = counts.get(text, 0.0) + numeric

    for key, inner_value in parsed.items():
        if isinstance(inner_value, dict):
            for tag, count in inner_value.items():
                add_count(tag, count)
            continue
        add_count(key, inner_value)

    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0].casefold()))
    return [tag for tag, _ in ranked[:limit]]


def _extract_trained_words_from_metadata(metadata: dict[str, Any]) -> list[dict[str, str]]:
    if not isinstance(metadata, dict):
        return []

    words: list[str] = []
    seen: set[str] = set()

    for key in (
        "trainedWords",
        "ss_trained_words",
        "ss_trigger_words",
        "trigger_words",
        "trigger phrase",
        "activation text",
        "activation_text",
        "modelspec.tags",
        "modelspec.trigger_phrase",
        "modelspec.trigger_words",
    ):
        _append_unique_words(words, _pick_first(metadata, key), seen)

    for key in ("ss_tag_frequency", "tag_frequency"):
        for item in _extract_tag_frequency_words(_pick_first(metadata, key)):
            lowered = item.casefold()
            if lowered in seen:
                continue
            seen.add(lowered)
            words.append(item)

    if not words:
        for key, value in metadata.items():
            key_text = str(key or "").strip().casefold()
            if not key_text:
                continue
            if not any(token in key_text for token in ("trained", "trigger", "activation", "tag")):
                continue
            if any(token in key_text for token in ("frequency", "bucket", "network_dim", "optimizer", "comment")):
                continue
            parsed = _parse_jsonish(value)
            if isinstance(parsed, dict):
                for item in _extract_tag_frequency_words(parsed):
                    lowered = item.casefold()
                    if lowered in seen:
                        continue
                    seen.add(lowered)
                    words.append(item)
                continue
            _append_unique_words(words, parsed, seen)

    return _normalize_words_with_source(words, "metadata")


def _format_value(value: Any, limit: int = 300) -> str | None:
    if value is None:
        return None
    if isinstance(value, (list, tuple, set)):
        text = ", ".join(str(item) for item in value if str(item).strip())
    elif isinstance(value, dict):
        try:
            text = json.dumps(value, ensure_ascii=False)
        except Exception:
            text = str(value)
    else:
        text = str(value)
    text = text.strip()
    if not text:
        return None
    if len(text) > limit:
        text = text[:limit].rstrip() + "..."
    return text


def _sha256_for_file(path: str) -> str:
    stat = os.stat(path)
    cache_key = (stat.st_mtime_ns, stat.st_size)
    cached = _LORA_INFO_CACHE.get(path)
    if cached and cached[0] == cache_key and cached[1].get("sha256"):
        return str(cached[1]["sha256"])

    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _read_safetensors_metadata(path: str) -> dict[str, Any]:
    try:
        with open(path, "rb") as handle:
            header_len_raw = handle.read(8)
            if len(header_len_raw) != 8:
                return {}
            header_len = struct.unpack("<Q", header_len_raw)[0]
            if header_len <= 0 or header_len > _MAX_SAFETENSORS_HEADER:
                return {}
            header = handle.read(header_len)
        decoded = json.loads(header.decode("utf-8"))
        metadata = decoded.get("__metadata__", {})
        return metadata if isinstance(metadata, dict) else {}
    except Exception:
        return {}


def _candidate_sidecars(path: str) -> list[str]:
    base_dir = os.path.dirname(path)
    basename = os.path.basename(path)
    stem, _ = os.path.splitext(basename)
    names = [
        f"{stem}.civitai.info",
        f"{basename}.civitai.info",
        f"{stem}.cm-info.json",
        f"{basename}.cm-info.json",
        f"{stem}.json",
        f"{stem}.txt",
    ]
    return [os.path.join(base_dir, name) for name in names]


def _aun_info_sidecar_path(path: str) -> str:
    base_dir = os.path.dirname(path)
    basename = os.path.basename(path)
    stem, _ = os.path.splitext(basename)
    return os.path.join(base_dir, f"{stem}.aun-info.json")


def _read_editable_fields(lora_path: str) -> dict[str, Any]:
    return _safe_read_json(_aun_info_sidecar_path(lora_path)) or {}


def _save_editable_fields(lora_path: str, fields: dict[str, Any]) -> dict[str, Any]:
    sidecar_path = _aun_info_sidecar_path(lora_path)
    merged = dict(_read_editable_fields(lora_path))
    for key in ("name", "strengthMin", "strengthMax", "additionalNotes", "notes"):
        if key in fields:
            merged[key] = fields[key]
    if merged:
        with open(sidecar_path, "w", encoding="utf-8") as handle:
            json.dump(merged, handle, indent=2, ensure_ascii=False)
    else:
        if os.path.exists(sidecar_path):
            os.remove(sidecar_path)
    return dict(merged)


def _collect_local_previews(path: str) -> list[dict[str, str]]:
    base_dir = os.path.dirname(path)
    basename = os.path.basename(path)
    stem, _ = os.path.splitext(basename)
    try:
        entries = sorted(os.listdir(base_dir))
    except Exception:
        return []

    image_exts = {".png", ".jpg", ".jpeg", ".webp"}
    matched: list[str] = []
    for entry in entries:
        full_path = os.path.join(base_dir, entry)
        if not os.path.isfile(full_path):
            continue
        entry_stem, entry_ext = os.path.splitext(entry)
        if entry_ext.lower() not in image_exts:
            continue
        if entry_stem == stem or entry_stem == basename or entry.startswith(stem + "."):
            matched.append(full_path)
    previews = []
    for full_path in matched[:_MAX_PREVIEWS]:
        data_url = _image_to_data_url(full_path)
        if not data_url:
            continue
        previews.append({
            "src": data_url,
            "label": os.path.basename(full_path),
            "type": "image",
        })
    return previews


def _image_to_data_url(path: str, max_size: int = 640) -> str | None:
    try:
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image)
            image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            has_alpha = "A" in image.getbands()
            if has_alpha:
                converted = image.convert("RGBA")
                fmt = "PNG"
                mime = "image/png"
            else:
                converted = image.convert("RGB")
                fmt = "JPEG"
                mime = "image/jpeg"
            buffer = io.BytesIO()
            save_kwargs = {"format": fmt}
            if fmt == "JPEG":
                save_kwargs.update({"quality": 88, "optimize": True})
            converted.save(buffer, **save_kwargs)
        encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
        return f"data:{mime};base64,{encoded}"
    except Exception:
        return None


def _extract_civitai_payload(info: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(info, dict):
        return {}

    model_info = info.get("model") if isinstance(info.get("model"), dict) else {}
    creator = model_info.get("creator") if isinstance(model_info.get("creator"), dict) else {}
    version_id = _pick_first(info, "id", "modelVersionId")
    model_id = _pick_first(info, "modelId") or _pick_first(model_info, "id")
    civitai_url = None
    if model_id and version_id:
        civitai_url = f"https://civitai.com/models/{model_id}?modelVersionId={version_id}"
    elif model_id:
        civitai_url = f"https://civitai.com/models/{model_id}"

    image_entries = info.get("images") if isinstance(info.get("images"), list) else []
    remote_previews = []
    for item in image_entries[:_MAX_PREVIEWS]:
        if not isinstance(item, dict):
            continue
        url = _pick_first(item, "url")
        if not url:
            continue
        item_type = str(_pick_first(item, "type", "name") or "").lower()
        raw_meta_val = item.get("meta")
        if isinstance(raw_meta_val, str):
            try:
                raw_meta = json.loads(raw_meta_val)
            except Exception:
                raw_meta = {}
        elif isinstance(raw_meta_val, dict):
            raw_meta = raw_meta_val
        else:
            raw_meta = {}
        meta = {}
        if raw_meta:
            meta_map = {
                "seed": (50, ("seed",)),
                "steps": (50, ("steps",)),
                "cfgScale": (50, ("cfgScale", "cfg", "cfg_scale")),
                "sampler": (200, ("sampler",)),
                "model": (200, ("model",)),
                "prompt": (2000, ("prompt",)),
                "negativePrompt": (2000, ("negativePrompt", "negative_prompt", "neg", "negPrompt")),
            }
            for meta_key, (meta_limit, alt_keys) in meta_map.items():
                val = _pick_first(raw_meta, *alt_keys)
                if val is not None:
                    formatted = _format_value(val, meta_limit)
                    if formatted:
                        meta[meta_key] = formatted

        remote_previews.append({
            "src": str(url),
            "label": _format_value(_pick_first(item, "type", "name")) or "Civitai preview",
            "type": "video" if item_type == "video" else "image",
            "meta": meta if meta else None,
        })

    return {
        "title": _format_value(_pick_first(info, "name"), 500),
        "base_model": _format_value(_pick_first(info, "baseModel"), 200),
        "trained_words": _normalize_words_with_source(_pick_first(info, "trainedWords"), "civitai"),
        "description": _format_value(_pick_first(info, "description"), 5000),
        "creator": _format_value(_pick_first(creator, "username", "name"), 200),
        "civitai_url": civitai_url,
        "remote_previews": remote_previews,
        "strength_min": _format_value(_pick_first(info, "strengthMin", "strength_min"), 50),
        "strength_max": _format_value(_pick_first(info, "strengthMax", "strength_max"), 50),
    }


async def _fetch_civitai_payload_by_hash(sha256: str) -> dict[str, Any]:
    normalized = str(sha256 or "").strip().lower()
    if len(normalized) != 64:
        return {}
    if normalized in _CIVITAI_HASH_CACHE:
        return dict(_CIVITAI_HASH_CACHE[normalized] or {})

    url = f"https://civitai.com/api/v1/model-versions/by-hash/{normalized}"
    timeout = ClientTimeout(total=_CIVITAI_LOOKUP_TIMEOUT)

    try:
        async with ClientSession(timeout=timeout) as session:
            async with session.get(
                url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "aun-comfyui-nodes/1.0",
                },
            ) as response:
                if response.status == 404:
                    _CIVITAI_HASH_CACHE[normalized] = None
                    return {}
                if response.status != 200:
                    return {}
                data = await response.json()
    except (ClientError, TimeoutError, json.JSONDecodeError):
        return {}
    except Exception:
        return {}

    payload = _extract_civitai_payload(data if isinstance(data, dict) else None)
    _CIVITAI_HASH_CACHE[normalized] = payload or None
    return dict(payload)


def _upsert_field(fields: list[dict[str, str]], label: str, value: Any, href: str | None = None) -> None:
    text = _format_value(value, 800)
    if not text:
        return
    entry = {"label": label, "value": text}
    if href:
        entry["href"] = href
    for index, field in enumerate(fields):
        if str(field.get("label") or "") == label:
            fields[index] = entry
            return
    fields.append(entry)


def _merge_live_civitai_payload(payload: dict[str, Any], civitai_payload: dict[str, Any]) -> dict[str, Any]:
    if not civitai_payload:
        return payload

    merged = dict(payload)
    merged["civitai_url"] = merged.get("civitai_url") or civitai_payload.get("civitai_url")

    existing_badges = [badge for badge in merged.get("badges", []) if badge]
    if not existing_badges:
        existing_badges = ["LoRA"]
    base_model = civitai_payload.get("base_model")
    if base_model and base_model not in existing_badges:
        existing_badges.append(base_model)
    merged["badges"] = existing_badges

    if not merged.get("previews"):
        merged["previews"] = civitai_payload.get("remote_previews") or []
    if not merged.get("notes"):
        merged["notes"] = civitai_payload.get("description")
    civitai_trained = civitai_payload.get("trained_words") or []
    existing_trained = merged.get("trained_words") or []
    if existing_trained:
        merged["trained_words"] = _merge_trained_words(civitai_trained, existing_trained)
    else:
        merged["trained_words"] = civitai_trained
    merged["civitai_source"] = "live-hash"
    merged["lookup_hint"] = "Civitai page found via live hash lookup."

    fields = list(merged.get("fields") or [])
    if merged.get("civitai_url"):
        _upsert_field(fields, "Civitai", "View on Civitai", merged.get("civitai_url"))
    _upsert_field(fields, "Author", civitai_payload.get("creator"))
    _upsert_field(fields, "Base Model", civitai_payload.get("base_model"))
    _upsert_field(fields, "Strength Min", civitai_payload.get("strength_min"))
    _upsert_field(fields, "Strength Max", civitai_payload.get("strength_max"))
    merged["fields"] = fields

    return merged


def _build_payload(lora_name: str, lora_path: str) -> dict[str, Any]:
    stat = os.stat(lora_path)
    cache_key = (stat.st_mtime_ns, stat.st_size)
    cached = _LORA_INFO_CACHE.get(lora_path)
    if cached and cached[0] == cache_key:
        payload = dict(cached[1])
        payload["requested_name"] = lora_name
        return payload

    basename = os.path.basename(lora_path)
    stem, _ = os.path.splitext(basename)
    safetensors_metadata = _read_safetensors_metadata(lora_path)

    civitai_info = None
    notes_text = None
    for sidecar_path in _candidate_sidecars(lora_path):
        if sidecar_path.lower().endswith(".txt"):
            notes_text = notes_text or _safe_read_text(sidecar_path)
            continue
        civitai_info = civitai_info or _safe_read_json(sidecar_path)

    civitai_payload = _extract_civitai_payload(civitai_info)
    title = (
        civitai_payload.get("title")
        or _format_value(_pick_first(safetensors_metadata, "modelspec.title", "ss_output_name"), 500)
        or stem
    )
    base_model = (
        civitai_payload.get("base_model")
        or _format_value(_pick_first(safetensors_metadata, "ss_base_model_version", "ss_sd_model_name"), 300)
    )
    metadata_trained = _extract_trained_words_from_metadata(safetensors_metadata)
    civitai_trained = civitai_payload.get("trained_words") or []
    trained_words = _merge_trained_words(civitai_trained, metadata_trained)

    fields: list[dict[str, Any]] = []

    def add_field(label: str, value: Any, href: str | None = None, editable: bool = False, edit_key: str | None = None) -> None:
        text = _format_value(value, 800) if not isinstance(value, list) else value
        if not text:
            return
        entry: dict[str, Any] = {"label": label, "value": text}
        if href:
            entry["href"] = href
        if editable:
            entry["editable"] = True
            entry["editKey"] = edit_key or label.lower().replace(" ", "_")
        fields.append(entry)

    add_field("File", lora_name)
    add_field("Hash (sha256)", _sha256_for_file(lora_path))
    add_field("Civitai", "View on Civitai", civitai_payload.get("civitai_url"))
    add_field("Name", title, editable=True, edit_key="name")
    add_field("Base Model", base_model)
    add_field("Author", civitai_payload.get("creator"))
    add_field("Output Name", _pick_first(safetensors_metadata, "ss_output_name"))
    add_field("Base Checkpoint", _pick_first(safetensors_metadata, "ss_sd_model_name"))
    add_field("Network Module", _pick_first(safetensors_metadata, "ss_network_module"))

    local_previews = _collect_local_previews(lora_path)
    remote_previews = civitai_payload.get("remote_previews") or []
    previews = local_previews[:]
    seen_srcs = {p.get("src") for p in previews if p.get("src")}
    for rp in remote_previews:
        if len(previews) >= _MAX_PREVIEWS:
            break
        src = rp.get("src")
        if src and src not in seen_srcs:
            seen_srcs.add(src)
            previews.append(rp)

    notes = (
        civitai_payload.get("description")
        or notes_text
        or _format_value(_pick_first(safetensors_metadata, "modelspec.description"), 5000)
    )

    add_field("Notes", _format_value(notes, 5000))

    editable_fields = _read_editable_fields(lora_path)
    user_name = editable_fields.get("name")
    user_strength_min = editable_fields.get("strengthMin")
    user_strength_max = editable_fields.get("strengthMax")
    user_additional_notes = editable_fields.get("additionalNotes")
    if user_additional_notes is None:
        user_additional_notes = editable_fields.get("notes")
    if "name" in editable_fields:
        title = str(user_name) if user_name else stem

    for field in fields:
        label = str(field.get("label") or "")
        if label == "Name" and "name" in editable_fields:
            field["value"] = str(user_name) if user_name else ""
            field["overridden"] = True

    user_fields = []
    def add_user_field(label, value, edit_key):
        user_fields.append({"label": label, "value": str(value) if value is not None else "", "editable": True, "editKey": edit_key})
    add_user_field("Strength Min", user_strength_min if "strengthMin" in editable_fields else (_format_value(civitai_payload.get("strength_min"), 50) or ""), "strengthMin")
    add_user_field("Strength Max", user_strength_max if "strengthMax" in editable_fields else (_format_value(civitai_payload.get("strength_max"), 50) or ""), "strengthMax")
    add_user_field("Additional Notes", user_additional_notes if user_additional_notes is not None else "", "additionalNotes")

    badges = ["LoRA"]
    if base_model:
        badges.append(base_model)

    payload = {
        "title": title,
        "badges": badges,
        "civitai_source": "local" if civitai_payload.get("civitai_url") else "none",
        "file": lora_name,
        "fields": fields,
        "user_fields": user_fields,
        "lookup_hint": "Civitai link came from local metadata." if civitai_payload.get("civitai_url") else "Checking Civitai by hash when needed.",
        "previews": previews,
        "requested_name": lora_name,
        "trained_words": trained_words,
        "sha256": _sha256_for_file(lora_path),
        "civitai_url": civitai_payload.get("civitai_url"),
    }
    _LORA_INFO_CACHE[lora_path] = (cache_key, payload)
    return dict(payload)


@PromptServer.instance.routes.post("/aun/lora-info")
async def aun_lora_info(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    lora_name = str((payload or {}).get("lora") or "").strip()
    if not lora_name or lora_name.lower() == "none":
        return web.json_response({"error": "No LoRA selected."}, status=400)

    lora_path = folder_paths.get_full_path("loras", lora_name)
    if not lora_path or not os.path.isfile(lora_path):
        return web.json_response({"error": f"LoRA not found: {lora_name}"}, status=404)

    try:
        payload = _build_payload(lora_name, lora_path)
        if not payload.get("civitai_url"):
            live_civitai_payload = await _fetch_civitai_payload_by_hash(payload.get("sha256", ""))
            if live_civitai_payload:
                payload = _merge_live_civitai_payload(payload, live_civitai_payload)
                stat = os.stat(lora_path)
                _LORA_INFO_CACHE[lora_path] = ((stat.st_mtime_ns, stat.st_size), dict(payload))
            else:
                payload["civitai_source"] = "none"
                payload["lookup_hint"] = "No Civitai match was found for this file hash."
        return web.json_response(payload)
    except Exception as exc:
        return web.json_response({"error": f"Failed to load LoRA info: {exc}"}, status=500)


@PromptServer.instance.routes.post("/aun/lora-info/save")
async def aun_lora_info_save(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        body = {}

    lora_name = str((body or {}).get("lora") or "").strip()
    if not lora_name or lora_name.lower() == "none":
        return web.json_response({"error": "No LoRA selected."}, status=400)

    lora_path = folder_paths.get_full_path("loras", lora_name)
    if not lora_path or not os.path.isfile(lora_path):
        return web.json_response({"error": f"LoRA not found: {lora_name}"}, status=404)

    try:
        edit_fields = body.get("fields") if isinstance(body.get("fields"), dict) else {}
        safe_fields = {}
        for key in ("name", "strengthMin", "strengthMax", "additionalNotes", "notes"):
            if key in edit_fields:
                raw = edit_fields[key]
                target = "additionalNotes" if key == "notes" else key
                safe_fields[target] = str(raw).strip() if raw is not None else ""

        _save_editable_fields(lora_path, safe_fields)
        _LORA_INFO_CACHE.pop(lora_path, None)

        payload = _build_payload(lora_name, lora_path)
        if not payload.get("civitai_url"):
            live_civitai_payload = await _fetch_civitai_payload_by_hash(payload.get("sha256", ""))
            if live_civitai_payload:
                payload = _merge_live_civitai_payload(payload, live_civitai_payload)
                stat = os.stat(lora_path)
                _LORA_INFO_CACHE[lora_path] = ((stat.st_mtime_ns, stat.st_size), dict(payload))

        return web.json_response(payload)
    except Exception as exc:
        return web.json_response({"error": f"Failed to save LoRA info: {exc}"}, status=500)
