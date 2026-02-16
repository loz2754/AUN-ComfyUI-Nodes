import os
import re

# Minimal known short names (centralized here). Keys are basenames without extension.
MODEL_SHORT_NAMES = {
    "sd_xl_base_1.0": "SDXLBase",
    "sd_xl_refiner_1.0": "SDXLRef",
    "realisticVisionV60B1_v60VAE": "RealisticVis60",
    "juggernautXL_v8Rundiffusion": "JuggerXL8",
    "Afroditexl_XL31": "AfroditeXL31",
    "bemypony_Photo": "BeMyPonyPhoto",
    "bigLove_pony2": "BigLovePny2",
    "bigLust_v10": "BigLust10",
    "cyberillustrious_v60Alt": "CyberIllus60Alt",
    "cyberrealisticPony_v65": "CyberRealPny65",
    "damnPonyxlRealistic_v30": "DamnPnyReal30",
    "dreamshaperXL_alpha2Xl10": "DrmShprXLalpha2",
    "dreamshaperXL_lightningDPMSDE": "DrmShprXLLtgDPMSDE",
    "dreamshaperXL_lightningInpaint": "DrmShprXLLtgInpaint",
    "fennfotoPONY_v2": "FennFotoPny2",
    "juggernautXL_v9Rdphoto2Lightning": "JuggerXL9Ltg",
    "lustifySDXLNSFWSFW_v40": "LustifyXL40",
    "musesThalia_v10": "MusesThalia10",
    "nattyRealisticSDXL_v20": "NattyRealistic20",
    "omnigenxlNSFWSFW_v10": "OmnigenXL10",
    "onlyfornsfw118_v20": "Only4NSFW118v20",
    "ponyRealism_v21Lightning4SVAE": "PnyRealism21Ltg4",
    "ponyRealism_v21MainVAE": "PnyRealism21",
    "pyrosNSFWSDXL_v05": "PyrosNSFWXL05",
    "RealLoliDWXL.fp16": "RealLoliDWXL",
    "realvisxlV50_v50Bakedvae": "RealVisXL50",
    "realvisxlV50_v50LightningBakedvae": "RealVisXL50Ltg",
    "rsmpornxlEmbraceTheSuck_v081Beta": "EmbrTheSuckXL081B",
    "sd_xl_turbo_1.0_fp16": "SDXLTurbo",
    "silverstarXL_v6": "SilverStarXL6",
    "stallionDreamsPONY_V10": "StallionDreamsPny10",
    "turbovisionxlSuperFastXL": "TurboVisionXL_SupFast",
    "ultraspice_XLturbo_v10": "UltraSpiceXLTurbo10",
    "virileStallion_v50Photoreal": "VirileStallion50PhtReal",
    "wai_REALE_v10": "WAI-REALE10",
    "zavychromaxl_v100": "ZavyChromaXL100",
    "absolutereality_v181": "AbsReality181",
    "addictivefuture_v1": "AddictFuture1",
    "BoyModel_01": "BoyModel01",
    "chilloutmix_NiPrunedFp32Fix": "Chilloutmix-NiFP32",
    "cyberrealistic_v50": "CyberReal50",
    "cyberrealistic_v50-inpainting": "CyberReal50Inpaint",
    "D5K6.0": "D5K60",
    "Deliberate_v2": "Deliberate2",
    "dreamlikePhotoreal20": "DreamlikePhtReal20",
    "epicphotogasm_amateurreallife": "EpicPhotogasmAmateurRL",
    "epicphotogasm_ultimateFidelity": "EpicPhotogasmUltFid",
    "epicphotogasm_z-inpainting": "EpicPhotogasmZInpaint",
    "epicrealism_naturalSinRC1VAE": "EpicRealismNatSinRC1",
    "icbinpICantBelieveIts_newYear": "ICBINPNewYear",
    "lazymixRealAmateur_v30b": "LazyMixRealAm30b",
    "peachfuzz_v20_fp16": "PeachFuzz20",
    "photon_v1": "Photon1",
    "porndream_v50": "PornDream50",
    "realhotspice_v20": "RealHotSpice20",
    "Realistic_Vision_V5.1-inpainting": "RealVis51Inpaint",
    "realisticVisionV60B1_v51VAE": "RealVisV60B1",
    "realisticVisionV60B1_v60B1InpaintingVAE": "RealVisV60B1Inpaint",
    "uberRealisticPornMerge_urpmv13": "UberRealPornMerge13",
    "v1-5-pruned-emaonly": "SD15-EMA",
    "flux1-dev-kontext_fp8_scaled": "Flux1DevKontextFP8scaled",
    "FramePack_F1_I2V_HY_20250503": "FramePackF1I2VHY",
    "FramePack_F1_I2V_HY_20250503_fp8_e4m3fn": "FramePackF1I2VHYFP8",
    "hidream_e1_full_bf16": "HiDreamE1BF16",
    "hidream_i1_dev_fp8": "HiDreamI1DevFP8",
    "hunyuan_video_image_to_video_720p_bf16": "HunyuanI2V720pBF16",
    "hunyuan_video_t2v_720p_bf16": "HunyuanT2V720pBF16",
    "hunyuan_video_v2_replace_image_to_video_720p_bf16": "HunyuanV2I2V720pBF16",
    "mp_rank_00_model_states_fp8": "MP_RankMdlStatesFP8",
    "wan2.1_flf2v_720p_14B_fp8_e4m3fn": "Wan21FLF2V720p14BFP8",
    "wan2.1_i2v_480p_14B_fp8_e4m3fn": "Wan21I2V480p14BFP8",
    "wan2.1_i2v_720p_14B_fp8_e4m3fn": "Wan21I2V720p14BFP8",
    "wan2.1_t2v_1.3B_fp16": "Wan21T2V1.3BFP16",
    "wan2.1_t2v_14B_fp8_e4m3fn": "Wan21T2V14BFP8",
    "wan2.2_i2v_high_noise_14B_fp16": "Wan22I2VHiNoise14BFP16",
    "wan2.2_i2v_high_noise_14B_fp8_scaled": "Wan22I2VHiNoise14BFP8",
    "wan2.2_i2v_low_noise_14B_fp16": "Wan22I2VLoNoise14BFP16",
    "wan2.2_i2v_low_noise_14B_fp8_scaled": "Wan22I2VLoNoise14BFP8",
    "wan2.2_t2v_high_noise_14B_fp8_scaled": "Wan22T2VHiNoise14BFP8",
    "wan2.2_t2v_low_noise_14B_fp8_scaled": "Wan22T2VLoNoise14BFP8",
    "W_Contextual_NSFW_Multiscene_Trigger_i2v_14b_v1": "WContextualI2V14Bv1",
    "wan2.1-i2v-14b-720p-Q6_K": "Wan21I2V720p14BQ6K_GGUF",
    "Wan2.1-VACE-14B-Q6_K": "Wan21VACE14BQ6K_GGUF",
    "Wan2.2-I2V-A14B-HighNoise-Q8_0": "Wan22I2V14BHiNoiseQ8_GGUF",
    "Wan2.2-I2V-A14B-LowNoise-Q8_0": "Wan22I2V14BLoNoiseQ8_GGUF",
    "Wan2.2-I2V-A14B-HighNoise-Q4_K_M": "Wan22I2V14BHiNoiseQ4_GGUF",
    "Wan2.2-I2V-A14B-LowNoise-Q4_K_M": "Wan22I2V14BLoNoiseQ4_GGUF",
    "wan2.2-i2v-rapid-aio": "Wan22I2VRapidAIO",
    "wan22EnhancedNSFWSVICamera_nolightningSVIFmFp8L": "Wan22EnhNSFWSVICamNoLtgFP8",
}

