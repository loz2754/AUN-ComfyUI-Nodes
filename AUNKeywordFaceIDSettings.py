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
        }

        optional = {
            "reference_phrase": ("STRING", {
                "default": "",
                "forceInput": True,
                "multiline": True,
                "tooltip": "Text to scan for keywords. Keywords are matched as substrings.",
            }),
            "preset_default": (cls.UNIFIED_PRESETS, {
                "default": "PLUS FACE (portraits)",
                "tooltip": "IPAdapterUnifiedLoader preset used when no keyword matches.",
            }),
            "weight_default": cls._weight_spec("IPAdapterSimple weight used when no keyword matches."),
            "weight_type_default": (cls.WEIGHT_TYPES_SIMPLE, {
                "default": "prompt is more important",
                "tooltip": "IPAdapterSimple weight_type used when no keyword matches.",
            }),
            "preset_faceid_default": (cls.FACEID_PRESETS, {
                "default": "FACEID PLUS V2",
                "tooltip": "IPAdapterUnifiedLoaderFaceID preset used when no keyword matches.",
            }),
            "lora_strength_default": cls._lora_strength_spec("FaceID LoRA strength used when no keyword matches."),
            "weight_faceid_default": cls._weight_spec("IPAdapterFaceID weight used when no keyword matches."),
            "weight_faceidv2_default": cls._weight_faceidv2_spec("IPAdapterFaceID weight_faceidv2 used when no keyword matches."),
            "weight_type_faceid_default": (cls.WEIGHT_TYPES, {
                "default": "linear",
                "tooltip": "IPAdapterFaceID weight_type used when no keyword matches.",
            }),
        }

        for i in range(1, cls.MAX_INPUTS + 1):
            optional["keyword%d" % i] = ("STRING", {
                "default": "",
                "tooltip": "Keyword %d to match against the reference phrase. Matched as a substring." % i,
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

    RETURN_TYPES = ("STRING", "FLOAT", "STRING", "STRING", "FLOAT", "FLOAT", "FLOAT", "STRING", "STRING", "INT", "STRING")
    RETURN_NAMES = (
        "preset", "weight", "weight_type", "preset_faceid", "lora_strength",
        "weight_faceid", "weight_faceidv2", "weight_type_faceid",
        "matched_keyword", "matched_index", "settings_text",
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

    def _select_settings(self, visible_inputs, case_sensitive, reference_phrase, kwargs):
        search = reference_phrase if case_sensitive else reference_phrase.lower()

        matched = None
        matched_keyword = ""
        matched_index = 0
        for i in range(1, visible_inputs + 1):
            keyword = kwargs.get("keyword%d" % i, "")
            if not keyword:
                continue
            match_kw = keyword if case_sensitive else keyword.lower()
            if match_kw in search:
                matched = i
                matched_keyword = keyword
                matched_index = i
                break

        if matched is not None:
            preset = kwargs.get("preset%d" % matched, "PLUS FACE (portraits)")
            weight = self._clamp(kwargs.get("weight%d" % matched, 1.0), -1, 3, 1.0)
            weight_type = kwargs.get("weight_type%d" % matched, "prompt is more important")
            preset_faceid = kwargs.get("preset_faceid%d" % matched, "FACEID PLUS V2")
            lora_strength = self._clamp(kwargs.get("lora_strength%d" % matched, 0.6), 0, 1, 0.6)
            weight_faceid = self._clamp(kwargs.get("weight_faceid%d" % matched, 1.0), -1, 3, 1.0)
            weight_faceidv2 = self._clamp(kwargs.get("weight_faceidv2%d" % matched, 1.0), -1, 5, 1.0)
            weight_type_faceid = kwargs.get("weight_type_faceid%d" % matched, "linear")
        else:
            preset = kwargs.get("preset_default", "PLUS FACE (portraits)")
            weight = self._clamp(kwargs.get("weight_default", 1.0), -1, 3, 1.0)
            weight_type = kwargs.get("weight_type_default", "prompt is more important")
            preset_faceid = kwargs.get("preset_faceid_default", "FACEID PLUS V2")
            lora_strength = self._clamp(kwargs.get("lora_strength_default", 0.6), 0, 1, 0.6)
            weight_faceid = self._clamp(kwargs.get("weight_faceid_default", 1.0), -1, 3, 1.0)
            weight_faceidv2 = self._clamp(kwargs.get("weight_faceidv2_default", 1.0), -1, 5, 1.0)
            weight_type_faceid = kwargs.get("weight_type_faceid_default", "linear")

        settings_text = str((
            str(preset), float(weight), str(weight_type),
            str(preset_faceid), float(lora_strength),
            float(weight_faceid), float(weight_faceidv2), str(weight_type_faceid),
        ))

        return (
            str(preset), float(weight), str(weight_type),
            str(preset_faceid), float(lora_strength),
            float(weight_faceid), float(weight_faceidv2), str(weight_type_faceid),
            str(matched_keyword), int(matched_index), settings_text,
        )

    def select_settings(self, visible_inputs, case_sensitive, reference_phrase="",
                        unique_id=None, extra_pnginfo=None, **kwargs):
        visible_inputs = max(self.MIN_VISIBLE_INPUTS,
                             min(int(visible_inputs or self.MIN_VISIBLE_INPUTS), self.MAX_INPUTS))

        result = self._select_settings(visible_inputs, case_sensitive, reference_phrase, kwargs)

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