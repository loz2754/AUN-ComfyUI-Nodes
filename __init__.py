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
from .AUNGetActiveNodeTitle import AUNGetActiveNodeTitle
from .AUNGetConnectedNodeTitles import AUNGetConnectedNodeTitles
from .AUNGraphScraper import AUNGraphScraper
from .AUNImageLoadResize import AUNImageLoadResize
from .AUNImageResize import AUNImageResize
from .AUNImageSingleBatch3 import AUNImageSingleBatch3
from .AUNImg2Img import AUNImg2Img
from .AUNImgLoader import AUNImgLoader
from .AUNInputs import AUNInputs
from .AUNInputsHybrid import AUNInputsHybrid
from .AUNKSamplerPlusv3 import AUNKSamplerPlusv3
from .AUNMultiBypassIndex import AUNMultiBypassIndex
from .AUNMultiGroupUniversal import AUNMultiGroupUniversal
from .AUNMultiMuteIndex import AUNMultiMuteIndex
from .AUNMultiNegPrompt import AUNMultiNegPrompt
from .AUNMultiUniversal import AUNMultiUniversal
from .AUNNameCrop import AUNNameCrop
from .AUNNodeStateController import AUNNodeStateController
from .AUNPathFilename import AUNPathFilename
from .AUNPathFilenameVideo import AUNPathFilenameVideo
from .AUNPathFilenameVideoResolved import AUNPathFilenameVideoResolved
from .AUNRandomAnySwitch import AUNRandomAnySwitch
from .AUNRandomIndexSwitch import AUNRandomIndexSwitch
from .AUNRandomNumber import AUNRandomNumber
from .AUNRandomTextIndexSwitch import AUNRandomTextIndexSwitch
from .AUNSaveImage import AUNSaveImage
from .AUNSaveVideo import AUNSaveVideo
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
    "AUNGetActiveNodeTitle": AUNGetActiveNodeTitle,
    "AUNGetConnectedNodeTitles": AUNGetConnectedNodeTitles,
    "AUNGraphScraper": AUNGraphScraper,
    "AUNImageLoadResize": AUNImageLoadResize,
    "AUNImageResize": AUNImageResize,
    "AUNImageSingleBatch3": AUNImageSingleBatch3,
    "AUNImg2Img": AUNImg2Img,
    "AUNImgLoader": AUNImgLoader,
    "AUNInputs": AUNInputs,
    "AUNInputsHybrid": AUNInputsHybrid,
    "AUNKSamplerPlusv3": AUNKSamplerPlusv3,
    "AUNMultiBypassIndex": AUNMultiBypassIndex,
    "AUNMultiGroupUniversal": AUNMultiGroupUniversal,
    "AUNMultiMuteIndex": AUNMultiMuteIndex,
    "AUNMultiNegPrompt": AUNMultiNegPrompt,
    "AUNMultiUniversal": AUNMultiUniversal,
    "AUNNameCrop": AUNNameCrop,
    "AUNNodeStateController": AUNNodeStateController,
    "AUNPathFilename": AUNPathFilename,
    "AUNPathFilenameVideo": AUNPathFilenameVideo,
    "AUNPathFilenameVideoResolved": AUNPathFilenameVideoResolved,
    "AUNRandomAnySwitch": AUNRandomAnySwitch,
    "AUNRandomIndexSwitch": AUNRandomIndexSwitch,
    "AUNRandomNumber": AUNRandomNumber,
    "AUNRandomTextIndexSwitch": AUNRandomTextIndexSwitch,
    "AUNSaveImage": AUNSaveImage,
    "AUNSaveVideo": AUNSaveVideo,
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
    "AUNGetActiveNodeTitle": "Get Active Node Title",
    "AUNGetConnectedNodeTitles": "Get Connected Node Titles",
    "AUNImageLoadResize": "Load & Resize Image",
    "AUNImageResize": "Resize Image",
    "AUNImageSingleBatch3": "Load Image Single/Batch 3",
    "AUNImg2Img": "Img2Img",
    "AUNImgLoader": "Image Loader",
    "AUNInputs": "Inputs",
    "AUNInputsHybrid": "Inputs Hybrid",
    "AUNKSamplerPlusv3": "KSampler Plus",
    "AUNMultiBypassIndex": "Multi Bypass Index",
    "AUNMultiGroupUniversal": "AUN Group Controller",
    "AUNMultiMuteIndex": "Multi Mute Index",
    "AUNMultiNegPrompt": "Negative Prompt Selector",
    "AUNMultiUniversal": "AUN Node Controller",
    "AUNNameCrop": "Name Crop",
    "AUNNodeStateController": "Node State Controller",
    "AUNPathFilename": "Path Filename",
    "AUNPathFilenameVideo": "Path Filename Video",
    "AUNPathFilenameVideoResolved": "Path Filename Video (Resolved)",
    "AUNRandomAnySwitch": "Random Any Switch",
    "AUNRandomIndexSwitch": "Random/Select INT",
    "AUNRandomNumber": "Random Number",
    "AUNRandomTextIndexSwitch": "Random Text Index Switch",
    "AUNSaveImage": "Save Image",
    "AUNSaveVideo": "Save Video",
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
    "KSamplerInputs": "KSampler Inputs",
    "MainFolderManualName": "Main Folder Manual Name",
    "TextSwitch2InputWithTextOutput": "Text Switch 2 Input With Text Output",
}
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
