"""Pack values from other nodes into one bundle, with or without wires.

A bundle is a plain name/value dict, so anything can travel in it. This
node is the collecting end: each field is either

* **wired** — an ordinary link into one of the ``in_N`` sockets, or
* **wireless** — a node output picked in the Sources… dialog, which the
  browser turns into an ``in_N`` link when the prompt is built.

Both kinds share the same slot pool, so the server only ever sees ordinary
linked inputs. ``names`` says what each field is called and ``plan`` says
which slot feeds each line (``null`` when a field is switched off), which
is what lets one order cover wired and wireless fields alike.

The output is a normal bundle: Split Bundle, Merge Bundles, an OBVPM
Unbundle or a KJ Get can read it. Because a wireless source becomes a real
upstream dependency, it always runs — unlike a wired bundle, which can
stay lazy on the branch it sits on.
"""

import json

from .aun_bundle_shared import BUNDLE
from .logger import logger


class AlwaysEqualProxy(str):
    """Wildcard type: connects to any input, like `*`."""

    def __eq__(self, other):
        return True

    def __ne__(self, other):
        return False


any_type = AlwaysEqualProxy("*")

MAX_FIELDS = 32
"mirrored in web/AUN_wireless_bundle.js"


def _lines(text):
    return [
        line.strip()
        for line in str(text or "").splitlines()
        if line.strip()
    ]


def _slots(raw, count):
    """The slot for each name line, or by position when there is no plan."""
    fallback = list(range(1, count + 1))
    text = str(raw or "").strip()
    if not text:
        return fallback
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        return fallback
    if not isinstance(data, list):
        return fallback

    slots = []
    for value in data[:count]:
        if value is None:
            slots.append(None)
            continue
        try:
            slots.append(int(value))
        except (TypeError, ValueError):
            slots.append(None)
    return slots + fallback[len(slots):]


class AUNWirelessBundle:
    """Several values on one wire, chosen from the graph instead of wired."""

    CATEGORY = "AUN Nodes/Utility"
    FUNCTION = "pack"
    RETURN_TYPES = (BUNDLE,)
    RETURN_NAMES = ("bundle",)
    OUTPUT_TOOLTIPS = (
        "The named values, packed as one bundle.",
    )
    DESCRIPTION = (
        "Packs named values into ONE bundle wire. A field is either wired "
        "into one of the node's inputs, or picked from another node's "
        "output in the Sources… dialog — the picked value travels with no "
        "wire at all. Both kinds share one list: drag to reorder, tick to "
        "switch a field off (it then packs as None).\n\n"
        "Fields are named after the output they come from and can be "
        "renamed in the dialog. Sources are limited to this graph: a node "
        "inside a subgraph cannot reach an output from its parent without "
        "a subgraph input. A source that is muted, bypassed or deleted "
        "leaves its field in place with None, so downstream pins never "
        "shift.\n\n"
        "The bundle output is a plain name/value mapping, readable by Split "
        "Bundle, Merge Bundles, an OBVPM Unbundle or a KJ Get. Turn on the "
        "node's `set` name to expose it as a constant other nodes can read "
        "by name. Wireless sources become real upstream dependencies, so "
        "they always run; use a wired bundle when a value must stay lazy "
        "on an unchosen branch."
    )

    @classmethod
    def INPUT_TYPES(cls):
        optional = {}
        for i in range(1, MAX_FIELDS + 1):
            optional[f"in_{i}"] = (any_type, {
                "tooltip": (
                    f"Reserved slot {i}. Filled by a wire, or by a "
                    "wireless source picked in Sources…; no need to touch "
                    "it directly."
                ),
            })
        # Declared last: widget values are positional, and the two hidden
        # lists above must keep their positions in older saves.
        optional["set"] = ("STRING", {
            "default": "",
            "tooltip": (
                "Name for this bundle when it is used as a constant. "
                "Split Bundle's get, an OBVPM Unbundle with get, or a KJ "
                "Get can read the bundle by this name; the node's title "
                "follows it (Set <name>) until it is cleared."
            ),
        })
        return {
            "required": {
                "names": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": (
                        "Internal: the field names in bundle order, written "
                        "by the Sources… dialog. Leave it alone."
                    ),
                }),
                "plan": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": (
                        "Internal: which input slot feeds each name line, "
                        "written by the Sources… dialog. A null entry means "
                        "the field is switched off and packs as None."
                    ),
                }),
            },
            "optional": optional,
        }

    def pack(self, names="", plan="", set="", **kwargs):
        fields = _lines(names)[:MAX_FIELDS]
        slots = _slots(plan, len(fields))
        packed = {}
        for index, name in enumerate(fields):
            slot = slots[index] if index < len(slots) else None
            if name in packed:
                logger.warning(
                    "[AUN] Wireless Bundle: %r is listed more than once; "
                    "the later line wins.", name)
            packed[name] = None if slot is None else kwargs.get(f"in_{slot}")
        return (packed,)


NODE_CLASS_MAPPINGS = {
    "AUNWirelessBundle": AUNWirelessBundle,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNWirelessBundle": "Wireless Bundle",
}
