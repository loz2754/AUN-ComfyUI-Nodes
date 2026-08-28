/**
 * Settings shim for AUN nodes.
 *
 * Abstracts ComfyUI settings registration across frontends:
 * - Legacy: app.ui.settings.addSetting / getSettingValue / setSettingValue
 * - Vue:    app.extensionManager.setting.add / get / set
 *
 * Setting IDs are kept identical across frontends so user preferences
 * survive the frontend migration.
 */

import { app } from "../../scripts/app.js";
import { isNewFrontend } from "./aun-compat.js";

/**
 * Register a setting. Mirrors the legacy addSetting signature.
 * @param {object} cfg - { id, name, tooltip, type, defaultValue, onChange, ... }
 * @returns {object|null} The created setting object, or null on failure.
 */
export function aunAddSetting(cfg) {
  // The legacy settings shim exists on both frontends; prefer it so
  // addSetting() keeps working everywhere. The new-frontend manager has no
  // add() (settings are declared via the extension `settings` array).
  if (typeof app.ui?.settings?.addSetting === "function") {
    try {
      return app.ui.settings.addSetting(cfg);
    } catch (_) {}
  }
  const manager = app.extensionManager?.setting;
  if (typeof manager?.add === "function") {
    const safe = { ...cfg };
    // The new settings API has no custom-element factory types.
    if (typeof safe.type === "function") {
      safe.type = "text";
    }
    try {
      return manager.add(safe);
    } catch (_) {}
  }
  return null;
}

/**
 * Read a setting value.
 * @param {string} id - Setting id.
 * @param {*} [fallback] - Value returned when the setting does not exist.
 * @returns {*}
 */
export function aunGetSettingValue(id, fallback) {
  if (isNewFrontend()) {
    const manager = app.extensionManager?.setting;
    if (typeof manager?.get === "function") {
      const value = manager.get(id);
      if (value !== undefined) return value;
    }
    return fallback;
  }
  if (typeof app.ui?.settings?.getSettingValue === "function") {
    try {
      return app.ui.settings.getSettingValue(id, fallback);
    } catch (_) {}
  }
  return fallback;
}

/**
 * Write a setting value.
 * @param {string} id - Setting id.
 * @param {*} value - New value.
 */
export function aunSetSettingValue(id, value) {
  if (isNewFrontend()) {
    const manager = app.extensionManager?.setting;
    if (typeof manager?.set === "function") {
      try {
        manager.set(id, value);
      } catch (_) {}
    }
    return;
  }
  if (typeof app.ui?.settings?.setSettingValue === "function") {
    try {
      app.ui.settings.setSettingValue(id, value);
    } catch (_) {}
  }
}
