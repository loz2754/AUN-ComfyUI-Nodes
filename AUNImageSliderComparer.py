from __future__ import annotations

from nodes import PreviewImage, SaveImage


class AUNImageSliderComparer(PreviewImage):
    """Compare two images side-by-side with a draggable slider divider."""

    MAX_PAIRS = 5

    INPUT_IS_LIST = True

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "pair": (
                    [f"Pair {i}" for i in range(1, cls.MAX_PAIRS + 1)],
                    {
                        "default": "Pair 1",
                        "tooltip": "Which named pair to display. Slot labels show the name of the connected output slot, or can be changed manually by right-clicking the input slot and choosing 'Rename Slot'.",
                    },
                ),
                "frame": (
                    [str(i) for i in range(1, 65)],
                    {
                        "default": "1",
                        "tooltip": "Which frame (batch index) of the selected pair to view. Frame i of the left input is matched with frame i of the right input.",
                    },
                ),
                "save_active": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "When enabled, the currently displayed left/right frame of the active pair is saved into the output folder with the prefix below.",
                    },
                ),
                "prefix": (
                    "STRING",
                    {
                        "default": "AUNImageSliderComparer/Compare",
                        "tooltip": "Filename prefix used for the active-frame output save.",
                    },
                ),
            },
            "optional": {},
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }
        for i in range(1, cls.MAX_PAIRS + 1):
            inputs["optional"][f"pair{i}_left"] = (
                "IMAGE",
                {
                    "forceInput": True,
                    "tooltip": f"Left image of pair {i}. May be a batch or a list of frames; frames are matched by index with the right input.",
                },
            )
            inputs["optional"][f"pair{i}_right"] = (
                "IMAGE",
                {
                    "forceInput": True,
                    "tooltip": f"Right image of pair {i}. May be a batch or a list of frames; frames are matched by index with the left input.",
                },
            )
        return inputs

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "compare"
    OUTPUT_NODE = True
    CATEGORY = "AUN Nodes/Image"

    DESCRIPTION = (
        "Compare several pairs of images with a slider. Up to five "
        "named pairs are accepted (pairN_left / pairN_right). Each input may be "
        "a batched tensor or a list of frames; frames are matched by index (a "
        "single-frame side shows in both). Use the Pair dropdown to pick "
        "which pair to view and the Frame dropdown to pick the frame. Slots, "
        "dropdown, and node title show the name of the connected output slot so "
        "the active pair is always obvious. Right-click the node to switch "
        "between Drag (click and drag to scrub) and Slide (slider follows the "
        "mouse without clicking) modes."
    )

    def compare(self, pair, frame, prompt=None, extra_pnginfo=None, **kwargs):
        pair = self._first(pair)
        frame = self._first(frame)
        prompt = self._first(prompt)
        extra_pnginfo = self._first(extra_pnginfo)
        save_active = bool(self._first(kwargs.get("save_active", False)))
        prefix = str(self._first(kwargs.get("prefix", "")) or "AUNImageSliderComparer")

        pair_index = self._parse_pair_index(pair)
        slot_names = [
            f"pair{i}_{side}"
            for i in range(1, self.MAX_PAIRS + 1)
            for side in ("left", "right")
        ]
        names = self._read_slot_names(extra_pnginfo, *slot_names)

        pairs = []
        frame_store = {}
        any_connected = False
        for i in range(1, self.MAX_PAIRS + 1):
            left_key = f"pair{i}_left"
            right_key = f"pair{i}_right"
            left = kwargs.get(left_key)
            right = kwargs.get(right_key)

            left_name = names.get(left_key, f"Pair {i} Left")
            right_name = names.get(right_key, f"Pair {i} Right")

            left_frames = self._to_frames(left)
            right_frames = self._to_frames(right)
            if left_frames is None or right_frames is None:
                pairs.append(
                    {
                        "empty": True,
                        "pair_index": i,
                        "left_name": left_name,
                        "right_name": right_name,
                        "pair_name": f"Pair {i}",
                        "frame_index": 1,
                        "frame_count": 1,
                        "batch": False,
                        "left_images": [],
                        "right_images": [],
                    }
                )
                continue

            any_connected = True

            left_images = self._save_frames(
                left_frames, f"AUNImageSliderComparer_left{i}", prompt, extra_pnginfo
            )
            right_images = self._save_frames(
                right_frames, f"AUNImageSliderComparer_right{i}", prompt, extra_pnginfo
            )

            if len(left_images) == 1 and len(right_images) > 1:
                left_images = left_images * len(right_images)
            elif len(right_images) == 1 and len(left_images) > 1:
                right_images = right_images * len(left_images)

            frame_count = min(len(left_images), len(right_images))
            frame_index = max(1, min(int(frame), frame_count))
            frame_store[i] = (left_frames, right_frames, frame_index)

            pairs.append(
                {
                    "empty": False,
                    "pair_index": i,
                    "left_name": left_name,
                    "right_name": right_name,
                    "pair_name": f"{left_name} vs {right_name}",
                    "frame_index": frame_index,
                    "frame_count": frame_count,
                    "batch": frame_count > 1,
                    "left_images": left_images,
                    "right_images": right_images,
                }
            )

        active = pairs[pair_index - 1]
        comparer = dict(active)
        comparer["pair_index"] = pair_index
        comparer["frame_index"] = active["frame_index"]
        comparer["frame_count"] = active["frame_count"]
        comparer["pairs"] = pairs
        if not any_connected:
            comparer["empty"] = True
        if save_active and pair_index in frame_store and not active["empty"]:
            left_frames, right_frames, frame_index = frame_store[pair_index]
            comparer["saved_images"] = self._save_active_frames(
                left_frames,
                right_frames,
                frame_index,
                prefix,
                prompt,
                extra_pnginfo,
            )
        return {"ui": {"comparer": [comparer]}}

    # ── helpers ─────────────────────────────────────────────────

    @staticmethod
    def _first(value):
        """Unwrap a 1-element list wrapper (INPUT_IS_LIST passes every input as a list)."""
        if isinstance(value, (list, tuple)):
            return value[0] if value else None
        return value

    @staticmethod
    def _coerce_tensors(value):
        """Normalize an input into a list of tensors (or None when disconnected)."""
        if value is None:
            return None
        if isinstance(value, (list, tuple)):
            items = [v for v in value if v is not None]
            return items or None
        return [value]

    @staticmethod
    def _to_frames(value):
        """Normalize an input into a flat list of single-frame tensors (or None)."""
        tensors = AUNImageSliderComparer._coerce_tensors(value)
        if tensors is None:
            return None
        frames = []
        for t in tensors:
            if t.dim() == 4:
                frames.extend(t[i] for i in range(t.shape[0]))
            else:
                frames.append(t)
        return frames or None

    def _save_frames(self, frames, prefix, prompt, extra_pnginfo):
        """Save each frame individually (frames may differ in size) and return filenames."""
        images = []
        for index, frame in enumerate(frames):
            saved = self.save_images(
                frame.unsqueeze(0), f"{prefix}_f{index}", prompt, extra_pnginfo
            )
            images.extend(saved.get("ui", {}).get("images", []))
        return images

    @staticmethod
    def _save_active_frames(left_frames, right_frames, frame_index, prefix, prompt, extra_pnginfo):
        """Re-save the currently displayed frame into the output folder (type=output)."""
        saver = SaveImage()
        left = left_frames[min(frame_index - 1, len(left_frames) - 1)]
        right = right_frames[min(frame_index - 1, len(right_frames) - 1)]
        saved = []
        for side, frame in (("L", left), ("R", right)):
            out = saver.save_images(
                frame.unsqueeze(0), f"{prefix}_{side}", prompt, extra_pnginfo
            )
            saved.extend(out.get("ui", {}).get("images", []))
        return saved

    @staticmethod
    def _parse_pair_index(pair):
        try:
            idx = int(str(pair).replace("Pair", "").strip())
        except (TypeError, ValueError):
            idx = 1
        return max(1, min(idx, AUNImageSliderComparer.MAX_PAIRS))

    @staticmethod
    def _read_slot_names(extra_pnginfo, *slot_names):
        """Map each requested input slot name to the connected output slot label."""
        names = {}
        if extra_pnginfo is None:
            return names

        workflow = extra_pnginfo.get("workflow", {})
        nodelist = workflow.get("nodes", [])
        links = workflow.get("links", [])

        for node in nodelist:
            if not isinstance(node, dict):
                continue
            inputs = node.get("inputs", [])
            if isinstance(inputs, dict):
                inputs = list(inputs.values())
            if not isinstance(inputs, list):
                continue

            manual_labels = node.get("properties", {}).get("input_labels", {}) or {}
            if not isinstance(manual_labels, dict):
                manual_labels = {}

            for slot in inputs:
                if not isinstance(slot, dict):
                    continue
                slot_name = slot.get("name", "")
                if slot_name not in slot_names:
                    continue
                manual = str(manual_labels.get(slot_name, "") or "").strip()
                if manual:
                    names[slot_name] = manual
                    continue
                label = str(slot.get("label") or "").strip()
                if label and label != slot_name:
                    names[slot_name] = label
                    continue
                link_id = slot.get("link")
                if link_id is None:
                    continue

                for link in links:
                    link_id_val = None
                    origin_node_id = None
                    origin_slot_idx = None
                    if isinstance(link, dict):
                        link_id_val = link.get("id")
                        origin_node_id = link.get("origin_id")
                        origin_slot_idx = link.get("origin_slot")
                    elif isinstance(link, list) and len(link) >= 5:
                        link_id_val = link[0]
                        origin_node_id = link[1]
                        origin_slot_idx = link[2]

                    if str(link_id_val) != str(link_id):
                        continue

                    src_node = next(
                        (n for n in nodelist if str(n.get("id")) == str(origin_node_id)),
                        None,
                    )
                    if src_node and origin_slot_idx is not None:
                        outputs = src_node.get("outputs", [])
                        if (
                            isinstance(outputs, list)
                            and origin_slot_idx < len(outputs)
                            and isinstance(outputs[origin_slot_idx], dict)
                        ):
                            out = outputs[origin_slot_idx]
                            label = (out.get("label") or "").strip()
                            names[slot_name] = label or out.get("name", slot_name)
                    break
        return names


NODE_CLASS_MAPPINGS = {
    "AUNImageSliderComparer": AUNImageSliderComparer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNImageSliderComparer": "AUN Image Slider Comparer",
}
