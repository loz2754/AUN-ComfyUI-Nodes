"""Hold the browser and Python size planners to the same answers.

`web/aun_load_size.js` mirrors `aun_load_image_shared.plan_load_size` so the
node can show the size before a run. This tool runs both over a table of
cases and reports any difference.

Usage:
    python tools/check_load_size_parity.py
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import types
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
COMFY_ROOT = REPO.parents[1]
JS_FILE = REPO / "web" / "aun_load_size.js"

PACKAGE = "aun_parity_pkg"
MODULES = ("aun_bundle_shared", "aun_input_files_shared", "aun_load_image_shared")


def load_planner():
    if str(COMFY_ROOT) not in sys.path:
        sys.path.insert(0, str(COMFY_ROOT))
    if str(REPO) not in sys.path:
        sys.path.insert(0, str(REPO))

    package = types.ModuleType(PACKAGE)
    package.__path__ = [str(REPO)]
    sys.modules[PACKAGE] = package
    for name in MODULES:
        spec = importlib.util.spec_from_file_location(f"{PACKAGE}.{name}", REPO / f"{name}.py")
        module = importlib.util.module_from_spec(spec)
        sys.modules[f"{PACKAGE}.{name}"] = module
        spec.loader.exec_module(module)
    return sys.modules[f"{PACKAGE}.aun_load_image_shared"]


def build_cases():
    sources = [
        (1, 1), (16, 16), (800, 600), (1920, 1080), (1080, 1920),
        (333, 777), (4096, 512), (513, 513), (1000, 999),
    ]
    boxes = [(512, 512), (1024, 768), (768, 1024), (320, 240), (16, 16)]
    cases = []

    def add(source, **values):
        for multiple in (1, 8, 16):
            for enlarge in (True, False):
                for crop_from in ("center", "top left", "bottom right"):
                    merged = dict(values, multiple=multiple, enlarge=enlarge, crop_from=crop_from)
                    cases.append({"w": source[0], "h": source[1], "values": merged})

    for source in sources:
        add(source, size="off")
        for megapixels in (0.25, 1.0, 4.0):
            add(source, size="megapixels", megapixels=megapixels)
        for longest_side in (256, 1024, 4096):
            add(source, size="longest side", longest_side=longest_side)
        for scale in (0.5, 1.0, 2.0):
            add(source, size="scale", scale=scale)
        for width, height in boxes:
            add(source, size="fit inside", width=width, height=height)
            add(source, size="fit + pad", width=width, height=height)
            add(source, size="crop to fill", width=width, height=height)
            add(source, size="crop", width=width, height=height)
            add(source, size="stretch", width=width, height=height)
        for ratio in ("1:1", "16:9", "9:16", "4:3", "21:9", "width : height"):
            add(source, size="crop to ratio", ratio=ratio, width=1600, height=900)
        for base_resolution in (640, 1024):
            add(source, size="framepack bucket", base_resolution=base_resolution)
    return cases


def python_plans(planner, cases):
    plans = []
    for case in cases:
        plans.append(planner.plan_load_size(case["w"], case["h"], **case["values"]))
    return plans


def js_plans(cases):
    with tempfile.TemporaryDirectory(prefix="aun_parity_") as folder:
        module = Path(folder) / "aun_load_size.mjs"
        module.write_text(JS_FILE.read_text(encoding="utf-8"), encoding="utf-8")
        runner = Path(folder) / "run.mjs"
        runner.write_text(
            "import { planLoadSize } from './aun_load_size.mjs';\n"
            "let input = '';\n"
            "process.stdin.on('data', (chunk) => { input += chunk; });\n"
            "process.stdin.on('end', () => {\n"
            "  const cases = JSON.parse(input);\n"
            "  const plans = cases.map((item) => planLoadSize(item.w, item.h, item.values));\n"
            "  process.stdout.write(JSON.stringify(plans));\n"
            "});\n",
            encoding="utf-8",
        )
        result = subprocess.run(
            ["node", str(runner)],
            input=json.dumps(cases).encode("utf-8"),
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode("utf-8", "replace") or "node failed")
        return json.loads(result.stdout.decode("utf-8"))


def normalise(plan):
    return {
        "resizeWidth": plan["resize_width"],
        "resizeHeight": plan["resize_height"],
        "cropX": plan["crop_x"],
        "cropY": plan["crop_y"],
        "padLeft": plan["pad_left"],
        "padTop": plan["pad_top"],
        "padRight": plan["pad_right"],
        "padBottom": plan["pad_bottom"],
        "width": plan["width"],
        "height": plan["height"],
    }


def main():
    planner = load_planner()
    cases = build_cases()
    expected = [normalise(plan) for plan in python_plans(planner, cases)]
    actual = js_plans(cases)

    mismatches = 0
    for case, want, got in zip(cases, expected, actual):
        if want == got:
            continue
        mismatches += 1
        if mismatches <= 15:
            print(f"MISMATCH for {case['w']}x{case['h']} {case['values']}")
            print(f"  python: {want}")
            print(f"  js:     {got}")
    if mismatches:
        print(f"\n{mismatches} of {len(cases)} cases differ.")
        return 1
    print(f"Load size parity: {len(cases)} cases match. OK.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
