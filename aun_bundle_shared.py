"""Shared helpers for OBVPM-compatible bundles (plain ordered dicts)."""

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
