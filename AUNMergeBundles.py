"""Merge several OBVPM bundles into one.

The stock OBVPM Unbundle takes a single bundle. Feeding it the output of
several nodes (a checkpoint loader, an image loader, an empty latent, ...)
meant putting a Bundle node in between and wiring each one into a field.
This node does that merge directly: every field of every connected bundle
comes out as one bundle, so one Unbundle shows them all -- and it names
them, because OBVPM asks a node that packs a bundle for its field names
(`obvpmBundleNames`, see web/AUN_merge_bundles_obvpm.js).

The merge rule is deliberately simple and is mirrored in the browser, so
the Unbundle's labels and the server's keys cannot drift apart:

* bundles are merged in input order (`bundle_1`, `bundle_2`, ...);
* the first bundle to carry a name keeps it;
* a later bundle carrying the same name gets a numbered suffix
  (`width` -> `width_2`, `width_3`, ...), the lowest free number winning;
* a bundle that is not connected, or is not a dict (a bypassed loader
  hands on None), is skipped;
* a bundle whose source is muted or bypassed is skipped too, but its
  field names keep their place -- muting one image never renames another.

Bundles may also arrive without wires: the node's Constants... dialog lists
the names that other nodes set (`obvpmConstantWidget`, an OBVPM Bundle with
'set' on, a KJ Set), and the browser turns each into an ordinary input
reference when the prompt is built -- see web/AUN_merge_bundles_obvpm.js.
Named bundles merge after the wired ones, in the order shown there.
"""

from .aun_bundle_shared import BUNDLE
from .logger import logger

import json


def _merge_bundle(merged, bundle, label):
    """Merge one bundle's fields, numbering any name already taken.

    Same rule as the browser's ``numberFields``: the lowest free suffix
    wins, so the server's keys and the Unbundle's labels agree.
    """
    for raw_name, value in bundle.items():
        name = str(raw_name)
        if name in merged:
            base = name
            suffix = 2
            while f"{base}_{suffix}" in merged:
                suffix += 1
            name = f"{base}_{suffix}"
            logger.info(
                "[AUN] Merge Bundles: '%s' came in on %s as well; stored "
                "as '%s'.", base, label or "another input", name)
        merged[name] = value


def _parse_order(raw):
    """The field plan the browser wrote, or None when there is none.

    Shape: ``[{"input": "bundle_4", "names": ["image", "mask"]}, ...]`` in
    merge order. None means "no plan": number the fields from the bundles
    that arrive, which is what every workflow saved before plans existed
    does.
    """
    text = str(raw or "").strip()
    if not text:
        return None
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        logger.warning(
            "[AUN] Merge Bundles: could not read the planned field names; "
            "using each bundle's own names.")
        return None
    if not isinstance(data, list):
        return None
    entries = []
    for item in data:
        if not isinstance(item, dict):
            continue
        name = item.get("input")
        names = item.get("names")
        entries.append({
            "input": name if isinstance(name, str) else None,
            "names": [str(n) for n in names] if isinstance(names, list) else [],
        })
    return entries or None


