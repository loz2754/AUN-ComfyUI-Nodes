import torch


def _nested_tensor(parts):
    """Build a comfy NestedTensor.

    Imported lazily so a future ComfyUI move/rename of comfy.nested_tensor cannot
    stop the whole AUN pack from loading; only this node fails, at call time.
    """
    from comfy import nested_tensor

    return nested_tensor.NestedTensor(parts)


def _slice_item(value, i, n):
    """Return value[i:i+1] if value is a torch tensor whose shape[0] == n, else value unchanged."""
    if isinstance(value, torch.Tensor) and value.shape[0] == n:
        return value[i:i + 1]
    return value


def _item_args(args, i, n):
    """Build the model_function_wrapper args for batch item i.

    Slices the input, timestep and every per-item tensor in c, and gives the item
    its own cond/uncond label.
    """
    x = args["input"]
    t = args["timestep"]
    c = args["c"]
    coc = args["cond_or_uncond"]

    # Determine chunk index for item i
    num_chunks = len(coc)
    chunk_size = n // num_chunks
    chunk_idx = i // chunk_size
    item_coc = coc[chunk_idx]

    # Slice input and timestep
    item_x = x[i:i + 1]
    item_t = t[i:i + 1]

    # Process c dict
    item_c = {}
    for key, value in c.items():
        if key == "transformer_options":
            # Shallow copy transformer_options
            to_copy = dict(value)
            # Slice tensors in transformer_options if shape[0] == n
            for to_key, to_val in to_copy.items():
                if isinstance(to_val, torch.Tensor) and to_val.shape[0] == n:
                    to_copy[to_key] = to_val[i:i + 1]
            # Set cond_or_uncond if present
            if "cond_or_uncond" in to_copy:
                to_copy["cond_or_uncond"] = [item_coc]
            item_c[key] = to_copy
        else:
            item_c[key] = _slice_item(value, i, n)

    return {
        "input": item_x,
        "timestep": item_t,
        "c": item_c,
        "cond_or_uncond": [item_coc],
    }


def make_split_wrapper(prev):
    """Wrapper that runs the model once per batch item and concatenates the outputs on dim 0.

    prev is an existing model_function_wrapper or None; the per-item call goes
    through it when set.
    """

    def call(apply_model, a):
        if prev is not None:
            return prev(apply_model, a)
        return apply_model(a["input"], a["timestep"], **a["c"])

    def wrapper(apply_model, args):
        x = args["input"]
        n = x.shape[0]

        # If nested or batch size 1, call once
        if x.is_nested or n == 1:
            return call(apply_model, args)

        outs = []
        for i in range(n):
            item_args = _item_args(args, i, n)
            out = call(apply_model, item_args)
            outs.append(out)

        return torch.cat(outs, dim=0)

    return wrapper


class AUNH3BatchSplit:
    DESCRIPTION = (
        "MiniMax H3 only samples batch size 1. This patches a clone of the model to run each batch "
        "item in turn and repeats the input latent batch_size times, so one KSampler pass can produce "
        "a batch of images while every item still gets its own noise from the KSampler seed. "
        "Per-item input, timestep, conditioning tensors and cond_or_uncond labels are sliced to match. "
        "Use the MiniMax H3 Split Video Batch node after the video decode to turn the batch back into "
        "one clip per item. Batch size 1 passes the model and latent through unchanged."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL", {
                    "tooltip": "MiniMax H3 model to patch. The wrapper is applied to a clone, so the original model is left untouched.",
                }),
                "latent": ("LATENT", {
                    "tooltip": "Latent to repeat. Batch index and noise mask are dropped because every item gets its own noise from the KSampler seed.",
                }),
                "batch_size": ("INT", {
                    "default": 2,
                    "min": 1,
                    "max": 64,
                    "tooltip": "Images per run. Each gets its own noise from the KSampler seed.",
                }),
            }
        }

    RETURN_TYPES = ("MODEL", "LATENT")
    RETURN_NAMES = ("model", "latent")
    FUNCTION = "apply"
    CATEGORY = "AUN Nodes/Video"

    def apply(self, model, latent, batch_size):
        m = model.clone()
        existing_wrapper = m.model_options.get("model_function_wrapper")
        new_wrapper = make_split_wrapper(existing_wrapper)
        m.set_model_unet_function_wrapper(new_wrapper)

        if batch_size > 1:
            new_latent = dict(latent)
            # Drop keys if present
            if "batch_index" in new_latent:
                del new_latent["batch_index"]
            if "noise_mask" in new_latent:
                del new_latent["noise_mask"]

            s = latent["samples"]
            if s.is_nested:
                # p-h3-image (and H3 video) latents carry a video and an audio stream: repeat each one
                new_latent["samples"] = _nested_tensor(
                    [t.repeat((batch_size,) + (1,) * (t.ndim - 1)) for t in s.unbind()]
                )
            else:
                new_latent["samples"] = s.repeat((batch_size,) + (1,) * (s.ndim - 1))
        else:
            new_latent = latent

        return (m, new_latent)


class AUNH3SplitVideoBatch:
    DESCRIPTION = (
        "Splits a batched MiniMax H3 video decode into one clip per batch item, so Save Video / "
        "VHS Video Combine writes a separate file for each, each with its own audio. "
        "Every output is a list, so the list is expanded one clip at a time. Set batch_size to the "
        "same value used on the MiniMax H3 Batch node, or leave it at 0 to read the clip count from "
        "the connected audio batch. The frame count must divide evenly by the clip count."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {
                    "tooltip": "Batched video frames from the video VAEDecode. Split evenly into batch_size clips.",
                }),
                "batch_size": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 64,
                    "tooltip": "0 = read it from the audio batch. Set it when no audio is connected.",
                }),
            },
            "optional": {
                "audio": ("AUDIO", {
                    "tooltip": "Optional batched audio matching the video batch. When batch_size is 0 its batch count sets the number of clips; a single-batch audio is reused for every clip.",
                }),
            },
        }

    RETURN_TYPES = ("IMAGE", "AUDIO")
    RETURN_NAMES = ("images", "audio")
    OUTPUT_IS_LIST = (True, True)
    FUNCTION = "split"
    CATEGORY = "AUN Nodes/Video"

    def split(self, images, batch_size, audio=None):
        n = batch_size
        if n == 0:
            n = audio["waveform"].shape[0] if audio is not None else 1

        total = images.shape[0]
        if total % n != 0:
            raise ValueError(
                f"{total} frames do not divide into {n} clips; set batch_size to the value used on the MiniMax H3 Batch node"
            )

        f = total // n
        image_list = [images[i * f:(i + 1) * f] for i in range(n)]

        if audio is None:
            audio_list = [None] * n
        else:
            w = audio["waveform"]
            if w.shape[0] == n:
                audio_list = [{**audio, "waveform": w[i:i + 1]} for i in range(n)]
            elif w.shape[0] == 1:
                audio_list = [audio] * n
            else:
                raise ValueError(f"audio batch {w.shape[0]} does not match {n} clips")

        return (image_list, audio_list)


NODE_CLASS_MAPPINGS = {
    "AUNH3BatchSplit": AUNH3BatchSplit,
    "AUNH3SplitVideoBatch": AUNH3SplitVideoBatch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNH3BatchSplit": "MiniMax H3 Batch (Split Per Image)",
    "AUNH3SplitVideoBatch": "MiniMax H3 Split Video Batch",
}
