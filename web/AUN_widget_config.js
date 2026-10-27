import { app } from "../../scripts/app.js";
import { WIDGET_CONFIG_TARGETS } from "./AUN_widget_config_targets.js";

const STORAGE_KEY = "aun_widget_config_targets";

function getSaved() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch (e) { return []; }
}

function getAllAunNodes() {
    const reg = (globalThis.LiteGraph?.registered_node_types) || {};
    return Object.keys(reg).filter((n) => n.startsWith("AUN")).sort();
}

async function fetchTargets() {
    try {
        const res = await fetch("/aun/widget-config/targets");
        const data = await res.json();
        if (Array.isArray(data?.targets)) return data.targets;
    } catch (e) { /* ignore */ }
    return null;
}

async function openManager(node) {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;";
    const panel = document.createElement("div");
    panel.style.cssText = "background:#222;padding:16px;border-radius:8px;min-width:320px;max-width:420px;max-height:80vh;overflow:auto;color:#eee;";
    panel.innerHTML = "<div style='font-weight:bold;margin-bottom:8px'>Widget-config targets</div>"
        + "<div style='font-size:12px;color:#aaa;margin-bottom:8px'>Check nodes that should get 'Configure widgets'. Save, then reload ComfyUI.</div>";

    const fetched = await fetchTargets();
    const saved = new Set([...(WIDGET_CONFIG_TARGETS || []), ...(fetched || getSaved())]);
    // seed file-based targets
    try {
        // best-effort: include known defaults
    } catch (e) { /* ignore */ }

    const list = document.createElement("div");
    list.style.cssText = "max-height:40vh;overflow:auto;margin-bottom:8px;";
    const cbs = [];
    for (const name of getAllAunNodes()) {
        const row = document.createElement("label");
        row.style.cssText = "display:block;margin:2px 0;font-size:12px;";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = saved.has(name);
        cb.style.marginRight = "6px";
        row.appendChild(cb);
        row.appendChild(document.createTextNode(name));
        list.appendChild(row);
        cbs.push({ name, cb });
    }
    panel.appendChild(list);

    // Extra / non-AUN node classes
    const extraLabel = document.createElement("div");
    extraLabel.textContent = "Extra (non-AUN) node classes (one per line):";
    extraLabel.style.cssText = "font-size:12px;color:#aaa;margin:8px 0 4px;";
    panel.appendChild(extraLabel);
    const extra = document.createElement("textarea");
    extra.style.cssText = "width:100%;min-height:60px;background:#111;color:#eee;border:1px solid #444;border-radius:4px;padding:4px;font-size:12px;box-sizing:border-box;";
    const extraNames = [...saved].filter((n) => !n.startsWith("AUN"));
    extra.value = extraNames.join("\\n");
    panel.appendChild(extra);

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:8px;";
    const allBtn = document.createElement("button");
    allBtn.textContent = "All";
    allBtn.style.cssText = "padding:4px 10px;";
    const noneBtn = document.createElement("button");
    noneBtn.textContent = "None";
    noneBtn.style.cssText = "padding:4px 10px;";
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.style.cssText = "padding:4px 12px;background:#4a90d9;color:#fff;border:none;border-radius:4px;cursor:pointer;";
    btnRow.appendChild(allBtn);
    btnRow.appendChild(noneBtn);
    btnRow.appendChild(saveBtn);
    panel.appendChild(btnRow);

    allBtn.onclick = () => { for (const c of cbs) c.cb.checked = true; };
    noneBtn.onclick = () => { for (const c of cbs) c.cb.checked = false; };
    saveBtn.onclick = async () => {
        const names = cbs.filter((c) => c.cb.checked).map((c) => c.name);
        const extraNames = extra.value.split(/[\\n,]+/).map((s) => s.trim()).filter(Boolean);
        for (const n of extraNames) if (!names.includes(n)) names.push(n);
        try {
            await fetch("/aun/widget-config/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets: names }) });
        } catch (e) { console.warn("save failed", e); }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
        console.info("[AUN Widget Config] Saved targets:", names, "— reload ComfyUI to apply.");
        alert("Saved to file. Reload ComfyUI to apply changes.");
        document.body.removeChild(overlay);
    };

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
}

app.registerExtension({
    name: "AUNNodes.WidgetConfig.Node",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "AUNWidgetConfig") return;
        const origMenu = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
            if (origMenu) origMenu.apply(this, arguments);
            options.push({ content: "Configure widget targets", callback: () => openManager(this) });
        };
        // Also open on double-click
        const origDbl = nodeType.prototype.onDblClick;
        nodeType.prototype.onDblClick = function (...args) {
            origDbl?.apply(this, arguments);
            openManager(this);
        };
        // Add a visible button widget so users can press instead of right-clicking.
        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (origCreated) origCreated.apply(this, arguments);
            try {
                const w = this.addWidget("button", "configure_targets", "Configure targets", () => openManager(this));
                if (w) w.serialize = false;
            } catch (e) { /* ignore */ }
        };
    },
});