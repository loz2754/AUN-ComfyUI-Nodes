import random

class AUNMultiPromptCycler:
    DESCRIPTION = "Outputs all prompts matching a range or search query as lists. Each list element triggers a separate downstream execution."

    def __init__(self):
        self.example_prompts = [
            "Mountain:A majestic mountain landscape at sunset with golden light.",
            "City:A futuristic city with flying cars and neon lights.",
            "Forest:A peaceful forest with sunlight filtering through trees.",
            "Coral:An underwater scene with colorful coral reefs and fish.",
            "Cabin:A cozy cabin in the woods during winter snowfall.",
            "Space:A space station orbiting a distant planet.",
            "Marketplace:A bustling marketplace in an ancient city.",
            "Lake:A serene lake with mountains reflected in the water.",
            "Laboratory:A steampunk laboratory with brass gears and steam.",
            "Garden:A magical garden with glowing flowers and butterflies."
        ]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": (["range", "search"], {
                    "default": "range",
                    "tooltip": "Range: select by index. Search: filter by keywords."
                }),
                "mode_input": ("STRING", {
                    "default": "1-10",
                    "multiline": False,
                    "tooltip": "Range mode: comma-separated indices/ranges (e.g. '1,2,4-8,11'). Use '0' for all prompts. Search mode: space=AND, comma=OR (e.g. 'mountain sunset, forest')."
                }),
            },
            "optional": {
                "custom_prompts": ("STRING", {
                    "multiline": True,
                    "dynamicPrompts": True,
                    "default": "Enter prompts here...",
                    "tooltip": "Enter your own prompts, one per line. Optional title: use 'Title: Prompt text' format. Lines without a title get auto-generated ones (e.g., 'Prompt 1')."
                })
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "prompt_title")
    OUTPUT_IS_LIST = (True, True)
    FUNCTION = "get_prompts"
    CATEGORY = "AUN Nodes/Text"
    OUTPUT_NODE = True

    def _parse_prompts(self, custom_prompts):
        prompts_to_use = self.example_prompts
        titles_to_use = [f"Prompt {i}" for i in range(1, len(self.example_prompts) + 1)]
        if custom_prompts and custom_prompts.strip():
            parsed = []
            for i, line in enumerate(custom_prompts.split('\n'), 1):
                line = line.strip()
                if not line:
                    continue
                if ":" in line:
                    title, _, prompt_text = line.partition(":")
                    parsed.append((prompt_text.strip(), title.strip()))
                else:
                    parsed.append((line, f"Prompt {i}"))
            if parsed:
                prompts_to_use = [p for p, _ in parsed]
                titles_to_use = [t for _, t in parsed]
        return prompts_to_use, titles_to_use

    def _fallback(self):
        return ([""], [""])

    def _get_range_indices(self, mode_input, max_len):
        indices = []
        for part in mode_input.split(","):
            part = part.strip()
            if not part:
                continue
            if "-" in part:
                bounds = part.split("-", 1)
                try:
                    s = int(bounds[0].strip())
                    e = int(bounds[1].strip())
                except ValueError:
                    continue
                if s > e:
                    s, e = e, s
                s = max(1, s)
                e = min(e, max_len)
                if s <= e:
                    indices.extend(range(s, e + 1))
            else:
                try:
                    idx = int(part)
                except ValueError:
                    continue
                if idx == 0 or 1 <= idx <= max_len:
                    indices.append(idx)
        if 0 in indices:
            return list(range(1, max_len + 1))
        return sorted(set(indices))

    def _get_search_matches(self, query, prompts_to_use, titles_to_use):
        if not query.strip():
            return []
        or_groups = [g.strip().lower().split() for g in query.split(",") if g.strip()]
        if not or_groups:
            return []
        def matches(text):
            t = text.lower()
            return any(all(word in t for word in group) for group in or_groups)
        return [(p, t) for p, t in zip(prompts_to_use, titles_to_use) if matches(p)]

    def get_prompts(self, mode, mode_input, custom_prompts="", unique_id=None, **kwargs):
        prompts_to_use, titles_to_use = self._parse_prompts(custom_prompts)
        if not prompts_to_use:
            return self._fallback()

        if mode == "range":
            indices = self._get_range_indices(mode_input, len(prompts_to_use))
            if not indices:
                return self._fallback()
            prompts = [prompts_to_use[i - 1] for i in indices]
            titles = [titles_to_use[i - 1] for i in indices]
            return (prompts, titles)

        else:
            matches = self._get_search_matches(mode_input, prompts_to_use, titles_to_use)
            if not matches:
                return self._fallback()
            prompts = [p for p, _ in matches]
            titles = [t for _, t in matches]
            return (prompts, titles)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

NODE_CLASS_MAPPINGS = {
    "AUNMultiPromptCycler": AUNMultiPromptCycler
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNMultiPromptCycler": "AUN Multi Prompt Cycler"
}
