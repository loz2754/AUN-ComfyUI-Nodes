import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Helper for flexible title matching with exclusion support
function matchesTarget(text, searchTerms) {
    if (!searchTerms || searchTerms.length === 0) return false;
    
    const includes = [];
    const excludes = [];
    
    for (const term of searchTerms) {
        if (term.startsWith('!') || term.startsWith('-')) {
            const t = term.substring(1).trim();
            if (t) excludes.push(t);
        } else {
            includes.push(term);
        }
    }
    
    const lowerText = text.toLowerCase();
    
    // If we have excludes, and any exclude matches, it's a hard no.
    if (excludes.some(exc => lowerText.includes(exc))) {
        return false;
    }
    
    // If we have includes, at least one must match.
    if (includes.length > 0) {
        return includes.some(inc => lowerText.includes(inc));
    }
    
    // If we ONLY have excludes and none matched (checked above), 
    // then it's a match (e.g. "!load" matches everything except "load").
    return excludes.length > 0;
}

// Bypass by titles
api.addEventListener("AUN_set_bypass_by_titles", (event) => {
    try {
        const detail = event.detail || {};
        const titles = Array.isArray(detail.titles) ? detail.titles : [];
        const isActive = !!detail.is_active;
        if (!titles.length) return;
        const titleSet = new Set(titles.map(t => `${t}`.trim().toLowerCase()).filter(Boolean));

        const getAllGraphs = (root) => {
            let graphs = [root];
            const getChildGraphs = (graph) => {
                if (!graph) return;
                if (graph._subgraphs) {
                    const subs = graph._subgraphs instanceof Map ? graph._subgraphs.values() : Object.values(graph._subgraphs);
                    for (const sub of subs) {
                        if (sub && !graphs.includes(sub)) {
                            graphs.push(sub);
                            getChildGraphs(sub);
                        }
                    }
                }
                if (graph._nodes) {
                    for (const node of graph._nodes) {
                        const inner = node.getInnerGraph?.() || node.subgraph || node.inner_graph;
                        if (inner && !graphs.includes(inner)) {
                            graphs.push(inner);
                            getChildGraphs(inner);
                        }
                    }
                }
            };
            getChildGraphs(root);
            return graphs;
        };

        const graphs = getAllGraphs(app.graph);
        const searchTitles = Array.from(titleSet);
        for (const graph of graphs) {
            if (!graph._nodes) continue;
            for (const node of graph._nodes) {
                const nTitle = `${node.title ?? ''}`.toLowerCase();
                const match = matchesTarget(nTitle, searchTitles);
                if (match) {
                    const applyToNode = (n, active) => {
                        n.mode = active ? 0 : 4;
                        const inner = n.getInnerGraph?.() || n.subgraph || n.inner_graph;
                        if (inner && inner._nodes) {
                            for (const innerNode of inner._nodes) {
                                applyToNode(innerNode, active);
                            }
                        }
                    };
                    applyToNode(node, isActive);
                }
            }
        }
        app.graph.setDirtyCanvas(true, true);
    } catch (e) {}
});

