import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
  NODE_MODE,
  getAllGraphs,
  forceGraphRedraw,
  registerGroupNodeType,
  startGroupWatcher,
  getNodeBounds,
  isNodeInsideGroups,
  buildBoundsMap,
  findGroupsByTitles,
} from "./index.js";

const NODE_TYPE = "AUNSetBypassStateGroup";

// Register with shared group watcher so a single interval serves both bypass & mute nodes
registerGroupNodeType(NODE_TYPE);

app.registerExtension({
  name: "AUN.SetBypassStateGroup.Event",
  async setup(app) {
    startGroupWatcher();

    // Apply bypass state for one or multiple selected groups when server event is received
    api.addEventListener("AUN_set_bypass_state_group", (event) => {
      try {
        const detail = event.detail || {};
        const isActive = !!detail.is_active;
        let titles = [];
        if (Array.isArray(detail.group_titles))
          titles = detail.group_titles.map((t) => `${t}`.trim()).filter(Boolean);
        else if (typeof detail.group_title === "string")
          titles = [detail.group_title.trim()].filter(Boolean); // back-compat
        if (!titles.length) return;

        const allGraphs = getAllGraphs(app.graph);
        for (const graph of allGraphs) {
          applyBypassToGroupsInGraph(graph, titles, isActive);
        }
        forceGraphRedraw(app);
      } catch (e) {}
    });

    // Also refresh on graph changes
    const originalOnGraphChanged = app.graph.onGraphChanged;
    app.graph.onGraphChanged = function () {
      originalOnGraphChanged?.apply(this, arguments);
      try {
        for (const node of app.graph._nodes) {
          if (node?.type === NODE_TYPE) {
            node._setupMultiSelect?.();
            node.syncTogglesWithGraph?.();
          }
        }
      } catch (e) {}
    };
  },

  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name !== NODE_TYPE) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);

      this.setGroupBypassState = (groupTitles, isActive) => {
        const titles = Array.isArray(groupTitles) ? groupTitles : [groupTitles];
        if (!titles.length) return;

        const allGraphs = getAllGraphs(app.graph);
        for (const graph of allGraphs) {
          applyBypassToGroupsInGraph(graph, titles, isActive);
        }
        forceGraphRedraw(app);
      };

      this._setupMultiSelect = () => {
        if (!Array.isArray(this.widgets)) {
          setTimeout(() => this._setupMultiSelect?.(), 100);
          return;
        }
        const widgetName = "group_titles";
        const idx = this.widgets.findIndex((w) => w.name === widgetName);
        if (idx === -1) return;
        const w = this.widgets[idx];
        w.hidden = true;
        const selectedSet = new Set(
          (w.value || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );

        this.widgets = this.widgets.filter((ww) => !ww._AUN_group_toggle);

        const allToggle = this.addWidget("toggle", "All Groups", false, (v) => {
          this._isCurrentlySettingState = true;
          const titles = getAllGroupTitles();
          if (v) {
            for (const t of titles) selectedSet.add(t);
          } else {
            selectedSet.clear();
          }
          for (const tw of this.widgets) {
            if (tw._AUN_group_toggle && tw._groupTitle) {
              tw.value = v;
            }
          }
          w.value = Array.from(selectedSet).join(", ");
          this.setGroupBypassState(titles, v);
          app.graph.setDirtyCanvas(true, true);
          this._isCurrentlySettingState = false;
        }, { on: "🟢", off: "🔴" });
        allToggle._AUN_group_toggle = true;

        const titles = getAllGroupTitles().sort((a, b) => a.localeCompare(b));
        for (const title of titles) {
          const initial = selectedSet.has(title);
          const tg = this.addWidget("toggle", `• ${title}`, initial, (v) => {
            this._isCurrentlySettingState = true;
            if (v) selectedSet.add(title);
            else selectedSet.delete(title);
            w.value = Array.from(selectedSet).join(", ");
            this.setGroupBypassState([title], v);
            this._isCurrentlySettingState = false;
          }, { on: "🟢", off: "🔴" });
          tg._AUN_group_toggle = true;
          tg._groupTitle = title;
        }
        w.value = Array.from(selectedSet).join(", ");
        const newSize = this.computeSize();
        if (this.size) {
          this.size[1] = newSize[1];
        } else {
          this.size = newSize;
        }
      };

      this.syncTogglesWithGraph = () => {
        if (!Array.isArray(this.widgets)) return;
        if (this._isCurrentlySettingState) return;
        const csvWidget = this.widgets.find((w) => w.name === "group_titles");
        if (!csvWidget) return;

        const allGroups = getAllGroupTitlesRaw();
        const toggleTitles = this.widgets
          .filter((w) => w._AUN_group_toggle && w._groupTitle)
          .map((w) => w._groupTitle);

        const uniqueGroupTitles = Array.from(new Set(allGroups.map((g) => g.title)));
        if (uniqueGroupTitles.length && toggleTitles.length !== uniqueGroupTitles.length) {
          this._setupMultiSelect();
        }

        const activeGroups = new Set();
        let allGroupsAreActive = allGroups.length > 0;
        let allGroupsAreBypassed = allGroups.length > 0;

        const groupsByTitle = new Map();
        for (const g of allGroups) {
          if (!groupsByTitle.has(g.title)) groupsByTitle.set(g.title, []);
          groupsByTitle.get(g.title).push(g);
        }

        for (const [title, groups] of groupsByTitle.entries()) {
          let titleIsBypassed = true;
          let titleIsActive = true;

          for (const group of groups) {
            const graph = group.graph;
            if (!graph) continue;

            const boundsMap = buildBoundsMap(graph);
            const nodesInGroup = (graph._nodes || []).filter((n) =>
              isNodeInsideGroups(n, [group], boundsMap),
            );
            if (nodesInGroup.length) {
              if (!nodesInGroup.every((n) => n.mode === NODE_MODE.BYPASSED))
                titleIsBypassed = false;
              if (!nodesInGroup.every((n) => n.mode === NODE_MODE.ACTIVE))
                titleIsActive = false;
            }
          }

          const toggle = this.widgets.find((w) => w._groupTitle === title);
          if (toggle) {
            let newState = toggle.value;
            if (titleIsActive) newState = true;
            else if (titleIsBypassed) newState = false;
            if (toggle.value !== newState) toggle.value = newState;
          }

          if (!titleIsBypassed) {
            activeGroups.add(title);
            allGroupsAreBypassed = false;
          } else {
            allGroupsAreActive = false;
          }
        }

        const allToggle = this.widgets.find((w) => w.name === "All Groups");
        if (allToggle) {
          let newState = false;
          if (!allGroups.length) newState = false;
          else if (allGroupsAreActive) newState = true;
          else if (allGroupsAreBypassed) newState = false;
          else newState = false;
          if (allToggle.value !== newState) allToggle.value = newState;
        }

        const newCsv = Array.from(activeGroups).join(", ");
        if (csvWidget.value !== newCsv) {
          csvWidget.value = newCsv;
        }
      };

      setTimeout(() => {
        this._setupMultiSelect();
        this.syncTogglesWithGraph();
      }, 100);

      const originalOnConfigure = this.onConfigure;
      this.onConfigure = (info) => {
        originalOnConfigure?.call(this, info);
        setTimeout(() => {
          this._setupMultiSelect();
          this.syncTogglesWithGraph();
        }, 0);
      };

      const originalOnDrawBackground = this.onDrawBackground;
      this.onDrawBackground = (ctx) => {
        originalOnDrawBackground?.call(this, ctx);
        const now = Date.now();
        if (!this._lastSyncTime || now - this._lastSyncTime > 500) {
          this._lastSyncTime = now;
          this.syncTogglesWithGraph();
        }
        if (!this.__convertedOnce) {
          this.__convertedOnce = true;
          setTimeout(() => {
            this._setupMultiSelect();
            this.syncTogglesWithGraph();
          }, 100);
        }
      };
    };
  },
});

// ── Local helpers (uses shared primitives) ────────────────────────

function getAllGroupTitles() {
  const allGraphs = getAllGraphs(app.graph);
  return Array.from(
    new Set(allGraphs.flatMap((g) => (g.groups || []).map((gg) => gg.title))),
  );
}

function getAllGroupTitlesRaw() {
  const allGraphs = getAllGraphs(app.graph);
  return allGraphs.flatMap((g) => g.groups || []);
}

function applyBypassToGroupsInGraph(graph, titles, isActive) {
  const selectedGroups = findGroupsByTitles(graph, titles);
  if (!selectedGroups.length) return;

  const boundsMap = buildBoundsMap(graph);
  for (const node of graph._nodes || []) {
    if (isNodeInsideGroups(node, selectedGroups, boundsMap)) {
      node.mode = isActive ? NODE_MODE.ACTIVE : NODE_MODE.BYPASSED;
    }
  }
}
