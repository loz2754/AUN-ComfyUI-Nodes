from __future__ import annotations

import argparse
import ast
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


AUN_ROOT = Path(__file__).resolve().parents[1]
INIT_PY = AUN_ROOT / "__init__.py"
DEFAULT_ALLOWLIST_PATH = Path(__file__).resolve().parent / "audit_allowlist.json"


@dataclass(frozen=True)
class InputIssue:
    section: str  # required/optional/hidden/unknown
    input_name: str
    reason: str


@dataclass(frozen=True)
class NodeReport:
    node_key: str
    class_name: str
    module_file: Optional[Path]
    has_description: bool
    input_issues: Tuple[InputIssue, ...]


def _parse_module(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _get_str_value(node: ast.AST) -> Optional[str]:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Str):
        return node.s
    return None


def _parse_init_registry(init_path: Path) -> Tuple[Dict[str, str], Dict[str, Path]]:
    """Returns (node_key->class_name, class_name->module_file)."""
    tree = _parse_module(init_path)

    class_to_module: Dict[str, Path] = {}

    for stmt in tree.body:
        # from .Foo import Bar
        if isinstance(stmt, ast.ImportFrom) and stmt.level == 1 and stmt.module:
            if not stmt.module:
                continue
            mod = stmt.module
            for alias in stmt.names:
                if alias.asname:
                    # registration uses the imported name; still treat original as class
                    class_name = alias.asname
                else:
                    class_name = alias.name
                # ignore wildcard imports
                if class_name == "*":
                    continue
                class_to_module[class_name] = (init_path.parent / f"{mod}.py")

    node_key_to_class: Dict[str, str] = {}

    for stmt in tree.body:
        if isinstance(stmt, ast.Assign):
            for target in stmt.targets:
                if isinstance(target, ast.Name) and target.id == "NODE_CLASS_MAPPINGS":
                    if isinstance(stmt.value, ast.Dict):
                        for k, v in zip(stmt.value.keys, stmt.value.values):
                            key = _get_str_value(k)
                            if not key:
                                continue
                            if isinstance(v, ast.Name):
                                node_key_to_class[key] = v.id
                            elif isinstance(v, ast.Attribute):
                                # uncommon, but handle e.g. module.Class
                                node_key_to_class[key] = v.attr
                    break

    return node_key_to_class, class_to_module


def _find_class(tree: ast.Module, class_name: str) -> Optional[ast.ClassDef]:
    for stmt in tree.body:
        if isinstance(stmt, ast.ClassDef) and stmt.name == class_name:
            return stmt
    return None


def _class_has_description(cls: ast.ClassDef) -> bool:
    for stmt in cls.body:
        if isinstance(stmt, ast.Assign):
            for t in stmt.targets:
                if isinstance(t, ast.Name) and t.id == "DESCRIPTION":
                    return _get_str_value(stmt.value) is not None
        if isinstance(stmt, ast.AnnAssign):
            if isinstance(stmt.target, ast.Name) and stmt.target.id == "DESCRIPTION":
                return _get_str_value(stmt.value) is not None
    return False


def _extract_input_types_return_dict(fn: ast.FunctionDef) -> Optional[ast.Dict]:
    # Find the first top-level `return {...}`.
    for stmt in fn.body:
        if isinstance(stmt, ast.Return):
            if isinstance(stmt.value, ast.Dict):
                return stmt.value
    return None


def _dict_get(d: ast.Dict, key: str) -> Optional[ast.AST]:
    for k, v in zip(d.keys, d.values):
        if _get_str_value(k) == key:
            return v
    return None