# Sampler short names (synced from AUNSaveImage)
SAMPLER_SHORT_NAMES = {
    "euler": "Euler",
    "euler_ancestral": "EulerA",
    "euler_ancestral_cfg_pp": "EulerA_CFGPP",
    "heun": "Heun",
    "dpm_2": "DPM2",
    "dpm_2_ancestral": "DPM2A",
    "dpm_2_ancestral_cfg_pp": "DPM2A_CFGPP",
    "dpm_fast": "DPMFast",
    "dpm_fast_adaptive": "DPMFastAdpt",
    "clyb_4m_sde_momentumized": "Clyb4MSDE_Mmntmzd",
    "dpmpp_dualsde_momentumized": "DualSDE_Mmntmzd",
    "dpmpp_2m_sde_gpu": "DPMPP2MSDE_GPU",
    "dpmpp_2m_sde": "DDPMPP2M_SDE",
    "dpmpp_3m_sde": "DDPMPP3M_SDE",
    "dpmpp_2s_ancestral": "DPMPP2S_A",
    "dpmpp_2s_ancestral_cfg_pp": "DPMPP2S_A_CFGPP",
    "dpmpp_2m": "DPMPP_2M",
    "dpmpp_2m_ancestral": "DPMPP2M_A",
    "dpmpp_sde": "DPMPP_SDE",
    "dpmpp_3m_sde_gpu": "DPMPP3MSDE_GPU",
    "ddpm": "DDPM",
    "ddim": "DDIM",
    "lcm": "LCM",
    "lcm_custom_noise": "LCM_CstmNoise",
    "deis": "DEIS",
    "res_multistep": "ResMS",
    "res_multistep_ancestral": "ResMSA",
    "res_multistep_ancestral_cfg_pp": "ResMSA_CFGPP",
    "res_momentumized": "ResMntmzd",
    "gradient_estimation": "GradEst",
    "gradient_estimation_cfg_pp": "GradEst_CFGPP",
    "er_sde": "ER_SDE",
    "sa_solver": "SA_Solver",
    "sa_solver_pece": "SA_Solver_PECE",
    "uni_pc": "Uni_PC",
    "uni_pc_bh2": "Uni_PC_BH2",
    "dpmpp_3m_sde-dynamic_eta": "DPMPP3MSDE_Dyn_Eta",
}

