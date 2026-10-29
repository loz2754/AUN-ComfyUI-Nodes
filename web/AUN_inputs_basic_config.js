import { app } from "../../scripts/app.js";
import { WIDGET_CONFIG_TARGETS } from "./AUN_widget_config_targets.js";

// Merge file-based targets with any saved at runtime via the AUN Widget Config node.
function loadTargets() {
    const set = new Set(WIDGET_CONFIG_TARGETS || []);
    try {
        const saved = JSON.parse(localStorage.getItem("aun_widget_config_targets") || "[]");
        for (const n of saved || []) if (n) set.add(n);
    } catch (e) { /* ignore */ }
    return [...set];
}

// Nodes that get the "Configure widgets" right-click option.
const TARGET_NODES = loadTargets();

// Widgets that must never be hidden (keep them always visible).
const EXCLUDE = new Set(["control_after_generate", "set"]);

function toggleableWidgets(node) {
    const names = [];
    const seen = new Set();
    for (const w of node.widgets || []) {
        if (!w || !w.name) continue;
        if (EXCLUDE.has(w.name)) continue;
        if (seen.has(w.name)) continue;
        seen.add(w.name);
        names.push(w.name);
    }
    return names;
}

function getCfg(node) {
    if (!node.properties) node.properties = {};
    if (!node.properties._aunInputsCfg) node.properties._aunInputsCfg = { hidden: [] };
    return node.properties._aunInputsCfg;
}

// Force LiteGraph to rebuild link endpoints by disconnecting and reconnecting
// every link touching the node. Preserves node id, values and references.
function reconnectNodeLinks(node) {
    const graph = node?.graph || app.graph;
    if (!graph) return false;
    const recs = [];
    const seen = new Set();
    const record = (id) => {
        if (id == null || seen.has(id)) return;
        seen.add(id);
        let l = null;
        try { l = graph.links?.get?.(id) ?? graph.links?.[id]; } catch (e) { /* ignore */ }
        if (!l) return;
        recs.push({
            origin_id: l.origin_id,
            origin_slot: l.origin_slot,
            target_id: l.target_id,
            target_slot: l.target_slot,
        });
    };
    for (const inp of node.inputs || []) if (inp && inp.link != null) record(inp.link);
    for (const out of node.outputs || []) for (const lid of out.links || []) record(lid);
    if (!recs.length) return false;

    for (const id of seen) { try { graph.removeLink(id); } catch (e) { /* ignore */ } }
    for (const r of recs) {
        try {
            const origin = graph.getNodeById?.(r.origin_id);
            const target = graph.getNodeById?.(r.target_id);
            if (origin && target && typeof origin.connect === "function") {
                origin.connect(r.origin_slot, target, r.target_slot);
            }
        } catch (e) { /* ignore */ }
    }
    return true;
}

// Reliable fallback: reload the graph from its serialized state (in-app F5).
// Preserves node ids, values and links, and rebuilds all slot geometry.
function reloadGraph(excludeNodeId = null) {
    try {
        const data = app.graph?.serialize?.();
        if (!data) return false;
        // Capture user-set node sizes so the reload doesn't reset them.
        const sizes = new Map();
        for (const n of (app.graph?._nodes || [])) {
            if (n?.id != null && Array.isArray(n.size)) {
                sizes.set(n.id, [n.size[0], n.size[1]]);
            }
        }
        const restore = () => {
            for (const n of (app.graph?._nodes || [])) {
                if (n?.id == null || n.id === excludeNodeId) continue;
                const s = sizes.get(n.id);
                if (!s) continue;
                try {
                    if (n.size?.[0] !== s[0] || n.size?.[1] !== s[1]) n.setSize([s[0], s[1]]);
                } catch (e) { /* ignore */ }
            }
            try { app.canvas?.setDirty?.(true, true); } catch (e) { /* ignore */ }
        };
        let p;
        if (typeof app.loadGraphData === "function") {
            p = app.loadGraphData(data);
        } else {
            app.graph.configure(data);
            p = Promise.resolve();
        }
        Promise.resolve(p).then(() => {
            setTimeout(restore, 120);
            setTimeout(restore, 400);
        });
        return true;
    } catch (e) {
        console.warn("[AUN Widget Config] graph reload failed", e);
        return false;
    }
}

function nodeHasLinks(node) {
    return (node.inputs || []).some((i) => i && i.link != null) ||
        (node.outputs || []).some((o) => o && Array.isArray(o.links) && o.links.length);
}

function sizeNudge(node) {
    try {
        const w = node.size?.[0];
        const h = node.size?.[1];
        if (!Number.isFinite(w) || !Number.isFinite(h)) return;
        node.setSize([w, h + 1]);
        requestAnimationFrame(() => {
            try { node.setSize([w, h]); node.setDirtyCanvas(true, true); } catch (e) { /* ignore */ }
        });
    } catch (e) { /* ignore */ }
}