def _check_inputs_dict(section_name: str, node: ast.AST) -> List[InputIssue]:
    issues: List[InputIssue] = []
    if not isinstance(node, ast.Dict):
        return [
            InputIssue(
                section_name,
                "<section>",
                "UNVERIFIABLE: section is not a dict literal",
            )
        ]

    for k, v in zip(node.keys, node.values):
        input_name = _get_str_value(k)
        if not input_name:
            continue
        # Values should be tuples like (TYPE, {config}) or (TYPE, {config}, ...)
        if not isinstance(v, (ast.Tuple, ast.List)) or len(v.elts) < 2:
            issues.append(
                InputIssue(
                    section_name,
                    input_name,
                    "UNVERIFIABLE: input spec is not a tuple/list with a config dict",
                )
            )
            continue
        config = v.elts[1]
        if not isinstance(config, ast.Dict):
            issues.append(
                InputIssue(
                    section_name,
                    input_name,
                    "UNVERIFIABLE: config is not a dict literal",
                )
            )
            continue
        tooltip_val = _dict_get(config, "tooltip")
        if tooltip_val is None:
            issues.append(InputIssue(section_name, input_name, "missing tooltip"))
            continue
        if _get_str_value(tooltip_val) is None:
            issues.append(InputIssue(section_name, input_name, "tooltip is not a string literal"))
    return issues


def _audit_class(cls: ast.ClassDef) -> Tuple[bool, List[InputIssue]]:
    has_desc = _class_has_description(cls)

    # Find INPUT_TYPES method.
    input_fn: Optional[ast.FunctionDef] = None
    for stmt in cls.body:
        if isinstance(stmt, ast.FunctionDef) and stmt.name == "INPUT_TYPES":
            input_fn = stmt
            break

    if input_fn is None:
        return has_desc, [InputIssue("unknown", "INPUT_TYPES", "missing INPUT_TYPES")]

    ret = _extract_input_types_return_dict(input_fn)
    if ret is None:
        return has_desc, [
            InputIssue(
                "unknown",
                "INPUT_TYPES",
                "UNVERIFIABLE: INPUT_TYPES does not return a dict literal",
            )
        ]

    issues: List[InputIssue] = []
    required = _dict_get(ret, "required")
    optional = _dict_get(ret, "optional")

    if required is None:
        issues.append(InputIssue("required", "<section>", "missing required section"))
    else:
        if isinstance(required, ast.Dict):
            issues.extend(_check_inputs_dict("required", required))
        else:
            issues.append(InputIssue("required", "<section>", "UNVERIFIABLE: required is not a dict literal"))

    if optional is not None:
        if isinstance(optional, ast.Dict):
            issues.extend(_check_inputs_dict("optional", optional))
        else:
            issues.append(InputIssue("optional", "<section>", "UNVERIFIABLE: optional is not a dict literal"))

    return has_desc, issues


