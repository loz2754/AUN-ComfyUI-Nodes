import random
import re
import time
from pathlib import Path

from .AUNAddToPrompt import AUNAddToPrompt


class _LocalWildcardProcessor:
    _OPTION_PATTERN = re.compile(r"\{([^{}]+)\}")
    _WILDCARD_PATTERN = re.compile(r"__(?P<key>[\w.\-+/\\]+?)__")
    _QUANTIFIED_WILDCARD_PATTERN = re.compile(r"(?P<count>\d+)#__(?P<key>[\w.\-+/\\]+?)__")
    _MAX_DEPTH = 24

    def __init__(self):
        self._wildcard_dirs = [
            Path(__file__).resolve().parent / "wildcards",
        ]
        self._cache = None

    def _normalize_key(self, key):
        return str(key or "").strip().replace("\\", "/").lower()

    def _load_lines(self, path):
        for encoding, errors in (("utf-8", "strict"), ("latin-1", "ignore")):
            try:
                with path.open("r", encoding=encoding, errors=errors) as handle:
                    return [line.strip() for line in handle if line.strip() and not line.lstrip().startswith("#")]
            except Exception:
                continue
        return []

    def _build_cache(self, force_refresh=False):
        if force_refresh:
            self._cache = None

        if self._cache is not None:
            return self._cache

        cache = {}
        for base_dir in self._wildcard_dirs:
            if not base_dir.is_dir():
                continue
            for path in base_dir.rglob("*.txt"):
                try:
                    relative_key = self._normalize_key(path.relative_to(base_dir).with_suffix(""))
                except Exception:
                    continue
                if relative_key and relative_key not in cache:
                    values = self._load_lines(path)
                    if values:
                        cache[relative_key] = values

        self._cache = cache
        return cache

    def has_wildcards(self):
        return bool(self._build_cache())

    def get_wildcard_names(self, force_refresh=False):
        return sorted(self._build_cache(force_refresh=force_refresh).keys())

    def _resolve_wildcard(self, key, randomizer, depth):
        values = self._build_cache().get(self._normalize_key(key), [])
        if not values:
            return f"__{key}__"
        return self._expand_text(randomizer.choice(values), randomizer, depth + 1)

    @staticmethod
    def _split_options(body):
        parts = []
        current = []
        nested_depth = 0
        for char in body:
            if char == "{" and nested_depth >= 0:
                nested_depth += 1
            elif char == "}" and nested_depth > 0:
                nested_depth -= 1
            if char == "|" and nested_depth == 0:
                parts.append("".join(current).strip())
                current = []
                continue
            current.append(char)
        if current:
            parts.append("".join(current).strip())
        return [part for part in parts if part]

    @staticmethod
    def _weighted_choice(options, randomizer):
        weighted = []
        total = 0.0
        for option in options:
            raw_option = option
            weight = 1.0
            if "::" in option:
                weight_text, candidate = option.split("::", 1)
                try:
                    weight = float(weight_text.strip())
                    raw_option = candidate.strip()
                except Exception:
                    raw_option = option.strip()
                    weight = 1.0
            weighted.append((raw_option, max(weight, 0.0)))
            total += max(weight, 0.0)

        if not weighted:
            return ""
        if total <= 0.0:
            return randomizer.choice([item for item, _ in weighted])

        pick = randomizer.uniform(0.0, total)
        upto = 0.0
        for item, weight in weighted:
            upto += weight
            if pick <= upto:
                return item
        return weighted[-1][0]

    def _replace_options(self, text, randomizer, depth):
        def replacer(match):
            options = self._split_options(match.group(1))
            if not options:
                return match.group(0)
            selected = self._weighted_choice(options, randomizer)
            return self._expand_text(selected, randomizer, depth + 1)

        return self._OPTION_PATTERN.sub(replacer, text)

    def _replace_quantified_wildcards(self, text, randomizer, depth):
        def replacer(match):
            count = max(0, int(match.group("count")))
            key = match.group("key")
            return ", ".join(self._resolve_wildcard(key, randomizer, depth + 1) for _ in range(count))

        return self._QUANTIFIED_WILDCARD_PATTERN.sub(replacer, text)

    def _replace_wildcards(self, text, randomizer, depth):
        def replacer(match):
            return self._resolve_wildcard(match.group("key"), randomizer, depth + 1)

        return self._WILDCARD_PATTERN.sub(replacer, text)

    def _expand_text(self, text, randomizer, depth=0):
        if depth >= self._MAX_DEPTH:
            return text

        current = str(text or "")
        for _ in range(self._MAX_DEPTH):
            updated = self._replace_quantified_wildcards(current, randomizer, depth)
            updated = self._replace_options(updated, randomizer, depth)
            updated = self._replace_wildcards(updated, randomizer, depth)
            if updated == current:
                return updated
            current = updated
        return current

    def process(self, text):
        randomizer = random.Random()
        return self._expand_text(text, randomizer)


