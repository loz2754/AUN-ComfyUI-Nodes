# Alphabetically organized imports
import logging
from .AUNAddToPrompt import AUNAddToPrompt
from .AUNAny import AUNAny
from .AUNBookmark import AUNBookmark
from .AUNBoolean import AUNBoolean
from .AUNCFG import AUNCFG
from .AUNCkptClipSkip import AUNCheckpointLoaderWithClipSkip
from .AUNEmptyLatent import AUNEmptyLatent
from .AUNExtractModelName import AUNExtractModelName
from .AUNExtractPowerLoras import AUNExtractPowerLoras
from .AUNExtractWidgetValue import AUNExtractWidgetValue
from .AUNModelNamePass import AUNModelNamePass
from .AUNModelShorten import AUNModelShorten
from .AUNLoraLoaderModelOnlyFromString import AUNLoraLoaderModelOnlyFromString
from .AUNGetActiveNodeTitle import AUNGetActiveNodeTitle
from .AUNGetConnectedNodeTitles import AUNGetConnectedNodeTitles
from .AUNGraphScraper import AUNGraphScraper
from .AUNImageLoadResize import AUNImageLoadResize
from .AUNImageResize import AUNImageResize
from .AUNImageSingleBatch3 import AUNImageSingleBatch3
from .AUNImg2Img import AUNImg2Img
from .AUNImgLoader import AUNImgLoader
from .AUNInputs import AUNInputs
from .AUNInputsBasic import AUNInputsBasic
from .AUNInputsDiffusers import AUNInputsDiffusers
from .AUNInputsDiffusersBasic import AUNInputsDiffusersBasic
from .AUNInputsDiffusersRefineBasic import AUNInputsDiffusersRefineBasic
from .AUNInputsHybrid import AUNInputsHybrid
from .AUNInputsRefine import AUNInputsRefine
from .AUNInputsRefineBasic import AUNInputsRefineBasic
from .AUNKSamplerPlusV2 import AUNKSamplerPlusV2
from .AUNKSamplerPlusv3 import AUNKSamplerPlusv3
from. AUNKSamplerPlusv4 import AUNKSamplerPlusv4
from .AUNManualAutoImageSwitch import AUNManualAutoImageSwitch
from .AUNManualAutoTextSwitch import AUNManualAutoTextSwitch
from .AUNMultiBypassIndex import AUNMultiBypassIndex
from .AUNMultiGroupUniversal import AUNMultiGroupUniversal
from .AUNMultiMuteIndex import AUNMultiMuteIndex
from .AUNMultiNegPrompt import AUNMultiNegPrompt
from .AUNMultiUniversal import AUNMultiUniversal
from .AUNNameCrop import AUNNameCrop
from .AUNNodeStateController import AUNNodeStateController
from .AUNPathFilename import AUNPathFilename
from .AUNPathFilenameV2 import AUNPathFilenameV2
from .AUNPathFilenameVideo import AUNPathFilenameVideo
from .AUNPathFilenameVideoV2 import AUNPathFilenameVideoV2
from .AUNPathFilenameVideoResolved import AUNPathFilenameVideoResolved
from .AUNFilenameResolverPreviewV2 import AUNFilenameResolverPreviewV2
from .AUNRandomAnySwitch import AUNRandomAnySwitch
from .AUNRandomIndexSwitch import AUNRandomIndexSwitch
from .AUNRandomLoraModelOnly import AUNRandomLoraModelOnly
from .AUNRandomModelBundleSwitch import AUNRandomModelBundleSwitch
from .AUNRandomNumber import AUNRandomNumber
from .AUNRandomTextIndexSwitch import AUNRandomTextIndexSwitch
from .AUNRandomTextIndexSwitchV2 import AUNRandomTextIndexSwitchV2
from .AUNSaveImage import AUNSaveImage
from .AUNSaveImageV2 import AUNSaveImageV2
from .AUNSaveVideo import AUNSaveVideo
from .AUNSaveVideoV2 import AUNSaveVideoV2
from .AUNSetBypassByTitle import AUNSetBypassByTitle
from .AUNSetBypassStateGroup import AUNSetBypassStateGroup
from .AUNSetCollapseAndBypassStateAdvanced import AUNSetCollapseAndBypassStateAdvanced
from .AUNSetMuteByTitle import AUNSetMuteByTitle
from .AUNSetMuteStateGroup import AUNSetMuteStateGroup
from .AUNShowTextWithTitle import AUNShowTextWithTitle
from .AUNSingleLabelSwitch import AUNSingleLabelSwitch
from .AUNStrip import AUNStrip
from .AUNSwitchFloat import AUNSwitchFloat
from .AUNTextIndexSwitch import AUNTextIndexSwitch
from .AUNTextIndexSwitch3 import AUNTextIndexSwitch3
from .AUNTitleImagePreview import AUNTitleImagePreview
from .AUNWildcardAddToPrompt import AUNWildcardAddToPrompt
from .KSamplerInputs import KSamplerInputs
from .MainFolderManualName import MainFolderManualName
from .TextSwitch2InputWithTextOutput import TextSwitch2InputWithTextOutput