def main() -> int:
    ap = argparse.ArgumentParser(description="Audit AUN nodes for DESCRIPTION and per-input tooltips.")
    ap.add_argument("--json", action="store_true", help="Output machine-readable JSON (not implemented yet).")
    ap.add_argument("--fail-on-missing", action="store_true", help="Exit non-zero if any issues are found.")
    ap.add_argument(
        "--allowlist",
        type=Path,
        default=DEFAULT_ALLOWLIST_PATH if DEFAULT_ALLOWLIST_PATH.exists() else None,
        help=(
            "Path to an allowlist JSON file that can suppress UNVERIFIABLE reports for specific node keys. "
            "Defaults to tools/audit_allowlist.json when present."
        ),
    )
    args = ap.parse_args()

    allowed_unverifiable: set[str] = set()
    if args.allowlist is not None:
        try:
            raw = json.loads(args.allowlist.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                keys = raw.get("unverifiable_node_keys")
                if isinstance(keys, list):
                    allowed_unverifiable = {str(k) for k in keys if isinstance(k, (str, int, float))}
        except Exception as exc:
            print(f"Warning: could not read allowlist {args.allowlist}: {exc}")

    node_key_to_class, class_to_module = _parse_init_registry(INIT_PY)

    reports: List[NodeReport] = []

    for node_key in sorted(node_key_to_class.keys()):
        class_name = node_key_to_class[node_key]
        module_file = class_to_module.get(class_name)
        if module_file is None or not module_file.exists():
            reports.append(
                NodeReport(
                    node_key=node_key,
                    class_name=class_name,
                    module_file=module_file,
                    has_description=False,
                    input_issues=(InputIssue("unknown", "<module>", "cannot find module file for class"),),
                )
            )
            continue

        try:
            tree = _parse_module(module_file)
        except Exception as exc:
            reports.append(
                NodeReport(
                    node_key=node_key,
                    class_name=class_name,
                    module_file=module_file,
                    has_description=False,
                    input_issues=(InputIssue("unknown", "<module>", f"failed to parse module: {exc}"),),
                )
            )
            continue

        cls = _find_class(tree, class_name)
        if cls is None:
            reports.append(
                NodeReport(
                    node_key=node_key,
                    class_name=class_name,
                    module_file=module_file,
                    has_description=False,
                    input_issues=(InputIssue("unknown", "<class>", "class not found in module"),),
                )
            )
            continue

        has_desc, issues = _audit_class(cls)
        reports.append(
            NodeReport(
                node_key=node_key,
                class_name=class_name,
                module_file=module_file,
                has_description=has_desc,
                input_issues=tuple(issues),
            )
        )

    # Human-readable report
    total = len(reports)
    missing_desc = [r for r in reports if not r.has_description]
    with_issues = [r for r in reports if r.input_issues]

    def _is_unverifiable(issue: InputIssue) -> bool:
        return issue.reason.startswith("UNVERIFIABLE:")

    with_definite_issues = [
        r for r in reports if any(not _is_unverifiable(i) for i in r.input_issues)
    ]
    with_unverifiable = [
        r for r in reports if any(_is_unverifiable(i) for i in r.input_issues)
    ]

    allowed_unverifiable_reports = [r for r in with_unverifiable if r.node_key in allowed_unverifiable]
    remaining_unverifiable_reports = [r for r in with_unverifiable if r.node_key not in allowed_unverifiable]

    print(f"AUN docs audit: {total} nodes")
    print(f"- Missing DESCRIPTION: {len(missing_desc)}")
    print(f"- Nodes with missing tooltips/defs: {len(with_definite_issues)}")
    print(f"- Nodes needing manual review: {len(remaining_unverifiable_reports)}")
    if allowed_unverifiable_reports:
        print(f"- Allowed dynamic INPUT_TYPES: {len(allowed_unverifiable_reports)}")

    if missing_desc:
        print("\nMissing DESCRIPTION:")
        for r in missing_desc:
            mod = r.module_file.name if r.module_file else "<unknown>"
            print(f"- {r.node_key} ({r.class_name} in {mod})")

    if with_definite_issues:
        print("\nInput issues (definite):")
        for r in with_definite_issues:
            mod = r.module_file.name if r.module_file else "<unknown>"
            print(f"\n{r.node_key} ({r.class_name} in {mod})")
            for issue in r.input_issues:
                if not _is_unverifiable(issue):
                    print(f"  - [{issue.section}] {issue.input_name}: {issue.reason}")

    if remaining_unverifiable_reports:
        print("\nManual review (dynamic INPUT_TYPES):")
        for r in remaining_unverifiable_reports:
            mod = r.module_file.name if r.module_file else "<unknown>"
            print(f"\n{r.node_key} ({r.class_name} in {mod})")
            for issue in r.input_issues:
                if _is_unverifiable(issue):
                    print(f"  - [{issue.section}] {issue.input_name}: {issue.reason}")

    if allowed_unverifiable_reports:
        print("\nAllowed (suppressed) dynamic INPUT_TYPES:")
        for r in allowed_unverifiable_reports:
            mod = r.module_file.name if r.module_file else "<unknown>"
            print(f"- {r.node_key} ({r.class_name} in {mod})")

    any_definite_issues = bool(missing_desc or with_definite_issues)
    if args.fail_on_missing and any_definite_issues:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
