#!/usr/bin/env python
"""Embed a ComfyUI workflow JSON into a workflow PNG as a tEXt chunk.

ComfyUI stores the loadable workflow in a PNG tEXt chunk with the keyword
"workflow". Node-screenshot captures (e.g. DevTools "Capture node screenshot")
do not include it, so the resulting image cannot be dropped back onto the
ComfyUI canvas. This tool injects the JSON from a workflow file into the PNG
right after the IHDR chunk so the image becomes a loadable workflow again.
"""

import argparse
import binascii
import json
import struct
import sys
from pathlib import Path


def chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", binascii.crc32(kind + data) & 0xFFFFFFFF)
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("workflow", type=Path, help="ComfyUI workflow JSON file")
    ap.add_argument("png", type=Path, help="PNG image to embed the workflow into")
    ap.add_argument("--out", type=Path, help="output path (default: overwrite the PNG)")
    args = ap.parse_args()

    wf = json.dumps(json.loads(args.workflow.read_text(encoding="utf-8")))
    data = args.png.read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        print(f"error: {args.png} is not a PNG", file=sys.stderr)
        return 1

    pos = 8
    insert = None
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        if kind == b"IHDR":
            insert = pos + 12 + ln
            break
        pos += 12 + ln
    if insert is None:
        print(f"error: no IHDR chunk in {args.png}", file=sys.stderr)
        return 1

    new_chunk = chunk(b"tEXt", b"workflow\x00" + wf.encode("utf-8"))
    target = args.out or args.png
    target.write_bytes(data[:insert] + new_chunk + data[insert:])
    print(f"embedded workflow ({len(wf)} bytes) into {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
