class AUNSetBypassByTitle:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "titles": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "tooltip": "Titles separated by newline, comma, or semicolon. Use '!' or '-' prefix for exclusion (e.g. 'image, !load')."
                    }
                ),
                "Switch": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "label_on": "Active 🟢",
                        "label_off": "Bypass 🔴",
                        "tooltip": "Set to '🟢 Active' to enable nodes, '🔴 Bypass' to disable."
                    }
                ),
            }
        }

    FUNCTION = "doit"
    CATEGORY = "AUN Nodes/Node Control"
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    OUTPUT_NODE = True
    DESCRIPTION = "Sets bypass state for nodes whose titles match any of the provided titles (one per line)."

    def doit(self, titles, Switch):
        try:
            from server import PromptServer
            import re
            items = [t.strip() for t in re.split(r'[,\n;]+', titles) if t.strip()]
            if not items:
                return ()
            PromptServer.instance.send_sync(
                "AUN_set_bypass_by_titles",
                {"titles": items, "is_active": bool(Switch)}
            )
        except Exception as e:
            print(f"[AUNSetBypassByTitle] Could not send bypass by titles: {e}")
        return ()

NODE_CLASS_MAPPINGS = {"AUNSetBypassByTitle": AUNSetBypassByTitle}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNSetBypassByTitle": "AUN Bypass By Title"}
