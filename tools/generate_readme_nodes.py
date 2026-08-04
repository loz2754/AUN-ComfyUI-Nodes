from __future__ import annotations

import argparse
import ast
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


BEGIN_MARKER = "<!-- BEGIN: AUN_NODES_AUTO -->"
END_MARKER = "<!-- END: AUN_NODES_AUTO -->"


@dataclass(frozen=True)
class NodeInfo:
    key: str
    class_name: str
    display_name: str
    category: str


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _extract_dict_assignment(tree: ast.AST, name: str) -> ast.Dict:
    for node in getattr(tree, "body", []):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    if isinstance(node.value, ast.Dict):
                        return node.value
                    raise ValueError(f"{name} is not a dict literal")
    raise ValueError(f"{name} assignment not found")


def _extract_str(node: ast.AST) -> str:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    raise ValueError("expected string literal")


def _extract_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    raise ValueError("expected name")


def _parse_init(init_path: Path) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, str]]:
    """Returns (node_key->class_name, node_key->display_name, class_name->module_stem)."""

    init_text = _read_text(init_path)
    tree = ast.parse(init_text, filename=str(init_path))

    class_to_module: Dict[str, str] = {}
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and getattr(node, "level", 0) == 1 and node.module:
            module_stem = node.module
            for alias in node.names:
                class_to_module[alias.asname or alias.name] = module_stem

    node_class_dict = _extract_dict_assignment(tree, "NODE_CLASS_MAPPINGS")
    node_display_dict = _extract_dict_assignment(tree, "NODE_DISPLAY_NAME_MAPPINGS")

    node_key_to_class: Dict[str, str] = {}
    for k_node, v_node in zip(node_class_dict.keys, node_class_dict.values):
        if k_node is None or v_node is None:
            continue
        key = _extract_str(k_node)
        class_name = _extract_name(v_node)
        node_key_to_class[key] = class_name

    node_key_to_display: Dict[str, str] = {}
    for k_node, v_node in zip(node_display_dict.keys, node_display_dict.values):
        if k_node is None or v_node is None:
            continue
        key = _extract_str(k_node)
        try:
            display = _extract_str(v_node)
        except ValueError:
            display = key
        node_key_to_display[key] = display

    return node_key_to_class, node_key_to_display, class_to_module


def _extract_class_category(py_path: Path, class_name: str) -> Optional[str]:
    try:
        tree = ast.parse(_read_text(py_path), filename=str(py_path))
    except Exception:
        return None

    for node in getattr(tree, "body", []):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            for stmt in node.body:
                if isinstance(stmt, ast.Assign):
                    for target in stmt.targets:
                        if isinstance(target, ast.Name) and target.id == "CATEGORY":
                            if isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, str):
                                return stmt.value.value
            return None

    return None


def collect_registered_nodes(aun_dir: Path) -> List[NodeInfo]:
    init_path = aun_dir / "__init__.py"
    node_key_to_class, node_key_to_display, class_to_module = _parse_init(init_path)

    nodes: List[NodeInfo] = []
    for key, class_name in node_key_to_class.items():
        module_stem = class_to_module.get(class_name)
        category = None
        if module_stem:
            py_path = aun_dir / f"{module_stem}.py"
            if py_path.exists():
                category = _extract_class_category(py_path, class_name)

        nodes.append(
            NodeInfo(
                key=key,
                class_name=class_name,
                display_name=node_key_to_display.get(key, key),
                category=category or "(unknown)",
            )
        )

    return nodes


def _find_region(readme_text: str) -> Tuple[int, int]:
    begin = readme_text.find(BEGIN_MARKER)
    end = readme_text.find(END_MARKER)
    if begin == -1 or end == -1 or end < begin:
        raise SystemExit(
            f"Could not find region markers in the README.\n"
            f"The category section is expected between:\n"
            f"{BEGIN_MARKER}\n...\n{END_MARKER}\n"
        )
    return begin + len(BEGIN_MARKER), end


def check_drift(readme_path: Path, registered: List[NodeInfo]) -> Tuple[List[NodeInfo], List[Tuple[str, int]]]:
    """Returns (missing, stale) where stale items are (backticked token, 1-based line number)."""

    text = _read_text(readme_path)
    start, end = _find_region(text)
    region = text[start:end]
    registered_keys = {n.key for n in registered}

    missing = [n for n in registered if n.key not in region]

    stale: List[Tuple[str, int]] = []
    region_start_line = text[:start].count("\n") + 1
    token_re = re.compile(r"`(AUN[A-Za-z0-9]+)`")
    for offset, line in enumerate(region.split("\n")):
        for match in token_re.finditer(line):
            token = match.group(1)
            if token not in registered_keys:
                stale.append((token, region_start_line + offset))

    return missing, stale


def _report_human(nodes: List[NodeInfo], missing: List[NodeInfo], stale: List[Tuple[str, int]]) -> str:
    lines: List[str] = []
    if not missing and not stale:
        lines.append(f"OK: all {len(nodes)} registered nodes are documented in the README category section.")
        return "\n".join(lines)

    if missing:
        lines.append(f"Missing from README: {len(missing)} registered node(s) not documented:")
        for n in sorted(missing, key=lambda x: (x.category.lower(), x.key.lower())):
            lines.append(f"  - {n.display_name} (`{n.key}`) [category: {n.category}]")
    if stale:
        lines.append(f"Stale in README: {len(stale)} documented node reference(s) not registered:")
        for token, line_no in sorted(stale, key=lambda x: x[1]):
            lines.append(f"  - `{token}` (README line {line_no})")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Audit the README node/category section against the nodes actually registered in code. "
            "Read-only: never modifies files. Exits 1 if any drift is found."
        )
    )
    parser.add_argument(
        "--aun-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Path to the AUN folder (defaults to the parent of this script).",
    )
    parser.add_argument(
        "--readme",
        type=Path,
        default=None,
        help="Path to README.md (defaults to <aun-dir>/README.md).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print a machine-readable JSON report instead of human text.",
    )

    args = parser.parse_args()
    aun_dir: Path = args.aun_dir
    readme_path: Path = args.readme or (aun_dir / "README.md")

    nodes = collect_registered_nodes(aun_dir)
    missing, stale = check_drift(readme_path, nodes)
    ok = not missing and not stale

    if args.json:
        print(
            json.dumps(
                {
                    "ok": ok,
                    "scanned": len(nodes),
                    "missing": [
                        {"key": n.key, "display_name": n.display_name, "category": n.category}
                        for n in missing
                    ],
                    "stale": [{"token": token, "line": line_no} for token, line_no in stale],
                },
                indent=2,
            )
        )
        return 0 if ok else 1

    print(_report_human(nodes, missing, stale))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