// Mute by titles
api.addEventListener("AUN_set_mute_by_titles", (event) => {
    try {
        const detail = event.detail || {};
        const titles = Array.isArray(detail.titles) ? detail.titles : [];
        const isActive = !!detail.is_active;
        if (!titles.length) return;
        const titleSet = new Set(titles.map(t => `${t}`.trim().toLowerCase()).filter(Boolean));

        const getAllGraphs = (root) => {
            let graphs = [root];
            const getChildGraphs = (graph) => {
                if (!graph) return;
                if (graph._subgraphs) {
                    const subs = graph._subgraphs instanceof Map ? graph._subgraphs.values() : Object.values(graph._subgraphs);
                    for (const sub of subs) {
                        if (sub && !graphs.includes(sub)) {
                            graphs.push(sub);
                            getChildGraphs(sub);
                        }
                    }
                }
                if (graph._nodes) {
                    for (const node of graph._nodes) {
                        const inner = node.getInnerGraph?.() || node.subgraph || node.inner_graph;
                        if (inner && !graphs.includes(inner)) {
                            graphs.push(inner);
                            getChildGraphs(inner);
                        }
                    }
                }
            };
            getChildGraphs(root);
            return graphs;
        };

        const graphs = getAllGraphs(app.graph);
        const searchTitles = Array.from(titleSet);
        for (const graph of graphs) {
            if (!graph._nodes) continue;
            for (const node of graph._nodes) {
                const nTitle = `${node.title ?? ''}`.toLowerCase();
                const match = matchesTarget(nTitle, searchTitles);
                if (match) {
                    const applyToNode = (n, active) => {
                        n.mode = active ? 0 : 2;
                        const inner = n.getInnerGraph?.() || n.subgraph || n.inner_graph;
                        if (inner && inner._nodes) {
                            for (const innerNode of inner._nodes) {
                                applyToNode(innerNode, active);
                            }
                        }
                    };
                    applyToNode(node, isActive);
                }
            }
        }
        app.graph.setDirtyCanvas(true, true);
    } catch (e) {}
});

