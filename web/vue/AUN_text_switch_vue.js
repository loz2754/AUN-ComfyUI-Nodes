/**
 * Vue frontend implementation of Text Switch 2 behavior.
 *
 * Replaces web/AUN_text_switch.js on the new (Vue) frontend. Ports the
 * same features — combo conversion for 'choose', dynamic labels, compact
 * mode.
 *
 * On this frontend, node.widgets is a store-driven "presented" view:
 * widget.hidden is not visually applied reliably, while removeWidget is.
 * Compact mode therefore removes widgets with node.removeWidget() while
 * their values stay safe:
 *   - values are stashed in node.properties (serializes with the workflow)
 *   - the widget objects are kept in node.__AUN_allWidgets, which
 *     AUN_fix_prompt_missing_inputs.js reads to re-inject values into the
 *     prompt (see that file's graphToPrompt patch)
 * The 'choose' widget is never removed (stays def-faithful, always in the
 * prompt). Expanding re-adds the removed widgets and sorts node.widgets
 * back into definition order.
 */

import { app } from "../../../scripts/app.js";
import {
  registerVueExtension,
  vueGetWidget,
  vueRegisterNodeDblClick,
  vueTriggerWorkflowCapture,
} from "./aun-vue.js";
import {
  captureAunWidgetValues,
  restoreAunWidgetValues,
} from "../aun_persistence_shared.js";

const NODE_TYPE = "TextSwitch2InputWithTextOutput";
const COMPACT_PROP = "_AUN_compactMode";
const COMPACT_VALUES_PROP = "_AUN_ts2_compactValues";
const COMPACT_SIZE_PROP = "_AUN_ts2_compactSize";
const COMPACT_HEIGHT = 80;
const WIDGET_ORDER = ["text_a", "text_b", "label_a", "label_b", "choose"];
// text_a/text_b are forceInput-capable and connected to links in normal
// use — removing them can detach links and empty values. Compact mode only
// removes the label widgets; the text widgets are never touched.
const KEEP_ALWAYS = new Set(["choose", "text_a", "text_b"]);

// Enable via console: window.__AUN_TS2_DEBUG = true
function ts2Debug(label, obj) {
  try {
    if (globalThis.__AUN_TS2_DEBUG) {
      console.info("[AUN] TS2 " + label + " " + JSON.stringify(obj));
    }
  } catch (_) {}
}

function isConverted(node, widget) {
  if (!node?.inputs) return false;
  if (widget?.type === "converted-widget") return true;
  return node.inputs.some((i) => i.widget === widget);
}

function hasLinkedInput(node, widgetName) {
  return !!node?.inputs?.some((i) => i.name === widgetName && i.link != null);
}

