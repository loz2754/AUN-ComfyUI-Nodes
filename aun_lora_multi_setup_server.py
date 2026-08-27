from __future__ import annotations

import json
import os
import re
from typing import Any

from aiohttp import web

import folder_paths
from server import PromptServer

_CONFIG_FOLDER_NAME = "aun"
_INVALID_FILENAME_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_WHITESPACE_RE = re.compile(r"\s+")


def _config_dir() -> str:
    return os.path.join(folder_paths.get_user_directory(), _CONFIG_FOLDER_NAME)


def _sanitize_filename(raw: str) -> str:
    name = str(raw or "").strip()
    name = _INVALID_FILENAME_RE.sub("", name)
    name = _WHITESPACE_RE.sub("_", name)
    name = name.strip(" .")
    name = name[:60]
    if not name:
        name = "prompts"
    if not name.lower().endswith(".json"):
        name = name + ".json"
    return name


def _safe_filename(raw: str) -> str:
    return _sanitize_filename(os.path.basename(str(raw or "")))


def _read_json_file(path: str) -> str | None:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
    except Exception:
        return None


@PromptServer.instance.routes.get("/aun/loras")
async def aun_loras_list(request: web.Request) -> web.Response:
    try:
        files = folder_paths.get_filename_list("loras") or []
    except Exception:
        files = []
    return web.json_response({"files": files})


@PromptServer.instance.routes.post("/aun/lora-multi-setup/save")
async def aun_lora_multi_setup_save(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}

    filename = _safe_filename(body.get("filename"))
    content = body.get("content")

    if isinstance(content, dict) or isinstance(content, list):
        content = json.dumps(content, indent=2, ensure_ascii=False)
    if not isinstance(content, str) or not content.strip():
        return web.json_response({"error": "No content to save."}, status=400)

    try:
        json.loads(content)
    except Exception as exc:
        return web.json_response({"error": f"Invalid JSON content: {exc}"}, status=400)

    save_dir = _config_dir()
    try:
        os.makedirs(save_dir, exist_ok=True)
        path = os.path.join(save_dir, filename)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(json.dumps(json.loads(content), indent=2, ensure_ascii=False) + "\n")
    except Exception as exc:
        return web.json_response({"error": f"Failed to save config: {exc}"}, status=500)

    return web.json_response({"path": path, "filename": filename})


@PromptServer.instance.routes.get("/aun/lora-multi-setup/list")
async def aun_lora_multi_setup_list(request: web.Request) -> web.Response:
    save_dir = _config_dir()
    files: list[dict[str, Any]] = []
    try:
        if os.path.isdir(save_dir):
            entries = []
            for name in os.listdir(save_dir):
                path = os.path.join(save_dir, name)
                if os.path.isfile(path) and name.lower().endswith(".json"):
                    entries.append((os.path.getmtime(path), name))
            entries.sort(key=lambda item: item[0], reverse=True)
            for _mtime, name in entries:
                files.append({"name": name})
    except Exception:
        files = []
    return web.json_response({"files": files})


@PromptServer.instance.routes.post("/aun/lora-multi-setup/load")
async def aun_lora_multi_setup_load(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}

    filename = _safe_filename(body.get("filename"))
    path = os.path.join(_config_dir(), filename)
    if not os.path.isfile(path):
        return web.json_response({"error": f"Config not found: {filename}"}, status=404)

    content = _read_json_file(path)
    if content is None:
        return web.json_response({"error": f"Failed to read config: {filename}"}, status=500)

    return web.json_response({"filename": filename, "content": content})


@PromptServer.instance.routes.post("/aun/lora-multi-setup/delete")
async def aun_lora_multi_setup_delete(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}

    filename = _safe_filename(body.get("filename"))
    path = os.path.join(_config_dir(), filename)
    if not os.path.isfile(path):
        return web.json_response({"error": f"Config not found: {filename}"}, status=404)

    try:
        os.remove(path)
    except Exception as exc:
        return web.json_response({"error": f"Failed to delete config: {exc}"}, status=500)

    return web.json_response({"filename": filename, "deleted": True})