app.registerExtension({
    name: "AUN.TitlesToggle.Instant",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name === "AUNSetBypassByTitle" || nodeData.name === "AUNSetMuteByTitle" || nodeData.name === "AUNMultiBypassTitles3" || nodeData.name === "AUNMultiBypassTitles6" || nodeData.name === "AUNMultiBypassTitles2") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                onNodeCreated?.apply(this, arguments);
    if (nodeData.name === "AUNMultiBypassTitles3" || nodeData.name === "AUNMultiBypassTitles6" || nodeData.name === "AUNMultiBypassTitles2") {
                    // Add toggleRestriction combo (default | max one | always one), default to max one for compact 3-slot node
                    const ensureToggleRestriction = () => {
                        const name = "toggleRestriction";
                        let w = this.widgets?.find(w => w.name === name);
                        const options = { values: ["default", "max one", "always one"] };
            const defaultValue = (nodeData.name === "AUNMultiBypassTitles3" || nodeData.name === "AUNMultiBypassTitles2") ? "max one" : "default";
                        if (!w) {
                            this.addWidget("combo", name, defaultValue, (v)=>{ this.properties = this.properties || {}; this.properties[name] = v; }, options);
                            w = this.widgets?.find(w => w.name === name);
                        } else if (w.type === "combo") {
                            w.options = options;
                            if (!options.values.includes(w.value)) w.value = defaultValue;
                        }
                        this.properties = this.properties || {};
                        this.properties[name] = (this.widgets.find(w=>w.name===name)?.value) || defaultValue;
                        if (w) {
                            const prev = w.callback;
                            w.callback = (v)=>{ this.properties[name] = v; try{prev?.call(w,v);}catch{} if (!this.configuring) { this.__AUN_titles_normalize?.(); } };
                        }
                    };
                    ensureToggleRestriction();
                    // Move AllSwitch to bottom
                    try {
                        const idx = this.widgets?.findIndex(w=>w.name==="AllSwitch");
                        if (idx >= 0) {
                            const w = this.widgets.splice(idx,1)[0];
                            this.widgets.push(w);
                        }
                    } catch {}

                    // Helper: normalize according to restriction with last-clicked-wins
            this.__AUN_titles_normalize = () => {
                        if (this.configuring) return;
                        try {
                            ensureToggleRestriction();
                            const restriction = (this.properties?.toggleRestriction) || this.widgets.find(w=>w.name==="toggleRestriction")?.value || "default";
                            if (restriction === "default") return;
                const count = (nodeData.name === "AUNMultiBypassTitles6") ? 6 : (nodeData.name === "AUNMultiBypassTitles2" ? 2 : 3);
                            const onIdx = [];
                            for (let i=1;i<=count;i++){
                                const sw = this.widgets.find(w=>w.name===`Switch${i}`);
                                if (sw && sw.value) onIdx.push(i);
                            }
                            if (onIdx.length === 0 && restriction === "always one") {
                                const keepIdx = (this.__AUN_lastTitleActivated && this.__AUN_lastTitleActivated>=1 && this.__AUN_lastTitleActivated<=count) ? this.__AUN_lastTitleActivated : 1;
                                const sw = this.widgets.find(w=>w.name===`Switch${keepIdx}`);
                                if (sw) { this.__AUN_titles_restricting = true; try{ sw.callback?.call(sw,true);}catch{} sw.value = true; this.__AUN_titles_restricting=false; }
                                return;
                            }
                            if (onIdx.length > 1) {
                                const keep = (this.__AUN_lastTitleActivated && onIdx.includes(this.__AUN_lastTitleActivated)) ? this.__AUN_lastTitleActivated : onIdx[onIdx.length-1];
                                this.__AUN_titles_restricting = true;
                for (const idx of onIdx){ if (idx===keep) continue; const sw=this.widgets.find(w=>w.name===`Switch${idx}`); try{sw?.callback?.call(sw,false);}catch{} if (sw) sw.value=false; }
                                this.__AUN_titles_restricting = false;
                            }
                        } catch {}
                    };

            // Wire title/switch pairs for 3 or 6
            const maxSlots = (nodeData.name === "AUNMultiBypassTitles6") ? 6 : (nodeData.name === "AUNMultiBypassTitles2" ? 2 : 3);
            const getModeWidget = () => {
                        if (!Array.isArray(this.widgets)) return undefined;
                        return this.widgets.find(w => w.name === "UseMute") || this.widgets.find(w => w.name === "DisableMode");
                    };
            const resolveDisableLabel = (widget, rawValue) => {
                        if (!widget) return "";
                        const value = rawValue !== undefined ? rawValue : widget.value;
                        if (typeof value === "string") return value;
                        if (typeof value === "number") {
                            const list = widget.options?.values || widget.options?.choices;
                            if (Array.isArray(list) && value >= 0 && value < list.length) {
                                return list[value];
                            }
                        }
                        return `${value ?? ""}`;
                    };
            const resolveUseMute = () => {
                        const widget = getModeWidget();
                        if (widget) {
                            this.properties = this.properties || {};
                            if (widget.name === "DisableMode") {
                                const label = resolveDisableLabel(widget);
                                this.properties.DisableMode = label;
                                return label.toLowerCase().includes("mute");
                            }
                            this.properties.UseMute = !!widget.value;
                            return !!widget.value;
                        }
                        const storedMode = `${this.properties?.DisableMode ?? ""}`.toLowerCase();
                        if (storedMode) return storedMode.includes("mute");
                        if (typeof this.properties?.UseMute === "boolean") return this.properties.UseMute;
                        return false;
                    };
            const setNodesForTitle = (rawTitle, isActive) => {
                        if (this.configuring) return false;
                        const graph = app?.graph;
                        if (!graph) return false;
                        const title = (rawTitle || "").trim().toLowerCase();
                        if (!title) return false;

                        const getAllGraphs = (root) => {
                            let graphs = [root];
                            const getChildGraphs = (graph) => {
                                if (!graph) return;
                                if (graph._subgraphs) {
                                    const subs = graph._subgraphs instanceof Map ? graph._subgraphs.values() : Object.values(graph._subgraphs);
                                    for (const sub of subs) {
                                        if (sub && !graphs.includes(sub)) {
                                            graphs.push(sub);
                                            getChildGraphs(sub);
                                        }
                                    }
                                }
                                if (graph._nodes) {
                                    for (const node of graph._nodes) {
                                        const inner = node.getInnerGraph?.() || node.subgraph || node.inner_graph;
                                        if (inner && !graphs.includes(inner)) {
                                            graphs.push(inner);
                                            getChildGraphs(inner);
                                        }
                                    }
                                }
                            };
                            getChildGraphs(root);
                            return graphs;
                        };

                        const useMute = resolveUseMute();
                        let touched = false;
                        const graphs = getAllGraphs(graph);
                        const searchTitles = [title];
                        for (const g of graphs) {
                            if (!g._nodes) continue;
                            for (const node of g._nodes) {
                                const nTitle = `${node.title ?? ''}`.toLowerCase();
                                if (matchesTarget(nTitle, searchTitles)) {
                                    const applyToNode = (n, active) => {
                                        n.mode = active ? 0 : (useMute ? 2 : 4);
                                        const inner = n.getInnerGraph?.() || n.subgraph || n.inner_graph;
                                        if (inner && inner._nodes) {
                                            for (const innerNode of inner._nodes) {
                                                applyToNode(innerNode, active);
                                            }
                                        }
                                    };
                                    applyToNode(node, isActive);
                                    touched = true;
                                }
                            }
                        }
                        return touched;
                    };
            this.__AUN_titles_applyCurrentStates = () => {
                        if (this.configuring) return;
                        let updated = false;
                        for (let i = 1; i <= maxSlots; i++) {
                            const titleW = this.widgets.find(w => w.name === `Title${i}`);
                            const sw = this.widgets.find(w => w.name === `Switch${i}`);
                            if (!titleW || !sw) continue;
                            if (setNodesForTitle(titleW.value, !!sw.value)) updated = true;
                        }
                        if (updated && app?.graph) app.graph.setDirtyCanvas(true, true);
                    };
            const attachModeWatcher = () => {
                        const widget = getModeWidget();
                        if (!widget) {
                            setTimeout(attachModeWatcher, 100);
                            return;
                        }
                        const prev = widget.callback;
                        widget.callback = (value) => {
                            this.properties = this.properties || {};
                            if (widget.name === "DisableMode") {
                                const label = resolveDisableLabel(widget, value);
                                this.properties.DisableMode = label;
                            } else {
                                this.properties.UseMute = !!value;
                            }
                            try { prev?.call(widget, value); } catch {}
                            if (!this.configuring) {
                                this.__AUN_titles_applyCurrentStates?.();
                            }
                        };
                        this.properties = this.properties || {};
                        if (widget.name === "DisableMode") {
                            const label = resolveDisableLabel(widget);
                            this.properties.DisableMode = label;
                        } else {
                            this.properties.UseMute = !!widget.value;
                        }
                    };
                    attachModeWatcher();
            for (let i = 1; i <= maxSlots; i++) {
                        const titleW = this.widgets.find(w => w.name === `Title${i}`);
                        const switchW = this.widgets.find(w => w.name === `Switch${i}`);
                        if (!titleW || !switchW) continue;
                        const orig = switchW.callback;
                        switchW.callback = (value) => {
                            if (this.__AUN_titles_settingAll) return;
                            ensureToggleRestriction();
                            const restriction = (this.properties?.toggleRestriction) || this.widgets.find(w=>w.name==="toggleRestriction")?.value || "default";
                            const isRestricting = !!this.__AUN_titles_restricting;
                            // Exclusivity when turning on
                            if (!isRestricting && (restriction === "max one" || restriction === "always one") && value) {
                                this.__AUN_lastTitleActivated = i;
                                this.__AUN_titles_restricting = true;
                for (let j=1;j<=maxSlots;j++){
                                    if (j===i) continue;
                                    const other = this.widgets.find(w=>w.name===`Switch${j}`);
                                    if (other && other.value) { try{ other.callback?.call(other,false);}catch{} other.value=false; }
                                }
                                this.__AUN_titles_restricting = false;
                            }
                            // Always-one revert
                            if (!isRestricting && restriction === "always one" && !value) {
                let anyOther=false; for (let j=1;j<=maxSlots;j++){ if(j===i) continue; const s=this.widgets.find(w=>w.name===`Switch${j}`); if(s && s.value){ anyOther=true; break; } }
                                if (!anyOther) { this.__AUN_titles_restricting=true; try{ switchW.callback?.call(switchW,true);}catch{} switchW.value=true; this.__AUN_titles_restricting=false; return; }
                            }
                            try { orig?.call(switchW, value); } catch {}
                            if (!this.configuring) {
                                const title = (titleW.value || '').trim();
                                if (!title) return;
                                if (setNodesForTitle(title, !!value)) app.graph.setDirtyCanvas(true, true);
                                this.__AUN_titles_normalize?.();
                            }
                        };
                    }

            // AllSwitch applies to all titles and updates UI states without fighting restriction
                    const allSwitchW = this.widgets.find(w=>w.name==="AllSwitch");
                    if (allSwitchW) {
                        const origAll = allSwitchW.callback;
                        allSwitchW.callback = (value)=>{
                            try{ origAll?.call(allSwitchW,value);}catch{}
                            const on = !!value;
                            this.__AUN_titles_settingAll = true;
                for (let i=1;i<=((nodeData.name === "AUNMultiBypassTitles6") ? 6 : (nodeData.name === "AUNMultiBypassTitles2" ? 2 : 3)); i++){
                                const titleW = this.widgets.find(w=>w.name===`Title${i}`);
                                const sw = this.widgets.find(w=>w.name===`Switch${i}`);
                                if (!titleW || !sw) continue;
                                const title = (titleW.value||'').trim();
                                if (!title) { sw.value = on; continue; }
                                if (!this.configuring) {
                                    setNodesForTitle(title, on);
                                }
                                sw.value = on;
                            }
                            this.__AUN_titles_settingAll = false;
                            app.graph.setDirtyCanvas(true, true);
                        };
                    }
                    // Initial normalize
                    setTimeout(()=> {
                        if (!this.configuring) {
                            ensureDisableModeCombo();
                            this.__AUN_titles_normalize?.();
                            this.__AUN_titles_applyCurrentStates?.();
                        }
                    }, 0);
                } else {
                    const titlesWidget = this.widgets.find(w => w.name === "titles");
                    const switchWidget = this.widgets.find(w => w.name === "Switch");
                    if (!titlesWidget || !switchWidget) return;
                    const orig = switchWidget.callback;
                    switchWidget.callback = (value) => {
                        orig?.call(switchWidget, value);
                        const items = (titlesWidget.value || '').split(/[,\n;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
                        const isActive = !!value;

                        const getAllGraphs = (root) => {
                            let graphs = [root];
                            const getChildGraphs = (graph) => {
                                if (!graph) return;
                                if (graph._subgraphs) {
                                    const subs = graph._subgraphs instanceof Map ? graph._subgraphs.values() : Object.values(graph._subgraphs);
                                    for (const sub of subs) {
                                        if (sub && !graphs.includes(sub)) {
                                            graphs.push(sub);
                                            getChildGraphs(sub);
                                        }
                                    }
                                }
                                if (graph._nodes) {
                                    for (const node of graph._nodes) {
                                        const inner = node.getInnerGraph?.() || node.subgraph || node.inner_graph;
                                        if (inner && !graphs.includes(inner)) {
                                            graphs.push(inner);
                                            getChildGraphs(inner);
                                        }
                                    }
                                }
                            };
                            getChildGraphs(root);
                            return graphs;
                        };

                        const graphs = getAllGraphs(app.graph);
                        for (const graph of graphs) {
                            if (!graph._nodes) continue;
                            for (const node of graph._nodes) {
                                const nTitle = `${node.title ?? ''}`.toLowerCase();
                                const match = matchesTarget(nTitle, items);
                                if (match) {
                                    const applyToNode = (n, active) => {
                                        n.mode = (nodeData.name === "AUNSetBypassByTitle") ? (active ? 0 : 4) : (active ? 0 : 2);
                                        const inner = n.getInnerGraph?.() || n.subgraph || n.inner_graph;
                                        if (inner && inner._nodes) {
                                            for (const innerNode of inner._nodes) {
                                                applyToNode(innerNode, active);
                                            }
                                        }
                                    };
                                    applyToNode(node, isActive);
                                }
                            }
                        }
                        app.graph.setDirtyCanvas(true, true);
                    };
                }
            };
        }
    }
});
