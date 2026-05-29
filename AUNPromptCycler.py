import random
from typing import List, Tuple, Any

class AUNPromptCycler:
    """
    A ComfyUI custom node that cycles through an infinite number of prompts.
    Supports both built-in example prompts and custom user-defined prompts.
    Each time the node is executed, it returns the next prompt in sequence or randomly.
    
    Original author: tenitsky (tenitsky-prompt-cycler-simple)
    Adapted for AUN Nodes with additional features.
    """
    
    def __init__(self):
        # Example prompts - users can provide their own via custom_prompts
        self.current_index = 1
        self.range_index = 0
        self.search_index = 0
        self.execution_count = 0
        self.example_prompts = [
            "A majestic mountain landscape at sunset with golden light",
            "A futuristic city with flying cars and neon lights",
            "A peaceful forest with sunlight filtering through trees",
            "An underwater scene with colorful coral reefs and fish",
            "A cozy cabin in the woods during winter snowfall",
            "A space station orbiting a distant planet",
            "A bustling marketplace in an ancient city",
            "A serene lake with mountains reflected in the water",
            "A steampunk laboratory with brass gears and steam",
            "A magical garden with glowing flowers and butterflies"
        ]

    @classmethod
    def INPUT_TYPES(cls):
        # Create default prompts string from example prompts
        default_prompts = "\n".join([
            "A majestic mountain landscape at sunset with golden light",
            "A futuristic city with flying cars and neon lights",
            "A peaceful forest with sunlight filtering through trees",
            "An underwater scene with colorful coral reefs and fish",
            "A cozy cabin in the woods during winter snowfall",
            "A space station orbiting a distant planet",
            "A bustling marketplace in an ancient city",
            "A serene lake with mountains reflected in the water",
            "A steampunk laboratory with brass gears and steam",
            "A magical garden with glowing flowers and butterflies"
        ])
        
        return {
            "required": {
                "cycle_mode": (["sequential", "random", "manual", "range", "search"], {
                    "default": "sequential"
                }),
                "manual_index": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": 0xffffffffffffffff,
                    "step": 1,
                    "tooltip": "Manually select a prompt by index (1-based). Used when cycle_mode is 'manual'."
                }),
                "range_indices": ("STRING", {
                    "default": "1-10",
                    "multiline": False,
                    "tooltip": "Comma-separated indices or ranges for range mode (1-based), e.g. '1,2,4-8,11'."
                }),
                "search_query": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "tooltip": "Search for prompts (case-insensitive). Space = AND (e.g., 'mountain sunset'), comma = OR (e.g., 'mountain, forest'). Combines: 'mountain sunset, forest' matches (mountain AND sunset) OR forest."
                })
            },
            "optional": {
                "custom_prompts": ("STRING", {
                    "multiline": True,
                    "dynamicPrompts": True,
                    "default": default_prompts,
                    "tooltip": "Enter your own prompts, one per line. Optional title: use 'Title: Prompt text' format. Lines without a title get auto-generated ones (e.g., 'Prompt 1')."
                })
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    DESCRIPTION = "Cycle through prompts sequentially, randomly, by range (e.g. '1,2,4-8,11'), or by search. Supports custom titles. Original by tenitsky."
    RETURN_TYPES = ("STRING", "STRING", "INT")
    RETURN_NAMES = ("prompt", "prompt_title", "index")
    FUNCTION = "cycle_prompt"
    CATEGORY = "AUN Nodes/Text"
    OUTPUT_NODE = True

    def _emit_selected_prompt(self, unique_id, prompt_title, cycle_index):
        if unique_id is None:
            return
        try:
            from server import PromptServer
            PromptServer.instance.send_sync(
                "AUN_prompt_cycler_selected",
                {
                    "node_id": str(unique_id),
                    "prompt_title": str(prompt_title or ""),
                    "cycle_index": int(cycle_index or 0),
                },
            )
        except Exception:
            pass

    def cycle_prompt(self, cycle_mode: str, manual_index: int = 1, range_indices: str = "1-10", search_query: str = "", custom_prompts: str = "", unique_id=None, **kwargs):
        """
        Cycle through prompts and return the current one.
        Supports infinite number of prompts via custom_prompts input.
        
        Args:
            cycle_mode: "sequential", "random", "manual", "range", or "search" cycling
            manual_index: Manually select a prompt by index (1-based), used when cycle_mode is "manual"
            range_indices: Comma-separated indices or ranges for range mode (1-based), e.g. '1,2,4-8,11'
            search_query: Search for prompts containing this text, used when cycle_mode is "search"
            custom_prompts: Optional custom prompts (one per line). If empty, uses example prompts.
        
        Returns:
            Tuple of (current_prompt, prompt_title, cycle_index)
        """
        # Use custom prompts if provided, otherwise use example prompts
        prompts_to_use = self.example_prompts
        titles_to_use = [f"Prompt {i}" for i in range(1, len(self.example_prompts) + 1)]
        if custom_prompts.strip():
            parsed = []
            for i, line in enumerate(custom_prompts.split('\n'), 1):
                line = line.strip()
                if not line:
                    continue
                if ":" in line:
                    title, _, prompt = line.partition(":")
                    parsed.append((prompt.strip(), title.strip()))
                else:
                    parsed.append((line, f"Prompt {i}"))
            if parsed:
                prompts_to_use = [p for p, _ in parsed]
                titles_to_use = [t for _, t in parsed]
        
        # Choose prompt based on cycle mode
        if cycle_mode == "sequential":
            prompt = prompts_to_use[(self.current_index - 1) % len(prompts_to_use)]
            title = titles_to_use[(self.current_index - 1) % len(titles_to_use)]
            cycle_index = ((self.current_index - 1) % len(prompts_to_use)) + 1
            self.current_index += 1
        elif cycle_mode == "manual":
            cycle_index = ((manual_index - 1) % len(prompts_to_use)) + 1
            prompt = prompts_to_use[cycle_index - 1]
            title = titles_to_use[cycle_index - 1]
        elif cycle_mode == "range":
            # Parse range_indices string: "1,2,4-8,11" -> [1, 2, 4, 5, 6, 7, 8, 11]
            indices = []
            for part in range_indices.split(","):
                part = part.strip()
                if "-" in part:
                    bounds = part.split("-", 1)
                    s = max(1, int(bounds[0].strip()))
                    e = min(int(bounds[1].strip()), len(prompts_to_use))
                    if s > e:
                        s, e = e, s
                    indices.extend(range(s, e + 1))
                else:
                    idx = max(1, int(part))
                    if idx <= len(prompts_to_use):
                        indices.append(idx)
            if not indices:
                indices = [1]
            cycle_index = indices[self.range_index % len(indices)]
            prompt = prompts_to_use[cycle_index - 1]
            title = titles_to_use[cycle_index - 1]
            self.range_index += 1
        elif cycle_mode == "search":
            # Find prompts matching the search query (case-insensitive)
            # Supports: "word1 word2" = AND (both words), "term1, term2" = OR (either term)
            if search_query.strip():
                or_groups = [g.strip().lower().split() for g in search_query.split(",") if g.strip()]
                if or_groups:
                    def matches(prompt_text):
                        text = prompt_text.lower()
                        # Match if any OR group matches (each group requires all words)
                        return any(all(word in text for word in group) for group in or_groups)
                    matches_list = [(i + 1, p, t) for i, (p, t) in enumerate(zip(prompts_to_use, titles_to_use)) if matches(p)]
                    if matches_list:
                        cycle_index, prompt, title = matches_list[self.search_index % len(matches_list)]
                        self.search_index += 1
                    else:
                        # No matches, fall back to first prompt
                        cycle_index = 1
                        prompt = prompts_to_use[0]
                        title = titles_to_use[0]
                else:
                    cycle_index = 1
                    prompt = prompts_to_use[0]
                    title = titles_to_use[0]
            else:
                # Empty query, cycle through all sequentially
                prompt = prompts_to_use[(self.search_index) % len(prompts_to_use)]
                title = titles_to_use[(self.search_index) % len(titles_to_use)]
                cycle_index = (self.search_index % len(prompts_to_use)) + 1
                self.search_index += 1
        else:  # random mode
            cycle_index = random.randint(1, len(prompts_to_use))
            prompt = prompts_to_use[cycle_index - 1]
            title = titles_to_use[cycle_index - 1]
        
        self.execution_count += 1

        self._emit_selected_prompt(unique_id, title, cycle_index)

        return (prompt, title, cycle_index)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        """
        This method determines if the node should be re-executed.
        We'll make it change every time to ensure cycling works properly.
        """
        return float("nan")  # Always re-execute

NODE_CLASS_MAPPINGS = {
    "AUNPromptCycler": AUNPromptCycler
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNPromptCycler": "AUN Prompt Cycler"
}
