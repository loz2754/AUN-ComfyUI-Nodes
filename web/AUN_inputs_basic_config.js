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

function applyHidden(node) {
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
    const cs = node.computeSize();
    node.size[1] = cs[1];
    node.setDirtyCanvas(true, true);
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
        applyHidden(node);
        document.body.removeChild(overlay);
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
            applyHidden(this);
            const menu = this.getExtraMenuOptions;
            this.getExtraMenuOptions = function (canvas, options) {
                if (menu) menu.apply(this, arguments);
                options.push({ content: "Configure widgets", callback: () => openConfig(this) });
            };
        };
        const origCfg = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            if (origCfg) origCfg.apply(this, arguments);
            applyHidden(this);
        };
    }
});