# Scheduler short names (synced from AUNSaveImage)
SCHEDULER_SHORT_NAMES = {
    "normal": "Normal",
    "simple": "Simple",
    "karras": "Karras",
    "exponential": "Exp",
    "ddim_uniform": "DDIM_Uni",
    "beta": "Beta",
    "linear_quadratic": "LinQuad",
    "kl_optimal": "KL_Opt",
    "AYS SDXL": "AYS_SDXL",
}

# LoRA short names (synced from AUNSaveImage)
LORA_SHORT_NAMES = {
    "wan22-ultimatedeepthroat-I2V-16epoc-low-k3nk": "Wan22UltDpThroatI2VLow",
    "wan22-ultimatedeepthroat-I2V-34epoc-high-k3nk": "Wan22UltDpThroatI2VHi",
    "Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1-high": "Wan22I2V4StepsHi",
    "Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1-low": "Wan22I2V4StepsLow",
    "lighting Slider_alpha1.0_rank4_noxattn_last": "LightSlidAlpha1",
    "Dualingus-PonyXL-V1": "DualingusV1",
    "BoobPhysics_WAN_v7": "BoobPhysicsWanV7",
    "wan2.2-i2v-high-sex-fov-slider-v1.0": "Wan22I2VHiSexFov",
    "wan2.2-i2v-low-sex-fov-slider-v1.0": "Wan22I2VLowSexFov",
    "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise_rank64": "Wan22I2VLightX2V4StepLow",
    "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise_rank64": "Wan22I2VLightX2V4StepHi",
    "wan22-ultimatedeepthroat-I2V-101epoc-low-k3nk": "Wan22UltDpThroatI2VLow",
    "wan22-ultimatedeepthroat-i2v-102epoc-high-k3nk": "Wan22UltDpThroatI2VHi",
}

def sanitize_for_filename(value: str) -> str:
    if value is None:
        return ""
    s = str(value).strip().replace("\\", "/").split("/")[-1]
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^A-Za-z0-9._()+\-@]", "", s)
    s = re.sub(r"[_\-]{3,}", "--", s)
    return s

def auto_shorten_model_name(model_basename: str) -> str:
    if not model_basename:
        return ""
    name_wo_ext = os.path.splitext(model_basename)[0]
    s = name_wo_ext.replace('_', ' ').replace('-', ' ').strip()
    if not s:
        return name_wo_ext
    filler = {
        'sd', 'sdxl', 'base', 'refiner', 'vae', 'pruned', 'inpaint', 'inpainting',
        'fp16', 'fp32', 'fp8', 'bf16', 'ema', 'clip', 'model', 'v', 'rev', 'safetensors', 'ckpt', 'gguf'
    }
    tokens = [t for t in s.split() if t and t.lower() not in filler] or s.split()
    vowels = set('aeiouAEIOU')
    def trim_token(tok: str) -> str:
        if len(tok) <= 8:
            return tok
        # remove vowels
        compact = ''.join(ch for ch in tok if ch.isdigit() or ch not in vowels)
        if len(compact) < 4:
            compact = tok[:6]
        return compact[:8]
    short = ''.join(trim_token(t).capitalize() for t in tokens[:3])
    if not any(c.isdigit() for c in short):
        tail = ''.join(c for c in name_wo_ext if c.isdigit())
        short = (short + tail)[:20]
    short = short[:32]
    return sanitize_for_filename(short)

