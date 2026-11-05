"""Split one bundle back into its fields.

This builds on OBVPM by chanon (https://github.com/chanon/comfyui-obvpm):
the bundle format, the `set`-name constant and the `obvpmBundleNames` hook
are his design. AUN's bundle nodes exist because of that work.

This is the reader for the bundles every AUN setter node produces (the
`set` widget + `bundle` output), and it needs no other node pack: the
bundle is a plain dict, and the field names are supplied by the browser
(`aunBundleNames`) or, failing that, read from the dict itself.

Two modes, like the bundle getters people are used to:

* wire a bundle into `bundle` and every field appears as an output pin;
* turn `get` on and name a constant ("ckpt", ...) instead — the browser
  resolves the name to the node that sets it, across subgraphs, and the
  run reads that node's bundle without a wire.

The browser owns the output pins (one per field) and writes the hidden
`fields` list, so the pin order and the server's tuple cannot drift.
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

MAX_OUTPUTS = 32


def _parse_fields(raw):
    """The field plan written by the browser, or [] when there is none."""
    text = str(raw or "").strip()
    if not text:
        return []
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        logger.warning(
            "[AUN] Split Bundle: could not read the planned field names.")
        return []
    if not isinstance(data, list):
        return []
    return [str(name) for name in data if str(name).strip()]


class AUNSplitBundle:
    """One bundle in, one output pin per field out."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "bundle": (BUNDLE, {
                    "forceInput": True,
                    "tooltip": (
                        "The bundle to split. Wire a node's `bundle` output "
                        "here (or the output of Merge Bundles). Its fields "
                        "become this node's outputs."
                    ),
                }),
                "get": ("BOOLEAN", {
                    "default": False,
                    "tooltip": (
                        "Read a bundle by constant name instead of a wire. "
                        "Turn this on and fill `constant` with the name a "
                        "node sets; the browser finds that node, even in an "
                        "outer graph. A name wins over a wire when both are "
                        "present."
                    ),
                }),
                "constant": ("STRING", {
                    "default": "",
                    "tooltip": (
                        "Constant name to read when `get` is on. This is a "
                        "drop-down of every `set` name in the graph (and in "
                        "outer graphs), refreshed as setters are added or "
                        "renamed. Hidden while `get` is off. Leave it empty "
                        "to use the wired bundle."
                    ),
                }),
                "fields": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": (
                        "Internal: the field names for this run, written by "
                        "the browser when the pins are built. Leave it empty."
                    ),
                }),
            },
        }

    RETURN_TYPES = tuple([any_type] * MAX_OUTPUTS)
    RETURN_NAMES = tuple(f"field_{i + 1}" for i in range(MAX_OUTPUTS))
    OUTPUT_TOOLTIPS = tuple(
        "One field of the bundle, in the order shown on the node."
        for _ in range(MAX_OUTPUTS)
    )
    FUNCTION = "split"
    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = (
        "Splits one bundle into its fields, with one output pin per field, "
        "so a model, clip, vae, image, latent, prompt or sampler setting "
        "can be read out of a single wire.\n\n"
        "Wire a node's `bundle` output here (Merge Bundles works too), or "
        "turn `get` on and type the constant name another node sets. With "
        "`get` on, no wire is needed: the browser resolves the name to the "
        "node that sets it, including from inside a subgraph. A name wins "
        "over a wire when both are present.\n\n"
        "The output pins follow the bundle's field names. Muting or "
        "bypassing the source leaves its pins named but empty, so a muted "
        "image never renames another field. The Fields… button opens a "
        "list of the output pins that can be dragged into a different "
        "order, with a tick box per field to hide pins that are not "
        "needed; the order and the hidden fields are saved with the "
        "workflow, and a field added later is appended and shown. This "
        "node needs no other node pack; bundles are plain name/value "
        "mappings."
    )

    def split(self, bundle=None, get=False, constant="", fields=""):
        names = _parse_fields(fields)

        if isinstance(bundle, dict):
            if not names:
                names = [str(name) for name in bundle.keys()]
            values = [bundle.get(name) for name in names[:MAX_OUTPUTS]]
        else:
            if bundle is not None:
                logger.warning(
                    "[AUN] Split Bundle: the bundle input is not a bundle "
                    "(%s); every field is empty.", type(bundle).__name__)
            values = [None] * min(len(names), MAX_OUTPUTS)

        values += [None] * (MAX_OUTPUTS - len(values))
        return tuple(values)


NODE_CLASS_MAPPINGS = {
    "AUNSplitBundle": AUNSplitBundle,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNSplitBundle": "Split Bundle",
}
