// AUN Load Image Pro: expose the "set" widget as an OBVPM bundle constant,
// the way the other AUN loader nodes do.
import { app } from "../../scripts/app.js";

const NODE_TYPE = "AUNImageLoaderPro";
const FIELD_NAMES = [
  "image",
  "mask",
  "filename",
  "cleaned_filename",
  "width",
  "height",
  "original_width",
  "original_height",
];

app.registerExtension({
  name: "AUN.ImageLoaderPro.OBVPMConstant",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== NODE_TYPE) return;
    nodeType.prototype.aunConstantWidget = "set";
    nodeType.prototype.aunBundleNames = function () {
      return FIELD_NAMES.slice();
    };
    // Older OBVPM builds read these hook names.
    nodeType.prototype.obvpmConstantWidget = "set";
    nodeType.prototype.obvpmBundleNames = nodeType.prototype.aunBundleNames;
    if (!Object.prototype.hasOwnProperty.call(nodeType.prototype, "aunConstantOutput")) {
      Object.defineProperty(nodeType.prototype, "aunConstantOutput", {
        configurable: true,
        get() {
          const outputs = this.outputs || [];
          const index = outputs.findIndex((out) => String(out?.type ?? "") === "OBVPM_BUNDLE");
          return index >= 0 ? index : (outputs.length ? outputs.length - 1 : 0);
        },
      });
    }
  },
});
