class AUNKeywordFaceIDSettings:
    MAX_INPUTS = 6
    MIN_VISIBLE_INPUTS = 2

    UNIFIED_PRESETS = [
        "LIGHT - SD1.5 only (low strength)",
        "STANDARD (medium strength)",
        "VIT-G (medium strength)",
        "PLUS (high strength)",
        "PLUS FACE (portraits)",
        "FULL FACE - SD1.5 only (portraits stronger)",
    ]
    FACEID_PRESETS = [
        "FACEID",
        "FACEID PLUS - SD1.5 only",
        "FACEID PLUS V2",
        "FACEID PORTRAIT (style transfer)",
        "FACEID PORTRAIT UNNORM - SDXL only (strong)",
    ]
    WEIGHT_TYPES_SIMPLE = ["standard", "prompt is more important", "style transfer"]
    WEIGHT_TYPES = [
        "linear",
        "ease in",
        "ease out",
        "ease in-out",
        "reverse in-out",
        "weak input",
        "weak output",
        "weak middle",
        "strong middle",
        "style transfer",
        "composition",
        "strong style transfer",
    ]

    @classmethod
    def _weight_spec(cls, tooltip):
        return ("FLOAT", {"default": 1.0, "min": -1, "max": 3, "step": 0.05, "tooltip": tooltip})

    @classmethod
    def _lora_strength_spec(cls, tooltip):
        return ("FLOAT", {"default": 0.6, "min": 0, "max": 1, "step": 0.01, "tooltip": tooltip})

    @classmethod
    def _weight_faceidv2_spec(cls, tooltip):
        return ("FLOAT", {"default": 1.0, "min": -1, "max": 5.0, "step": 0.05, "tooltip": tooltip})

    @classmethod
    def INPUT_TYPES(cls):
        required = {
            "visible_inputs": ("INT", {
                "default": 5,
                "min": cls.MIN_VISIBLE_INPUTS,
                "max": cls.MAX_INPUTS,
                "step": 1,
                "tooltip": "How many keyword/settings presets are active (2-%d). Row N uses keywordN + its settings." % cls.MAX_INPUTS,
            }),
            "case_sensitive": ("BOOLEAN", {
                "default": False,
                "tooltip": "If enabled, keyword matching is case-sensitive.",
            }),
            "manual_preset": (["1", "2", "3", "4", "5", "6"], {
                "default": "1",
                "tooltip": "Which preset row (1-6) to use as the active bundle. Clamped to visible_inputs. With match_keywords=No, this is always used. With match_keywords=Yes, keywords can override it when they match.",
            }),
            "match_keywords": (["Yes", "No"], {
                "default": "Yes",
                "tooltip": "Yes: keywords in reference_phrase are matched; the first matching row's settings are used, falling back to manual_preset when nothing matches. No: keywords are ignored; manual_preset is always used.",
            }),
        }

        optional = {
            "reference_phrase": ("STRING", {
                "default": "",
                "forceInput": True,
                "multiline": True,
                "tooltip": "Text to scan for keywords. Keywords are matched as substrings.",
            }),
        }

        for i in range(1, cls.MAX_INPUTS + 1):
            optional["keyword%d" % i] = ("STRING", {
                "default": "",
                "tooltip": "Keyword %d to match against the reference phrase. Matched as a substring. Comma-separated to allow multiple keywords on this row (any one matching activates it)." % i,
            })
            optional["preset%d" % i] = (cls.UNIFIED_PRESETS, {
                "default": "PLUS FACE (portraits)",
                "tooltip": "IPAdapterUnifiedLoader preset for keyword %d." % i,
            })
            optional["weight%d" % i] = cls._weight_spec("IPAdapterSimple weight for keyword %d." % i)
            optional["weight_type%d" % i] = (cls.WEIGHT_TYPES_SIMPLE, {
                "default": "prompt is more important",
                "tooltip": "IPAdapterSimple weight_type for keyword %d." % i,
            })
            optional["preset_faceid%d" % i] = (cls.FACEID_PRESETS, {
                "default": "FACEID PLUS V2",
                "tooltip": "IPAdapterUnifiedLoaderFaceID preset for keyword %d." % i,
            })
            optional["lora_strength%d" % i] = cls._lora_strength_spec("FaceID LoRA strength for keyword %d." % i)
            optional["weight_faceid%d" % i] = cls._weight_spec("IPAdapterFaceID weight for keyword %d." % i)
            optional["weight_faceidv2%d" % i] = cls._weight_faceidv2_spec("IPAdapterFaceID weight_faceidv2 for keyword %d." % i)
            optional["weight_type_faceid%d" % i] = (cls.WEIGHT_TYPES, {
                "default": "linear",
                "tooltip": "IPAdapterFaceID weight_type for keyword %d." % i,
            })

        return {
            "required": required,
            "optional": optional,
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = (UNIFIED_PRESETS, "FLOAT", WEIGHT_TYPES_SIMPLE, FACEID_PRESETS, "FLOAT", "FLOAT", "FLOAT", WEIGHT_TYPES, "STRING", "INT", "STRING", "STRING")
    RETURN_NAMES = (
        "preset", "weight", "weight_type", "preset_faceid", "lora_strength",
        "weight_faceid", "weight_faceidv2", "weight_type_faceid",
        "matched_keyword", "matched_index", "settings_text", "preset_number",
    )
    FUNCTION = "select_settings"
    CATEGORY = "AUN Nodes/IPAdapter"
    DESCRIPTION = (
        "Select FaceID/IPAdapter settings based on keyword matching in a reference phrase. "
        "Keywords are matched as substrings (case-insensitive by default); first match wins "
        "(top-to-bottom order). Each preset row holds the 8 settings consumed by an "
        "IPAdapterUnifiedLoader + IPAdapterSimple + IPAdapterUnifiedLoaderFaceID + "
        "IPAdapterFaceID combination (e.g. a FaceIDPreset subgraph): preset, weight, "
        "weight_type, preset_faceid, lora_strength, weight_faceid, weight_faceidv2, "
        "weight_type_faceid. Outputs are typed so they can be wired straight into the "
        "subgraph's exposed inputs. Falls back to the *_default settings when nothing matches. "
        "A manual preset override (manual_preset + manual_priority) can force any of the six "
        "preset rows or the default bundle, either overriding matched keywords ('Manual wins') "
        "or serving as a fallback when nothing matches ('Keyword wins'). "
        "settings_text renders the matched settings as a Python-style tuple for file naming."
    )

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    @staticmethod
    def _clamp(value, low, high, default):
        try:
            v = float(value)
        except (TypeError, ValueError):
            return default
        return max(low, min(v, high))

    def _select_settings(self, visible_inputs, case_sensitive, reference_phrase, manual_preset, match_keywords, **kwargs):
        manual_n = min(int(manual_preset), visible_inputs)
        keywords_on = match_keywords == "Yes"

        search = reference_phrase if case_sensitive else reference_phrase.lower()

        matched = None
        matched_keyword = ""
        matched_index = 0
        if keywords_on:
            for i in range(1, visible_inputs + 1):
                raw = kwargs.get("keyword%d" % i, "")
                sub_keywords = [k.strip() for k in str(raw).split(",") if k.strip()]
                if not sub_keywords:
                    continue
                for sub in sub_keywords:
                    match_kw = sub if case_sensitive else sub.lower()
                    if match_kw in search:
                        matched = i
                        matched_keyword = sub
                        matched_index = i
                        break
                if matched is not None:
                    break

        def _row(i):
            return (
                kwargs.get("preset%d" % i, "PLUS FACE (portraits)"),
                self._clamp(kwargs.get("weight%d" % i, 1.0), -1, 3, 1.0),
                kwargs.get("weight_type%d" % i, "prompt is more important"),
                kwargs.get("preset_faceid%d" % i, "FACEID PLUS V2"),
                self._clamp(kwargs.get("lora_strength%d" % i, 0.6), 0, 1, 0.6),
                self._clamp(kwargs.get("weight_faceid%d" % i, 1.0), -1, 3, 1.0),
                self._clamp(kwargs.get("weight_faceidv2%d" % i, 1.0), -1, 5, 1.0),
                kwargs.get("weight_type_faceid%d" % i, "linear"),
            )

        if matched is not None:
            chosen = _row(matched)
        else:
            chosen = _row(manual_n)
            matched_index = manual_n

        preset, weight, weight_type, preset_faceid, lora_strength, weight_faceid, weight_faceidv2, weight_type_faceid = chosen

        settings_text = str((
            str(preset), float(weight), str(weight_type),
            str(preset_faceid), float(lora_strength),
            float(weight_faceid), float(weight_faceidv2), str(weight_type_faceid),
        ))

        preset_number = "FaceIDPreset-%d" % matched_index

        return (
            str(preset), float(weight), str(weight_type),
            str(preset_faceid), float(lora_strength),
            float(weight_faceid), float(weight_faceidv2), str(weight_type_faceid),
            str(matched_keyword), int(matched_index), settings_text, preset_number,
        )

    def select_settings(self, visible_inputs, case_sensitive, reference_phrase="",
                        manual_preset="1", match_keywords="Yes",
                        unique_id=None, extra_pnginfo=None, **kwargs):
        visible_inputs = max(self.MIN_VISIBLE_INPUTS,
                             min(int(visible_inputs or self.MIN_VISIBLE_INPUTS), self.MAX_INPUTS))

        result = self._select_settings(visible_inputs, case_sensitive, reference_phrase,
                                       manual_preset, match_keywords, **kwargs)

        self._notify_executed(unique_id, result)

        return result

    def _notify_executed(self, unique_id, result):
        if unique_id is None:
            return
        try:
            from server import PromptServer  # type: ignore[import-not-found]

            PromptServer.instance.send_sync(
                "AUN_keyword_faceid_settings_executed",
                {
                    "node_id": str(unique_id),
                    "preset": result[0],
                    "weight": float(result[1]),
                    "weight_type": result[2],
                    "preset_faceid": result[3],
                    "lora_strength": float(result[4]),
                    "weight_faceid": float(result[5]),
                    "weight_faceidv2": float(result[6]),
                    "weight_type_faceid": result[7],
                    "matched_keyword": result[8],
                    "matched_index": int(result[9]),
                    "preset_number": result[11],
                },
            )
        except Exception:
            pass


NODE_CLASS_MAPPINGS = {
    "AUNKeywordFaceIDSettings": AUNKeywordFaceIDSettings,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNKeywordFaceIDSettings": "Keyword FaceID Settings",
}