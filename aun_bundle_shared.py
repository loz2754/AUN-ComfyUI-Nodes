"""Shared helpers for OBVPM-compatible bundles (plain ordered dicts).

The bundle format, the `set`-name constant and the `obvpm*` compatibility
hooks are OBVPM's design (https://github.com/chanon/comfyui-obvpm) by
chanon. AUN's bundle nodes build directly on that work — thank you.
"""

BUNDLE = "OBVPM_BUNDLE"


def pack(fields):
    """Pack an ordered mapping of name -> value into a bundle dict."""
    return dict(fields or {})


def unpack(bundle, names=None):
    """Unpack a bundle into a list of values (by name if given, else field order)."""
    if not isinstance(bundle, dict):
        raise ValueError("Expected an OBVPM bundle (name/value mapping).")
    if names:
        fields = list(names)
    else:
        fields = list(bundle.keys())
    return [bundle.get(name) for name in fields]