_LOCAL_WILDCARDS = _LocalWildcardProcessor()


class AUNWildcardAddToPrompt(AUNAddToPrompt):
    @classmethod
    def _selector_values(cls):
        wildcard_names = _LOCAL_WILDCARDS.get_wildcard_names(force_refresh=True)
        if not wildcard_names:
            return ["No wildcards found"]
        return ["Select wildcard..."] + [f"__{name}__" for name in wildcard_names]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "prompt": (
                    "STRING",
                    {
                        "forceInput": True,
                        "dynamicPrompts": True,
                        "tooltip": "Optional prompt to extend.",
                    },
                ),
            },
            "required": {
                "text_to_add": (
                    "STRING",
                    {
                        "multiline": True,
                        "dynamicPrompts": False,
                        "tooltip": "Wildcard template text to add. Supports common wildcard syntax like __name__ and {a|b|c}.",
                    },
                ),
                "wildcard_selector": (
                    cls._selector_values(),
                    {
                        "tooltip": "Quick insert a discovered wildcard token into text_to_add.",
                    },
                ),
                "delimiter": (
                    "STRING",
                    {
                        "default": ", ",
                        "tooltip": "Delimiter to use between the prompt and the processed text.",
                    },
                ),
                "order": (
                    ["prompt_first", "text_first"],
                    {
                        "default": "prompt_first",
                        "tooltip": "Order to use when combining the prompt and the processed text.",
                    },
                ),
                "mode": (
                    "COMBO",
                    {
                        "options": ["on", "off", "random"],
                        "default": "on",
                        "tooltip": "Whether to add the processed text: on, off, or random 50/50.",
                    },
                ),
            },
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "populated_text")
    FUNCTION = "add_wildcard_to_prompt"
    CATEGORY = "AUN Nodes/Text"
    DESCRIPTION = "Randomize local wildcard syntax each execution, then conditionally add the populated text to a prompt."

    @staticmethod
    def _process_wildcards(text):
        if not text:
            return ""
        return _LOCAL_WILDCARDS.process(text=text)

    @staticmethod
    def _combine_prompt(prompt, addition, delimiter, order, mode):
        prompt = prompt or ""
        addition = addition or ""
        delimiter = delimiter or ""
        mode_normalized = str(mode or "").strip().lower()
        order_normalized = "text_first" if str(order or "").strip().lower() == "text_first" else "prompt_first"

        add_text = False
        if mode_normalized == "on":
            add_text = True
        elif mode_normalized == "random":
            add_text = random.choice([True, False])

        addition_applied = add_text and bool(addition)
        if addition_applied:
            if order_normalized == "prompt_first":
                result = f"{prompt}{delimiter}{addition}" if (prompt and addition) else (prompt + addition)
            else:
                result = f"{addition}{delimiter}{prompt}" if (addition and prompt) else (addition + prompt)
        else:
            result = prompt

        return result, addition_applied, order_normalized, mode_normalized

    def add_wildcard_to_prompt(
        self,
        text_to_add,
        wildcard_selector,
        delimiter,
        order,
        mode,
        prompt=None,
        unique_id=None,
        extra_pnginfo=None,
    ):
        source_text = text_to_add or ""
        processed_text = self._process_wildcards(source_text)
        result, addition_applied, order_normalized, mode_normalized = self._combine_prompt(
            prompt,
            processed_text,
            delimiter,
            order,
            mode,
        )

        self._record_pginfo(
            extra_pnginfo,
            unique_id,
            {
                "node": "AUNWildcardAddToPrompt",
                "mode": mode_normalized,
                "applied": bool(addition_applied),
                "result": result,
                "source_text": source_text,
                "populated_text": processed_text,
                "wildcard_selector": wildcard_selector,
                "order": order_normalized,
                "delimiter": delimiter or "",
                "wildcard_library_available": _LOCAL_WILDCARDS.has_wildcards(),
            },
        )

        return (result, processed_text)

    @classmethod
    def IS_CHANGED(cls, text_to_add, wildcard_selector, delimiter, order, mode, prompt=None, **kwargs):
        return time.time()


NODE_CLASS_MAPPINGS = {
    "AUNWildcardAddToPrompt": AUNWildcardAddToPrompt,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNWildcardAddToPrompt": "AUN Wildcard Add-To-Prompt",
}