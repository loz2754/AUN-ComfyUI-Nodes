from __future__ import annotations

import json
import os
from typing import Any

from aiohttp import web
from server import PromptServer

# Path to the source targets file so saved lists propagate back to it.
_TARGETS_JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web", "AUN_widget_config_targets.js")


def _read_file_targets() -> list:
    try:
        with open(_TARGETS_JS, "r", encoding="utf-8") as handle:
            src = handle.read()
        # extract the array contents
        import re
        m = re.search(r"WIDGET_CONFIG_TARGETS\s*=\s*\[(.*?)\]", src, re.S)
        if m:
            items = re.findall(r'"([^"]+)"', m.group(1))
            return [x.strip() for x in items if x.strip()]
    except Exception:
        pass
    return []


def _write_file_targets(names: list) -> None:
    lines = [
        "// Edit this list to enable the \"Configure widgets\" right-click menu on more nodes.",
        "// Add the node's class name (as registered in NODE_CLASS_MAPPINGS) to the array.",
        "// This file is auto-updated by the AUN Widget Config node.",
        "export const WIDGET_CONFIG_TARGETS = [",
    ]
    for n in names:
        lines.append(f'    "{n}",')
    lines.append("];")
    with open(_TARGETS_JS, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def _read() -> list:
    return _read_file_targets()


def _write(names: list) -> None:
    _write_file_targets(names)


@PromptServer.instance.routes.get("/aun/widget-config/targets")
async def aun_widget_config_get(request: web.Request) -> web.Response:
    return web.json_response({"targets": _read()})


@PromptServer.instance.routes.post("/aun/widget-config/save")
async def aun_widget_config_save(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    raw = body.get("targets", [])
    if isinstance(raw, str):
        raw = [x.strip() for x in raw.splitlines() if x.strip()]
    names = [str(x).strip() for x in (raw or []) if str(x).strip()]
    try:
        _write(names)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)
    return web.json_response({"targets": names})