/**
 * AUN Vue frontend layer (Nodes 2.0).
 *
 * This directory hosts the Vue-frontend replacements for the legacy
 * web/*.js extensions. Files here are loaded by every frontend, but only
 * activate when the new (Vue) extension API is present — see
 * isNewFrontend() in ../aun-compat.js and registerVueExtension() in
 * ./aun-vue.js.
 *
 * Once a replacement ships here, flip the corresponding legacy file to
 * registerLegacyExtension(def, true) so the new frontend runs only this
 * path.
 */

import { isNewFrontend } from "../aun-compat.js";

export { isNewFrontend };

export {
  registerVueExtension,
  vueGetWidget,
  vueGetWidgetByNames,
  vueSetWidgetValue,
  vueIsCompact,
  vueSetCompact,
} from "./aun-vue.js";
