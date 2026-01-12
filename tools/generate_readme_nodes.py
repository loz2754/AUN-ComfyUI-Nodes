from __future__ import annotations

import argparse
import ast
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

    # Map class name -> module name based on "from .Module import Class" imports
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
            # If the value isn't a string literal, fall back to the key.
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


def render_markdown(nodes: Iterable[NodeInfo]) -> str:
    by_cat: Dict[str, List[NodeInfo]] = {}
    for n in nodes:
        by_cat.setdefault(n.category, []).append(n)

    lines: List[str] = []
    lines.append("### ComfyUI Menu Categories (synced from registered nodes)")
    lines.append("")

    for cat in sorted(by_cat.keys(), key=lambda s: s.lower()):
        lines.append(f"#### {cat}")
        lines.append("")

        for n in sorted(by_cat[cat], key=lambda x: (x.display_name.lower(), x.key.lower())):
            if n.display_name == n.key:
                lines.append(f"- {n.key} (`{n.key}`)")
            else:
                lines.append(f"- {n.display_name} (`{n.key}`)")

        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def update_readme(readme_path: Path, generated_block: str) -> bool:
    text = _read_text(readme_path)

    begin = text.find(BEGIN_MARKER)
    end = text.find(END_MARKER)
    if begin == -1 or end == -1 or end < begin:
        raise SystemExit(
            f"Could not find markers in {readme_path}.\n"
            f"Add these lines around the auto-generated section:\n"
            f"{BEGIN_MARKER}\n...\n{END_MARKER}\n"
        )

    before = text[: begin + len(BEGIN_MARKER)]
    after = text[end:]

    new_text = before + "\n\n" + generated_block + "\n" + after
    changed = new_text != text
    if changed:
        readme_path.write_text(new_text, encoding="utf-8")
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Generate the AUN README node/category section from AUN/__init__.py and node CATEGORY values."
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
        "--stdout",
        action="store_true",
        help="Print the generated Markdown to stdout instead of editing README.md.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit with non-zero status if README.md would change.",
    )

    args = parser.parse_args()
    aun_dir: Path = args.aun_dir
    readme_path: Path = args.readme or (aun_dir / "README.md")

    nodes = collect_registered_nodes(aun_dir)
    block = render_markdown(nodes)

    if args.stdout:
        print(block)
        return 0

    changed = update_readme(readme_path, block)

    if args.check:
        return 1 if changed else 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