function applyHidden(node, { reconnect = true, resize = true } = {}) {
    const cfg = getCfg(node);
    const hidden = new Set(cfg.hidden || []);
    for (const w of node.widgets || []) {
        if (EXCLUDE.has(w.name)) continue;
        let isHidden = hidden.has(w.name);
        if (w.name === "control_after_generate" && hidden.has("seed")) isHidden = true;
        w.hidden = isHidden;
        if (w.hidden) {
            w.computeSize = () => [0, -4];
        } else {
            w.computeSize = undefined;
        }
    }
    // On workflow load we must NOT resize: doing so would overwrite the user's
    // saved node size with computeSize(). Only resize when applying a config.
    if (resize) {
        const cs = node.computeSize();
        const w = (node.size && Number.isFinite(node.size[0])) ? node.size[0] : (cs[0] || 0);
        if (typeof node.setSize === "function") {
            node.setSize([w, cs[1]]);
        } else {
            if (!Array.isArray(node.size)) node.size = [w, cs[1]];
            node.size[1] = cs[1];
        }
    }

    // Recompute widget/slot geometry so links follow the new layout.
    // Only when actually applying a config: marking the node dirty during
    // workflow load makes LiteGraph re-arrange widgets and grow the node,
    // overwriting the user's saved size.
    if (resize) {
        try {
            node._widgetSlotsDirty = true;
            node._setConcreteSlots?.();
            node.arrange?.();
        } catch (e) { /* ignore */ }
    }
    node.setDirtyCanvas(true, true);
    try { app.canvas?.setDirty?.(true, true); } catch (e) { /* ignore */ }
    try { app.graph?.setDirtyCanvas?.(true, true); } catch (e) { /* ignore */ }

    // Rebuild link endpoints; fall back to a size nudge if that fails.
    if (reconnect) {
        let ok = false;
        try { ok = reconnectNodeLinks(node); } catch (e) { ok = false; }
        if (!ok) sizeNudge(node);
        try { app.canvas?.setDirty?.(true, true); } catch (e) { /* ignore */ }
    }
}

function openConfig(node) {
    const widgets = toggleableWidgets(node);
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;";
    const panel = document.createElement("div");
    panel.style.cssText = "background:#222;padding:16px;border-radius:8px;min-width:260px;color:#eee;max-height:80vh;overflow:auto;";
    panel.innerHTML = "<div style='font-weight:bold;margin-bottom:8px'>Widget visibility</div>";
    const cfg = getCfg(node);
    const hidden = new Set(cfg.hidden || []);
    const cbs = [];
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "margin-bottom:8px;";
    const allBtn = document.createElement("button");
    allBtn.textContent = "All";
    allBtn.style.cssText = "margin-right:6px;padding:2px 8px;";
    const noneBtn = document.createElement("button");
    noneBtn.textContent = "None";
    noneBtn.style.cssText = "padding:2px 8px;";
    btnRow.appendChild(allBtn);
    btnRow.appendChild(noneBtn);
    panel.appendChild(btnRow);
    for (const name of widgets) {
        const row = document.createElement("label");
        row.style.cssText = "display:block;margin:4px 0;";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !hidden.has(name);
        cb.onchange = () => {
            if (cb.checked) hidden.delete(name); else hidden.add(name);
        };
        cbs.push({ name, cb });
        row.appendChild(cb);
        row.appendChild(document.createTextNode(" " + name));
        panel.appendChild(row);
    }
    const btn = document.createElement("button");
    btn.textContent = "Apply";
    btn.style.cssText = "margin-top:10px;padding:4px 12px;";
    btn.onclick = () => {
        cfg.hidden = [...hidden];
        const hadLinks = nodeHasLinks(node);
        applyHidden(node, { reconnect: false });
        document.body.removeChild(overlay);
        // In-place slot updates don't stick reliably in the user's frontend;
        // an in-app graph reload is the dependable fix (same as F5).
        if (hadLinks) reloadGraph(node.id);
    };
    allBtn.onclick = () => { for (const c of cbs) { c.cb.checked = true; hidden.delete(c.name); } };
    noneBtn.onclick = () => { for (const c of cbs) { c.cb.checked = false; hidden.add(c.name); } };
    panel.appendChild(btn);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
}

app.registerExtension({
    name: "AUNNodes.WidgetConfig",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!TARGET_NODES.includes(nodeData.name)) return;
        const orig = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (orig) orig.apply(this, arguments);
            // Apply hidden state without resizing: on workflow load this hook can
            // run after configure() has restored the user's saved node size.
            applyHidden(this, { resize: false });
            const menu = this.getExtraMenuOptions;
            this.getExtraMenuOptions = function (canvas, options) {
                if (menu) menu.apply(this, arguments);
                options.push({ content: "Configure widgets", callback: () => openConfig(this) });
            };
        };
        const origCfg = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            if (origCfg) origCfg.apply(this, arguments);
            // Capture the saved size restored by configure(), then re-assert it
            // after applying hidden state so nothing on load can shrink it.
            const savedW = this.size?.[0];
            const savedH = this.size?.[1];
            applyHidden(this, { reconnect: false, resize: false });
            const restoreSize = () => {
                try {
                    if (Number.isFinite(savedW) && Number.isFinite(savedH) &&
                        (this.size?.[0] !== savedW || this.size?.[1] !== savedH)) {
                        this.setSize([savedW, savedH]);
                    }
                } catch (e) { /* ignore */ }
            };
            requestAnimationFrame(restoreSize);
            setTimeout(restoreSize, 150);
        };
    }
});