function sortWidgets(node) {
  const wl = node.widgets;
  if (!Array.isArray(wl)) return;
  try {
    wl.sort((a, b) => {
      const ia = WIDGET_ORDER.indexOf(a?.name);
      const ib = WIDGET_ORDER.indexOf(b?.name);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  } catch (_) {}
}

function ts2DblClickHandler(node) {
  if (node.comfyClass !== NODE_TYPE) return;
  node.properties = node.properties || {};
  node.properties[COMPACT_PROP] = !node.properties[COMPACT_PROP];
  node.__AUN_refreshCompact?.();
}

registerVueExtension({
  name: "AUN.TextSwitch2.Vue",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;

    // Force the 'choose' input to be treated as a combo in the UI
    // even though the backend sees it as a STRING for validation purposes.
    if (nodeData.input?.required?.choose) {
      nodeData.input.required.choose = [
        ["Text A", "Text B", "None"],
        { default: "None" },
      ];
    }

    // Canvas-drawn Nodes 2.0 frontends (e.g. 1.49.6) dispatch dblclicks
    // through node.onDblClick instead of the DOM dispatcher — patch the
    // prototype like the compat extension does. Harmless on DOM-rendered
    // frontends (the canvas never calls it there).
    if (!nodeType.prototype._AUN_ts2_vueDblClickPatched) {
      nodeType.prototype._AUN_ts2_vueDblClickPatched = true;
      const orig = nodeType.prototype.onDblClick;
      nodeType.prototype.onDblClick = function (e, pos, canvas) {
        if (pos && pos[1] >= 0) {
          this.properties = this.properties || {};
          this.properties[COMPACT_PROP] = !this.properties[COMPACT_PROP];
          this.__AUN_refreshCompact?.();
          return true;
        }
        return typeof orig === "function"
          ? orig.apply(this, arguments)
          : false;
      };
    }
  },

  getNodeMenuItems(node) {
    if (node?.comfyClass !== NODE_TYPE) return [];

    const compact = !!node.properties?.[COMPACT_PROP];
    return [
      {
        content: compact ? "AUN: Show all controls" : "AUN: Compact mode",
        callback: () => {
          node.properties = node.properties || {};
          node.properties[COMPACT_PROP] = !compact;
          node.__AUN_refreshCompact?.();
        },
      },
    ];
  },

  async setup() {
    // Double-click below the title toggles compact mode (title dblclick is
    // the frontend's rename gesture and is excluded by the dispatcher).
    vueRegisterNodeDblClick(ts2DblClickHandler);
  },

  nodeCreated(node) {
    if (node.comfyClass !== NODE_TYPE) return;

    // Belt-and-braces: ensure the handler is registered even if the setup
    // hook was gated off before the mode was known (deduped by reference).
    vueRegisterNodeDblClick(ts2DblClickHandler);

    node.properties = node.properties || {};
    if (node.properties[COMPACT_PROP] === undefined) {
      node.properties[COMPACT_PROP] = false;
    }
    if (node.properties[COMPACT_VALUES_PROP] === undefined) {
      node.properties[COMPACT_VALUES_PROP] = {};
    }

    // All-widget snapshot used by AUN_fix_prompt_missing_inputs.js to
    // re-inject values of removed widgets into the prompt.
    if (!Array.isArray(node.__AUN_allWidgets)) {
      node.__AUN_allWidgets = [];
    }
    for (const w of node.widgets || []) {
      if (!node.__AUN_allWidgets.includes(w)) node.__AUN_allWidgets.push(w);
    }
    node._AUN_ts2_removed = new Map();

    // Always capture the full widget set (including removed ones) into
    // properties._aun_values at save time. On reload, the saved
    // widgets_values only covers the presented widgets (compact-mode saves
    // miss the removed ones), so restoreAunWidgetValues() re-applies the
    // real values by name afterwards.
    if (
      typeof node.serialize === "function" &&
      !node.__AUN_ts2_serializeSetup
    ) {
      node.__AUN_ts2_serializeSetup = true;
      const origSerialize = node.serialize;
      node.serialize = function (...args) {
        try {
          captureAunWidgetValues(this);
        } catch (_) {}
        let result;
        try {
          result = origSerialize.apply(this, args);
        } catch (_) {
          result = null;
        }
        // Emit the full widget set in definition order so a compact-mode
        // save still restores every value positionally on load.
        if (result && typeof result === "object") {
          try {
            const wv = [];
            for (const name of WIDGET_ORDER) {
              const w = this.__AUN_allWidgets?.find((x) => x.name === name);
              if (!w) continue;
              try {
                wv.push(
                  typeof w.serializeValue === "function"
                    ? w.serializeValue(this, wv.length)
                    : w.value,
                );
              } catch (_) {
                wv.push(w.value);
              }
            }
            result.widgets_values = wv;
          } catch (_) {}
        }
        return result;
      };
    }

    // Redraw shotgun — pattern proven by AUN_node_state_controller_instant.js.
    const forceFullRedraw = () => {
      try {
        const newSize = node.computeSize?.();
        if (Array.isArray(newSize)) {
          node.setSize([node.size?.[0] ?? newSize[0] ?? 210, newSize[1]]);
        }
      } catch (_) {}
      node.setDirtyCanvas?.(true, true);
      if (node.flags) node.flags.collapsed = node.flags.collapsed;
      node.graph?.setDirtyCanvas?.(true, true);
      if (app?.canvas?.is_rendering) app.canvas.is_rendering = false;
      app.canvas?.draw?.(true, true);
      try {
        node.graph?.change?.();
      } catch (_) {}
      try {
        node.onPropertyChanged?.("_force_refresh", Date.now());
      } catch (_) {}
      // Vue frontend: force the node component to re-render by re-pushing
      // its snapshot into the reactive node-data map.
      try {
        // vueNodesMode-only re-render trick: on canvas-drawn frontends
        // (1.49.6's Nodes 2.0) onNodeAdded duplicates the node's rendering.
        if (document?.querySelector?.("[data-node-id]")) {
          const g = node.graph ?? app?.graph;
          if (typeof g?.onNodeAdded === "function") g.onNodeAdded(node);
        }
      } catch (_) {}
      if (node.graph?.canvas) {
        node.graph.canvas.dirty_canvas = true;
        node.graph.canvas.dirty_bgcanvas = true;
      }
      for (const delay of [1, 10, 50]) {
        setTimeout(() => {
          try {
            node.setDirtyCanvas?.(true, true);
            node.graph?.setDirtyCanvas?.(true, true);
          } catch (_) {}
        }, delay);
      }
    };

    const updateLabels = () => {
      const choose = vueGetWidget(node, "choose");
      if (!choose) return;
      const saved = node.properties[COMPACT_VALUES_PROP] || {};
      const labelA = vueGetWidget(node, "label_a");
      const labelB = vueGetWidget(node, "label_b");
      // Fall back to stashed values when the label widgets are removed
      // (compact mode after a workflow reload).
      const valA = ((labelA?.value ?? saved.label_a) || "Text A").trim();
      const valB = ((labelB?.value ?? saved.label_b) || "Text B").trim();
      const oldVal = choose.value;
      const oldOptions = choose.options?.values || [];

      const newOptions = [valA, valB, "None"];
      choose.options = choose.options || {};
      choose.options.values = newOptions;

      // Keep the selection pointing at the same logical option when a
      // label value was edited.
      if (oldOptions.length >= 2) {
        if (oldVal === oldOptions[0]) choose.value = valA;
        else if (oldVal === oldOptions[1]) choose.value = valB;
      }
      if (!newOptions.includes(choose.value) && !choose.value) {
        choose.value = "None";
      }

      forceFullRedraw();
    };

    const wireLabelCallbacks = () => {
      for (const name of ["label_a", "label_b"]) {
        const w = vueGetWidget(node, name);
        if (!w || w.__AUN_ts2_wired) continue;
        w.__AUN_ts2_wired = true;
        const orig = w.callback;
        w.callback = function (v) {
          if (typeof orig === "function") {
            try {
              orig.apply(this, arguments);
            } catch (_) {}
          }
          updateLabels();
        };
      }
    };

    const refreshCompact = () => {
      const compact = !!node.properties[COMPACT_PROP];
      const width = node.size?.[0] ?? 210;

      if (compact) {
        // Remember the expanded size so it can be restored.
        if (!node.properties[COMPACT_SIZE_PROP]) {
          node.properties[COMPACT_SIZE_PROP] = [
            width,
            node.size?.[1] ?? COMPACT_HEIGHT * 2,
          ];
        }
        const stash = node.properties[COMPACT_VALUES_PROP] || {};
        // 'choose' is never removed, but it must be protected too: a
        // compact-mode save writes widgets_values positionally, so after
        // a reload the value would land on the wrong widget.
        const chooseW = vueGetWidget(node, "choose");
        if (chooseW) {
          if (stash.choose !== undefined && chooseW.value !== stash.choose) {
            chooseW.value = stash.choose;
          }
          stash.choose = chooseW.value;
        }
        for (const w of [...(node.widgets || [])]) {
          if (KEEP_ALWAYS.has(w.name) || isConverted(node, w)) continue;
          // Never remove a widget whose input is linked — removeWidget
          // detaches the link and empties the value at queue time.
          if (hasLinkedInput(node, w.name)) continue;
          // On a workflow load the stash is authoritative (the removed
          // widgets were re-created with defaults) — restore before removal
          // so __AUN_allWidgets keeps the saved values for prompt injection.
          if (stash[w.name] !== undefined) w.value = stash[w.name];
          if (!node.__AUN_allWidgets.includes(w)) node.__AUN_allWidgets.push(w);
          node._AUN_ts2_removed.set(w.name, w);
          stash[w.name] = w.value;
          node.removeWidget(w);
        }
        node.setSize([width, COMPACT_HEIGHT]);
        ts2Debug("compact state:", {
          stash,
          choose: vueGetWidget(node, "choose")?.value,
          widgets: (node.widgets || []).map((w) => w.name),
          widgetValues: Object.fromEntries(
            (node.widgets || [])
              .filter((w) => w?.name)
              .map((w) => [w.name, String(w.value ?? "").slice(0, 30)]),
          ),
          links: (node.inputs || []).map((i) => ({
            name: i.name,
            link: i.link ?? null,
          })),
        });
      } else {
        // 'choose' is never removed and stays def-faithful. Re-add the
        // removed widgets and restore definition order.
        const saved = node.properties[COMPACT_VALUES_PROP] || {};
        for (const name of WIDGET_ORDER) {
          if (name === "choose") continue;
          // Only re-create widgets that compact mode actually removed.
          // Linked forceInput widgets leave node.widgets (they become pure
          // input slots) — re-adding them would create duplicate widgets.
          const stale = node._AUN_ts2_removed.get(name);
          if (!stale) continue;
          if (vueGetWidget(node, name)) continue; // still present
          const value =
            saved[name] !== undefined
              ? saved[name]
              : stale?.value !== undefined
                ? stale.value
                : "";
          const type = stale?.type ?? "text";
          const options = stale?.options ? { ...stale.options } : {};
          if (
            options.multiline === undefined &&
            (type === "text" || type === "customtext")
          ) {
            options.multiline = false;
          }
          node.addWidget(type, name, value, () => {}, options);
          const w = vueGetWidget(node, name);
          if (w) {
            // addWidget binds to the widget store's retained value for this
            // name (left empty by removeWidget) — re-assert the stashed value.
            w.value = value;
            if (stale?.label !== undefined) w.label = stale.label;
            if (stale?.comfyHeight !== undefined) {
              w.comfyHeight = stale.comfyHeight;
            }
          }
        }
        sortWidgets(node);
        node._AUN_ts2_removed = new Map();
        node.properties[COMPACT_VALUES_PROP] = {};
    wireLabelCallbacks();

    // Keep the stash in sync when 'choose' changes while compact, so a
    // reload restores the latest selection.
    const chooseW = vueGetWidget(node, "choose");
    if (chooseW && !chooseW.__AUN_ts2_chooseWired) {
      chooseW.__AUN_ts2_chooseWired = true;
      const origChooseCb = chooseW.callback;
      chooseW.callback = function (v) {
        if (typeof origChooseCb === "function") {
          try {
            origChooseCb.apply(this, arguments);
          } catch (_) {}
        }
        const st =
          node.properties[COMPACT_VALUES_PROP] ||
          (node.properties[COMPACT_VALUES_PROP] = {});
        st.choose = v;
      };
    }

        const prevSize = node.properties[COMPACT_SIZE_PROP];
        if (Array.isArray(prevSize) && prevSize.length === 2) {
          node.setSize(prevSize);
        } else if (typeof node.computeSize === "function") {
          try {
            node.setSize([width, node.computeSize()[1]]);
          } catch (_) {}
        }
        delete node.properties[COMPACT_SIZE_PROP];
        requestAnimationFrame(() => updateLabels());
      }

      node.updateConnectionsPos?.();
      forceFullRedraw();
      // Make direct property/widget mutations visible to the Vue workflow
      // change tracker so the autosave snapshot includes them.
      setTimeout(() => vueTriggerWorkflowCapture(), 50);
    };
    node.__AUN_refreshCompact = refreshCompact;

    wireLabelCallbacks();

    // After a workflow load, restore stashed values onto the fresh widgets
    // before compact removal, then refresh combo options and compact state.
    const origOnConfigure = node.onConfigure;
    node.onConfigure = function (info) {
      if (typeof origOnConfigure === "function") {
        origOnConfigure.apply(this, arguments);
      }
      // Restore full widget values by name — overrides any positional
      // widgets_values misalignment caused by a compact-mode save.
      restoreAunWidgetValues(node);
      const saved = node.properties[COMPACT_VALUES_PROP] || {};
      if (node.properties[COMPACT_PROP]) {
        for (const name of Object.keys(saved)) {
          const w = vueGetWidget(node, name);
          if (w && saved[name] !== undefined) w.value = saved[name];
        }
      }
      requestAnimationFrame(() => {
        updateLabels();
        refreshCompact();
      });
      // Post-load settle pass: by now links are fully applied, so widgets
      // that looked unlinked during the first pass (and were therefore
      // skipped) can be removed safely — or kept if a link arrived.
      setTimeout(() => {
        try {
          updateLabels();
          refreshCompact();
        } catch (_) {}
      }, 600);
    };

    requestAnimationFrame(() => {
      restoreAunWidgetValues(node);
      updateLabels();
      refreshCompact();
    });
  },
});
