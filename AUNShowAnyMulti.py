import base64
import io
import json

import numpy as np
import torch


class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False


any_type = AlwaysEqualProxy("*")

_MAX_VALUE_LEN = 500
_MAX_IMG_SIDE = 400


class AUNShowAnyMulti:
    MAX_INPUTS = 20

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {},
            "optional": {},
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }
        for i in range(1, cls.MAX_INPUTS + 1):
            inputs["optional"][f"input_{i}"] = (any_type, {
                "forceInput": True,
                "tooltip": f"Any-type input {i}. Displays type, string representation, and image preview when applicable.",
            })
        return inputs

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "show_multi"
    OUTPUT_NODE = True
    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = (
        "Inspects up to 20 connected inputs of any type. Shows the type name, "
        "a string representation of each value, and an inline image preview "
        "for IMAGE inputs. Useful as a universal debug / inspector node."
        "\n\nRight-click -> \"Collapse Connections\" or double-click to hide "
        "slot labels and converge connection lines."
        "\nRight-click -> \"Show/Hide Data Types\" to toggle the type badge on each entry."
    )

    def show_multi(self, unique_id=None, extra_pnginfo=None, **kwargs):
        captions, type_map = self._read_graph_meta(unique_id, extra_pnginfo)

        entries = []
        for i in range(1, self.MAX_INPUTS + 1):
            key = f"input_{i}"
            value = kwargs.get(key)
            if value is None:
                continue

            caption = captions.get(key, f"Input {i}")
            type_name = type_map.get(key, self._infer_type(value))
            entry = {"caption": caption, "type": type_name, "value": "", "preview": None}

            if type_name == "IMAGE":
                entry["preview"] = self._image_to_base64(value)
                entry["value"] = self._image_summary(value)
            elif type_name == "STRING":
                entry["value"] = str(value)[:_MAX_VALUE_LEN]
            elif type_name == "LATENT":
                entry["value"] = self._latent_summary(value)
            elif type_name == "MODEL":
                entry["value"] = f"MODEL object ({type(value).__name__})"
            elif type_name == "CLIP":
                entry["value"] = f"CLIP object ({type(value).__name__})"
            elif type_name == "VAE":
                entry["value"] = f"VAE object ({type(value).__name__})"
            elif isinstance(value, dict):
                entry["value"] = self._safe_json(value)
            elif isinstance(value, (list, tuple)):
                entry["value"] = self._safe_json(value)
            elif isinstance(value, torch.Tensor):
                entry["value"] = (
                    f"Tensor(shape={list(value.shape)}, "
                    f"dtype={value.dtype}, device={value.device})"
                )[:_MAX_VALUE_LEN]
            else:
                entry["value"] = str(value)[:_MAX_VALUE_LEN]

            entries.append(entry)

        return {"ui": {"entries": entries}}

    # ── graph helpers ───────────────────────────────────────────────

    @staticmethod
    def _read_graph_meta(unique_id, extra_pnginfo):
        captions = {}
        type_map = {}
        if unique_id is None or extra_pnginfo is None:
            return captions, type_map

        workflow = extra_pnginfo.get("workflow", {})
        nodelist = workflow.get("nodes", [])
        links = workflow.get("links", [])

        my_node = next(
            (n for n in nodelist if str(n.get("id")) == str(unique_id)),
            None,
        )
        if not my_node:
            return captions, type_map

        inputs_data = my_node.get("inputs", [])
        if isinstance(inputs_data, dict):
            input_list = list(inputs_data.values())
        elif isinstance(inputs_data, list):
            input_list = inputs_data
        else:
            return captions, type_map

        for slot in input_list:
            if not isinstance(slot, dict):
                continue
            slot_name = slot.get("name", "")
            if not slot_name.startswith("input_"):
                continue
            link_id = slot.get("link")
            if link_id is None:
                continue

            for link in links:
                link_id_val = None
                origin_node_id = None
                origin_slot_idx = None
                type_str = None

                if isinstance(link, dict):
                    link_id_val = link.get("id")
                    origin_node_id = link.get("origin_id")
                    origin_slot_idx = link.get("origin_slot")
                    type_str = link.get("type")
                elif isinstance(link, list) and len(link) >= 5:
                    link_id_val = link[0]
                    origin_node_id = link[1]
                    origin_slot_idx = link[2]
                    if len(link) >= 6:
                        type_str = link[5]

                if str(link_id_val) != str(link_id):
                    continue

                if type_str:
                    type_map[slot_name] = str(type_str).upper()

                src_node = next(
                    (n for n in nodelist if str(n.get("id")) == str(origin_node_id)),
                    None,
                )
                if src_node:
                    outputs = src_node.get("outputs", [])
                    if isinstance(outputs, list) and origin_slot_idx is not None and origin_slot_idx < len(outputs):
                        out_slot = outputs[origin_slot_idx]
                        if isinstance(out_slot, dict):
                            label_val = (out_slot.get("label") or "").strip()
                            caption = label_val or out_slot.get("name", slot_name)
                            captions[slot_name] = caption
                break

        return captions, type_map

    # ── value formatting ────────────────────────────────────────────

    @staticmethod
    def _infer_type(value):
        if isinstance(value, torch.Tensor):
            if value.ndim == 4 and value.shape[-1] in (1, 3, 4):
                return "IMAGE"
            return "TENSOR"
        if isinstance(value, dict):
            if "samples" in value:
                return "LATENT"
            if " conditioning" in value or "context" in value:
                return "CONDITIONING"
            return "DICT"
        if isinstance(value, (list, tuple)):
            return "LIST"
        if isinstance(value, str):
            return "STRING"
        return type(value).__name__.upper()

    @staticmethod
    def _image_to_base64(tensor):
        try:
            if isinstance(tensor, torch.Tensor):
                t = tensor
                if t.dim() == 3:
                    t = t.unsqueeze(0)
                if t.dim() == 4:
                    t = t[0]
                img_np = t.detach().cpu().numpy()
            else:
                return None

            img_np = np.clip(img_np * 255, 0, 255).astype(np.uint8)
            if img_np.ndim == 3 and img_np.shape[2] == 1:
                img_np = img_np[:, :, 0]

            from PIL import Image
            img = Image.fromarray(img_np)

            if max(img.size) > _MAX_IMG_SIDE:
                img.thumbnail((_MAX_IMG_SIDE, _MAX_IMG_SIDE), Image.LANCZOS)

            buf = io.BytesIO()
            img.save(buf, format="PNG", optimize=True)
            return base64.b64encode(buf.getvalue()).decode("ascii")
        except Exception:
            return None

    @staticmethod
    def _image_summary(tensor):
        if isinstance(tensor, torch.Tensor):
            t = tensor
            if t.dim() == 4:
                t = t[0]
            if t.dim() == 3:
                h, w = t.shape[0], t.shape[1]
                return f"{w} x {h}"
        return str(tensor)[:_MAX_VALUE_LEN]

    @staticmethod
    def _latent_summary(latent):
        if isinstance(latent, dict):
            samples = latent.get("samples")
            if isinstance(samples, torch.Tensor):
                return f"Latent tensor shape={list(samples.shape)}, dtype={samples.dtype}"
            return f"Latent dict with keys: {', '.join(latent.keys())}"
        return str(latent)[:_MAX_VALUE_LEN]

    @staticmethod
    def _safe_json(obj):
        try:
            s = json.dumps(obj, default=str, ensure_ascii=False)
        except Exception:
            s = str(obj)
        return s[:_MAX_VALUE_LEN]


NODE_CLASS_MAPPINGS = {
    "AUNShowAnyMulti": AUNShowAnyMulti,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNShowAnyMulti": "Show Any Multi",
}
