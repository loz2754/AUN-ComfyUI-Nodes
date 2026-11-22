"""Shared helpers for listing files inside the ComfyUI input directory.

Used by image loader nodes so their file combo shows images in subfolders of
ComfyUI/input as relative paths (e.g. "pixaroma/face 1.jpg"). Those relative
paths are resolved by folder_paths.get_annotated_filepath().
"""

import os
import re

import folder_paths

# Directories that should never be scanned for user media.
_SKIP_DIR_NAMES = {"__pycache__", "__MACOSX"}

_DEFAULT_MAX_ENTRIES = 10000


def _natural_sort_key(value: str):
    """Human order: 'John 2' < 'John 10' < 'John 101'."""
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", value)]


def list_input_images(max_depth: int | None = None, max_entries: int = _DEFAULT_MAX_ENTRIES) -> list[str]:
    """Return image files in the ComfyUI input directory as relative paths.

    - Recurses into subfolders (optionally limited by ``max_depth``; 0 = root only,
      1 = root plus one level of subfolders).
    - Paths always use forward slashes, e.g. ``subfolder/image.png``.
    - Root files sort first, then subfolders grouped alphabetically; each group is
      naturally sorted so ``2.png`` comes before ``10.png``.
    - Unreadable directories are skipped; the result is capped at ``max_entries``.
    """
    try:
        input_dir = folder_paths.get_input_directory()
    except Exception:
        return []

    if not input_dir or not os.path.isdir(input_dir):
        return []

    relative_paths: list[str] = []
    try:
        for root, dirs, files in os.walk(input_dir, onerror=lambda _err: None):
            # Prune hidden/system directories in place so os.walk does not descend.
            dirs[:] = [d for d in dirs if not d.startswith(".") and d not in _SKIP_DIR_NAMES]

            rel_root = os.path.relpath(root, input_dir)
            depth = 0 if rel_root == os.curdir else rel_root.count(os.sep) + 1
            if max_depth is not None and depth >= max_depth:
                dirs[:] = []

            for name in files:
                if name.startswith("."):
                    continue
                rel_path = name if rel_root == os.curdir else os.path.join(rel_root, name)
                relative_paths.append(rel_path.replace(os.sep, "/"))

            if len(relative_paths) >= max_entries:
                break
    except OSError:
        pass

    try:
        images = folder_paths.filter_files_content_types(relative_paths, ["image"])
    except Exception:
        # Older ComfyUI builds without the helper: fall back to extension matching.
        extensions = (".png", ".jpg", ".jpeg", ".jfif", ".webp", ".bmp", ".gif", ".tif", ".tiff")
        images = [p for p in relative_paths if p.lower().endswith(extensions)]

    images = images[:max_entries]
    images.sort(key=lambda p: (p.count("/"), _natural_sort_key(p)))
    return images