def candidate_from_val(val: str, exclude_lora_like: bool = True) -> str | None:
    if not isinstance(val, str) or not val:
        return None
    v = val.strip()
    lv = v.lower()
    if exclude_lora_like and ("lora" in lv or "ipadapter" in lv or "ip-adapter" in lv or "ip_adapter" in lv):
        return None
    exts = (".gguf", ".safetensors", ".ckpt", ".bin", ".pt")
    if lv.endswith(exts):
        return v
    if re.search(r"wan\d|sdxl|i2v|t2v|unet|diffuser|model", lv):
        return v
    return None

def extract_from_node(node: dict | None) -> str | None:
    if not isinstance(node, dict):
        return None
    inputs = node.get('inputs', {})
    for _k, v in inputs.items():
        cand = None
        if isinstance(v, str):
            cand = candidate_from_val(v, True)
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, str):
                    cand = candidate_from_val(item, True)
                    if cand:
                        break
        if cand:
            return cand
    return None

def get_short_name(value: str) -> str:
    """
    Returns a shortened version of a model name.
    1. Checks explicit mapping in MODEL_SHORT_NAMES.
    2. Falls back to auto-shortening if not found.
    3. Cleans up resulting name (standardize separators, handle GGUF suffix).
    """
    if not value:
        return ""
    
    # Normalize path and get parts
    base = os.path.basename(value.replace("\\", "/"))
    name_wo_ext, ext = os.path.splitext(base)
    
    # Check explicit map
    mapped = MODEL_SHORT_NAMES.get(name_wo_ext) or MODEL_SHORT_NAMES.get(base)
    if mapped:
        short = mapped
    else:
        # Fallback to auto-shortening
        short = auto_shorten_model_name(name_wo_ext)
        
    # Standard cleanup (from AUNSaveImage)
    if short:
        short = short.replace('.', '')
        
    # Append -GGUF if original was GGUF and result doesn't mention it
    if ext.lower() == '.gguf' and short and 'GGUF' not in short.upper():
        short = f"{short}-GGUF"
        
    return sanitize_for_filename(short)

def get_lora_short_name(lora_name: str) -> str:
    """Resolve a short LoRA name using explicit map or auto-shortening."""
    if not lora_name:
        return ""
    base = os.path.basename(lora_name.replace("\\", "/"))
    name_wo_ext, ext = os.path.splitext(base)
    
    mapped = LORA_SHORT_NAMES.get(name_wo_ext) or LORA_SHORT_NAMES.get(base)
    if mapped:
        result = mapped
    else:
        result = auto_shorten_lora_name(name_wo_ext)
        
    return sanitize_for_filename(result)

def auto_shorten_lora_name(lora_basename: str) -> str:
    """Fallback shortener for LoRA names. Keeps them readable but shorter.
    Strategy: drop common filler tokens, cap token length, remove vowels for long tokens.
    """
    if not lora_basename:
        return ""
    
    s = lora_basename.replace('_', ' ').replace('-', ' ').strip()
    if not s:
        return lora_basename
        
    filler = {
        'lora', 'loras', 'style', 'styles', 'pack', 'model', 'sd', 'sdxl', 'v', 'rev',
        'fp16', 'fp32', 'bf16', 'ema', 'final', 'pruned', 'clip', 'vae', 'safetensors',
    }
    
    tokens = [t for t in s.split() if t.lower() not in filler]
    if not tokens:
        tokens = s.split()[:2]

    def trim_token(tok: str) -> str:
        if len(tok) <= 5 or any(c.isdigit() for c in tok):
            return tok
        vowels = set('aeiouAEIOU')
        compact = ''.join(ch for ch in tok if ch not in vowels)
        return compact[:6] if len(compact) >= 3 else tok[:4]

    short = ''.join(trim_token(t).capitalize() for t in tokens[:3])
    return short[:24]

def get_sampler_short_name(sampler_name: str) -> str:
    """Returns a shortened version of a sampler name."""
    return SAMPLER_SHORT_NAMES.get(sampler_name, sampler_name)

def get_scheduler_short_name(scheduler_name: str) -> str:
    """Returns a shortened version of a scheduler name."""
    return SCHEDULER_SHORT_NAMES.get(scheduler_name, scheduler_name)
