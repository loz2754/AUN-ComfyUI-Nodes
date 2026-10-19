import { app } from "../../scripts/app.js";

const WIDGETS_BY_NODE = {
    AUNInputsBasic: ["ckpt_name","speed_lora","speed_lora_model","speed_lora_strength","clip_skip","sampler","scheduler","cfg","steps","aspect_ratio","aspect_mode","megapixels","multiple","batch_size","seed","width","height"],
};

function getCfg(node) {
    if (!node.properties) node.properties = {};
    if (!node.properties._aunInputsCfg) node.properties._aunInputsCfg = { hidden: [] };
    return node.properties._aunInputsCfg;
}

function applyHidden(node) {
    const cfg = getCfg(node);
    const hidden = new Set(cfg.hidden || []);
    const widgets = WIDGETS_BY_NODE[node.comfyClass] || [];
    for (const w of node.widgets || []) {
        let isHidden = hidden.has(w.name);
        if (w.name === "control_after_generate" && hidden.has("seed")) isHidden = true;
        if (!widgets.includes(w.name) && w.name !== "control_after_generate") continue;
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
    const widgets = WIDGETS_BY_NODE[node.comfyClass] || [];
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
        cbs.push({cb,name});
        row.appendChild(cb);
        row.appendChild(document.createTextNode(" " + name));
        panel.appendChild(row);
    }
    allBtn.onclick = () => { cbs.forEach(o => { o.cb.checked = true; hidden.delete(o.name); }); };
    noneBtn.onclick = () => { cbs.forEach(o => { o.cb.checked = false; hidden.add(o.name); }); };
    const btn = document.createElement("button");
    btn.textContent = "Apply";
    btn.style.cssText = "margin-top:10px;padding:4px 12px;";
    btn.onclick = () => {
        cfg.hidden = [...hidden];
        applyHidden(node);
        document.body.removeChild(overlay);
    };
    panel.appendChild(btn);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
}

app.registerExtension({
    name: "AUNNodes.InputsBasic.Config",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "AUNInputsBasic") return;
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