WEB_DIRECTORY = "./web"

NODE_CLASS_MAPPINGS = {
    "AUNAddToPrompt": AUNAddToPrompt,
    "AUNAny": AUNAny,
    "AUNBookmark": AUNBookmark,
    "AUNBoolean": AUNBoolean,
    "AUNCFG": AUNCFG,
    "AUNCheckpointLoaderWithClipSkip": AUNCheckpointLoaderWithClipSkip,
    "AUNEmptyLatent": AUNEmptyLatent,
    "AUNExtractModelName": AUNExtractModelName,
    "AUNExtractPowerLoras": AUNExtractPowerLoras,
    "AUNExtractWidgetValue": AUNExtractWidgetValue,
    "AUNModelNamePass": AUNModelNamePass,
    "AUNModelShorten": AUNModelShorten,
    "AUNLoraLoaderModelOnlyFromString": AUNLoraLoaderModelOnlyFromString,
    "AUNGetActiveNodeTitle": AUNGetActiveNodeTitle,
    "AUNGetConnectedNodeTitles": AUNGetConnectedNodeTitles,
    "AUNGraphScraper": AUNGraphScraper,
    "AUNImageLoadResize": AUNImageLoadResize,
    "AUNImageResize": AUNImageResize,
    "AUNImageSingleBatch3": AUNImageSingleBatch3,
    "AUNImg2Img": AUNImg2Img,
    "AUNImgLoader": AUNImgLoader,
    "AUNInputs": AUNInputs,
    "AUNInputsBasic": AUNInputsBasic,
    "AUNInputsDiffusers": AUNInputsDiffusers,
    "AUNInputsDiffusersBasic": AUNInputsDiffusersBasic,
    "AUNInputsDiffusersRefineBasic": AUNInputsDiffusersRefineBasic,
    "AUNInputsHybrid": AUNInputsHybrid,
    "AUNInputsRefine": AUNInputsRefine,
    "AUNInputsRefineBasic": AUNInputsRefineBasic,
    "AUNKSamplerPlusV2": AUNKSamplerPlusV2,
    "AUNKSamplerPlusv3": AUNKSamplerPlusv3,
    "AUNKSamplerPlusv4": AUNKSamplerPlusv4,
    "AUNManualAutoImageSwitch": AUNManualAutoImageSwitch,
    "AUNManualAutoTextSwitch": AUNManualAutoTextSwitch,
    "AUNMultiBypassIndex": AUNMultiBypassIndex,
    "AUNMultiGroupUniversal": AUNMultiGroupUniversal,
    "AUNMultiMuteIndex": AUNMultiMuteIndex,
    "AUNMultiNegPrompt": AUNMultiNegPrompt,
    "AUNMultiUniversal": AUNMultiUniversal,
    "AUNNameCrop": AUNNameCrop,
    "AUNNodeStateController": AUNNodeStateController,
    "AUNPathFilename": AUNPathFilename,
    "AUNPathFilenameV2": AUNPathFilenameV2,
    "AUNPathFilenameVideo": AUNPathFilenameVideo,
    "AUNPathFilenameVideoV2": AUNPathFilenameVideoV2,
    "AUNPathFilenameVideoResolved": AUNPathFilenameVideoResolved,
    "AUNFilenameResolverPreviewV2": AUNFilenameResolverPreviewV2,
    "AUNRandomAnySwitch": AUNRandomAnySwitch,
    "AUNRandomIndexSwitch": AUNRandomIndexSwitch,
    "AUNRandomLoraModelOnly": AUNRandomLoraModelOnly,
    "AUNRandomModelBundleSwitch": AUNRandomModelBundleSwitch,
    "AUNRandomNumber": AUNRandomNumber,
    "AUNRandomTextIndexSwitch": AUNRandomTextIndexSwitch,
    "AUNRandomTextIndexSwitchV2": AUNRandomTextIndexSwitchV2,
    "AUNSaveImage": AUNSaveImage,
    "AUNSaveImageV2": AUNSaveImageV2,
    "AUNSaveVideo": AUNSaveVideo,
    "AUNSaveVideoV2": AUNSaveVideoV2,
    "AUNSetBypassByTitle": AUNSetBypassByTitle,
    "AUNSetBypassStateGroup": AUNSetBypassStateGroup,
    "AUNSetCollapseAndBypassStateAdvanced": AUNSetCollapseAndBypassStateAdvanced,
    "AUNSetMuteByTitle": AUNSetMuteByTitle,
    "AUNSetMuteStateGroup": AUNSetMuteStateGroup,
    "AUNShowTextWithTitle": AUNShowTextWithTitle,
    "AUNSingleLabelSwitch": AUNSingleLabelSwitch,
    "AUNStrip": AUNStrip,
    "AUNSwitchFloat": AUNSwitchFloat,
    "AUNTextIndexSwitch": AUNTextIndexSwitch,
    "AUNTextIndexSwitch3": AUNTextIndexSwitch3,
    "AUNTitleImagePreview": AUNTitleImagePreview,
    "AUNWildcardAddToPrompt": AUNWildcardAddToPrompt,
    "KSamplerInputs": KSamplerInputs,
    "MainFolderManualName": MainFolderManualName,
    "TextSwitch2InputWithTextOutput": TextSwitch2InputWithTextOutput,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AUNAddToPrompt": "Add-To-Prompt",
    "AUNAny": "Any",
    "AUNBookmark": "AUN Bookmark",
    "AUNBoolean": "Boolean",
    "AUNCFG": "CFG Selector",
    "AUNCheckpointLoaderWithClipSkip": "Ckpt Load With Clip Skip",
    "AUNEmptyLatent": "Empty Latent",
    "AUNExtractModelName": "Extract Model Name",
    "AUNExtractPowerLoras": "Extract Power LoRAs",
    "AUNExtractWidgetValue": "Extract Widget Value",
    "AUNModelNamePass": "Model Name Pass",
    "AUNModelShorten": "Model Name Shorten",
    "AUNLoraLoaderModelOnlyFromString": "LoRA Loader Model Only (String)",
    "AUNGetActiveNodeTitle": "Get Active Node Title",
    "AUNGetConnectedNodeTitles": "Get Connected Node Titles",
    "AUNImageLoadResize": "Load & Resize Image",
    "AUNImageResize": "Resize Image",
    "AUNImageSingleBatch3": "Load Image Single/Batch",
    "AUNImg2Img": "Img2Img",
    "AUNImgLoader": "Image Loader",
    "AUNInputs": "Inputs",
    "AUNInputsBasic": "Inputs Basic",
    "AUNInputsDiffusers": "Inputs Diffusers",
    "AUNInputsDiffusersBasic": "Inputs Diffusers Basic",
    "AUNInputsDiffusersRefineBasic": "Inputs Diffusers Refine Basic",
    "AUNInputsHybrid": "Inputs Hybrid",
    "AUNInputsRefine": "Inputs Refine",
    "AUNInputsRefineBasic": "Inputs Refine Basic",
    "AUNKSamplerPlusV2": "AUN KSampler PlusV2",
    "AUNKSamplerPlusv4": "KSampler Plus V4",
    "AUNManualAutoImageSwitch": "Manual/Auto Image Switch",
    "AUNManualAutoTextSwitch": "Manual/Auto Text Switch",
    "AUNMultiBypassIndex": "Multi Bypass Index",
    "AUNMultiGroupUniversal": "AUN Group Controller",
    "AUNMultiMuteIndex": "Multi Mute Index",
    "AUNMultiNegPrompt": "Negative Prompt Selector",
    "AUNMultiUniversal": "AUN Node Controller",
    "AUNNameCrop": "Name Crop",
    "AUNNodeStateController": "Node State Controller",
    "AUNPathFilename": "Path Filename (Legacy)",
    "AUNPathFilenameV2": "Path Filename V2",
    "AUNPathFilenameVideo": "Path Filename Video (Legacy)",
    "AUNPathFilenameVideoV2": "Path Filename Video V2",
    "AUNPathFilenameVideoResolved": "Path Filename Video (Resolved)",
    "AUNFilenameResolverPreviewV2": "Filename Resolver V2",
    "AUNRandomAnySwitch": "Random Any Switch",
    "AUNRandomIndexSwitch": "Random/Select INT",
    "AUNRandomLoraModelOnly": "Random LoRA Model Loader (Compact)",
    "AUNRandomModelBundleSwitch": "Model and Text Selector",
    "AUNRandomNumber": "Random Number",
    "AUNRandomTextIndexSwitch": "Random Text Index Switch",
    "AUNRandomTextIndexSwitchV2": "Random Text Index Switch V2",
    "AUNSaveImage": "Save Image (Legacy)",
    "AUNSaveImageV2": "AUN Save Image V2 (Recommended)",
    "AUNSaveVideo": "Save Video (Legacy)",
    "AUNSaveVideoV2": "AUN Save Video V2 (Recommended)",
    "AUNSetBypassStateGroup": "Group Bypasser (Multi)",
    "AUNSetBypassByTitle": "Bypass By Title",
    "AUNSetCollapseAndBypassStateAdvanced": "Node Collapser & Bypasser Advanced",
    "AUNSetMuteByTitle": "Mute By Title",
    "AUNSetMuteStateGroup": "Group Muter (Multi)",
    "AUNShowTextWithTitle": "Show Text With Title",
    "AUNSingleLabelSwitch": "Single Label Switch",
    "AUNStrip": "Strip",
    "AUNSwitchFloat": "Switch Float",
    "AUNTextIndexSwitch": "Text Index Switch",
    "AUNTextIndexSwitch3": "Text Index Switch 3",
    "AUNTitleImagePreview": "Image Preview With Title",
    "AUNWildcardAddToPrompt": "AUN Wildcard Add-To-Prompt",
    "KSamplerInputs": "KSampler Inputs",
    "MainFolderManualName": "Manual Name",
    "TextSwitch2InputWithTextOutput": "Text Switch 2 Input With Text Output",
}
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