class AUNMergeBundles:
    """Several bundle wires in, one merged bundle out."""

    MAX_INPUTS = 16

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {"required": {}, "optional": {}}
        for i in range(1, cls.MAX_INPUTS + 1):
            inputs["optional"][f"bundle_{i}"] = (BUNDLE, {
                "forceInput": True,
                "tooltip": (
                    f"Bundle {i}. Its fields join the merged bundle after "
                    f"bundle {i - 1}'s, in this node's order. A field name "
                    f"already used by an earlier bundle gets a numbered "
                    f"suffix (width, width_2, ...)."
                ),
            })
        # A Bundle-style constant: the browser hooks this name, and an
        # OBVPM Unbundle with 'get' (or a KJ Get) can read the merged
        # bundle without a wire.
        inputs["optional"]["set"] = ("STRING", {
            "default": "",
            "tooltip": (
                "Constant name. When non-empty, this node sets an OBVPM "
                "bundle constant readable by an OBVPM Unbundle (get) or "
                "KJ Get, and the node's title follows the name "
                "(Set <name>) until it is cleared."
            ),
        })
        # One constant name per line, in merge order. Never shown: the
        # node's Constants... button opens a dialog that writes it, and
        # the browser turns each name into an ordinary bundle input when
        # the prompt is built, so the server needs nothing more.
        inputs["optional"]["constants"] = ("STRING", {
            "default": "",
            "multiline": True,
            "tooltip": (
                "Constant names merged without wires, in this order. Set "
                "with the Constants... button on the node, which lists the "
                "names visible in the graph and lets you reorder them. "
                "Named bundles merge after the wired ones."
            ),
        })
        # Written by the browser when the prompt is built: the field names
        # each input contributes, in merge order, with muted bundles' names
        # still reserved. Never shown and never edited by hand.
        inputs["optional"]["order"] = ("STRING", {
            "default": "",
            "tooltip": (
                "Internal: the field plan for this run, written by the "
                "browser. It keeps the merged field names stable when a "
                "source is muted or bypassed. Leave it empty."
            ),
        })
        return inputs

    RETURN_TYPES = (BUNDLE,)
    RETURN_NAMES = ("bundle",)
    OUTPUT_TOOLTIPS = (
        "Every field of every connected bundle, merged in input order.",
    )
    FUNCTION = "merge"
    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = (
        "Merges several OBVPM bundles into one wire, so a single OBVPM "
        "Unbundle can show the values from all of the connected nodes -- "
        "not just one loader's. Wire the bundle output of each node here; "
        "the merged bundle carries every field, in input order.\n\n"
        "Bundles can also be taken by constant name, without wires: press "
        "the Constants... button on the node (or right-click -> "
        "Constants...) to pick from the names set in the graph and put "
        "them in order. Wired bundles merge first, in socket order; the "
        "named ones follow, in the order listed. A source that is muted "
        "or bypassed is skipped: its values are left out, but its field "
        "names keep their place, so muting one image never renames the "
        "others. A name that matches nothing stops the run with an "
        "explanation instead of quietly leaving a field out.\n\n"
        "A field name that two bundles share is kept once and renamed with "
        "a number on the later copy (width, width_2, width_3, ...), so no "
        "value is lost. Empty or unconnected inputs are ignored, as are "
        "bypassed nodes (which hand on None).\n\n"
        "The node grows an extra input as each one fills, so there is "
        "always one spare. Set the 'set' widget to a constant name to "
        "expose the merged bundle as an OBVPM bundle constant, readable by "
        "an Unbundle with 'get' or a KJ Get -- the title then follows that "
        "name (Set <name>) to match the other Set nodes."
    )

    def merge(self, **kwargs):
        merged = {}
        connected = False
        # `set` is the constant's name, `constants` the list of names the
        # browser resolved into inputs and `order` the field names it
        # planned: none of them holds a value itself.
        kwargs.pop("set", None)
        kwargs.pop("constants", None)
        plan = _parse_order(kwargs.pop("order", ""))

        if plan is not None:
            # The browser knows the final field names (it reserves the
            # names of muted bundles), so follow its plan instead of
            # re-deriving suffixes from whichever bundles arrived.
            for entry in plan:
                name = entry["input"]
                bundle = kwargs.get(name) if name else None
                if bundle is None:
                    continue                    # skipped or not wired
                if not isinstance(bundle, dict):
                    logger.warning(
                        "[AUN] Merge Bundles: %s is not a bundle (%s); "
                        "skipped.", name or "an input",
                        type(bundle).__name__)
                    continue
                connected = True
                names = entry["names"]
                if names and len(names) == len(bundle):
                    for field, value in zip(names, bundle.values()):
                        merged[field] = value
                else:
                    # The bundle's shape changed after the plan was made
                    # (a field was added or removed): fall back to its own
                    # keys for this one rather than mislabel values.
                    logger.info(
                        "[AUN] Merge Bundles: %s no longer has the fields "
                        "the browser planned; using its own names.",
                        name or "an input")
                    _merge_bundle(merged, bundle, name)
        else:
            for i in range(1, self.MAX_INPUTS + 1):
                bundle = kwargs.get(f"bundle_{i}")
                if bundle is None:
                    continue
                if not isinstance(bundle, dict):
                    logger.warning(
                        "[AUN] Merge Bundles: bundle_%d is not a bundle "
                        "(%s); skipped.", i, type(bundle).__name__)
                    continue
                connected = True
                _merge_bundle(merged, bundle, f"bundle_{i}")

        if not connected:
            logger.warning(
                "[AUN] Merge Bundles: nothing is connected, so the merged "
                "bundle is empty.")
        return (merged,)


NODE_CLASS_MAPPINGS = {
    "AUNMergeBundles": AUNMergeBundles,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNMergeBundles": "Merge Bundles",
}
