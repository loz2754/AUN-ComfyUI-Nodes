
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

function parseIds(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    return raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}

function applyCollapseToIds(ids, collapse) {
    for (const nodeId of ids) {
        const target = app.graph.getNodeById(nodeId);
        if (!target) continue;
        const isCollapsed = target.flags && target.flags.collapsed;
        if (collapse && !isCollapsed) target.collapse();
        else if (!collapse && isCollapsed) target.collapse(); // toggle
    }
}

function applyBypassToIds(ids, bypass) {
    for (const nodeId of ids) {
        const target = app.graph.getNodeById(nodeId);
        if (!target) continue;
        target.mode = bypass ? 4 : 0; // 4=bypass,0=active
    }
}

function applyMuteToIds(ids, mute) {
    for (const nodeId of ids) {
        const target = app.graph.getNodeById(nodeId);
        if (!target) continue;
        target.mode = mute ? 2 : 0; // 2=mute,0=active
    }
}

app.registerExtension({
    name: "AUN.NodeStateController.Instant",
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (!nodeData || nodeData.name !== "AUNNodeStateController") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);

            const targetModeWidget = this.widgets.find(w => w.name === "target_mode");
            const nodeIdsWidget = this.widgets.find(w => w.name === "node_ids");
            let groupTitleWidget = this.widgets.find(w => w.name === "group_title");
            const groupExcludeWidget = this.widgets.find(w => w.name === "group_exclude_titles");
            const nodeTitlesWidget = this.widgets.find(w => w.name === "node_titles");
            let nodeTitlePresetWidget = null; // dynamic combo for quick add
            const combinedWidget = this.widgets.find(w => w.name === "combined");
            const useMuteWidget = this.widgets.find(w => w.name === "use_mute");
            const collapseWidget = this.widgets.find(w => w.name === "collapse");
            const activeWidget = this.widgets.find(w => w.name === "active");

            // Customize widget display names
            if (useMuteWidget) {
                useMuteWidget.label = "Mute/Bypass";
            }

            // Dynamic group title combo conversion
            const getGroupTitles = () => (app.graph.groups || []).map(g => g.title);

            // Multiple redraw strategies to ensure complete node refresh
            const forceFullRedraw = () => {
                try {
                    // Strategy 1: Force node size recalculation
                    const newSize = this.computeSize();
                    if (this.size && typeof this.size.length === "number" && this.size.length >= 2) {
                        this.setSize([this.size[0], newSize[1]]);
                    } else {
                        this.setSize(newSize);
                    }

                    // Strategy 2: Mark node as needing redraw
                    this.setDirtyCanvas?.(true, true);

                    // Strategy 2b: Mark node flags as dirty
                    if (this.flags) {
                        this.flags.collapsed = this.flags.collapsed; // Force flag update
                    }

                    // Strategy 3: Mark graph canvas as dirty
                    app.graph.setDirtyCanvas(true, true);

                    // Strategy 4: Force immediate canvas draw
                    if (app.canvas) {
                        app.canvas.draw(true, true);
                    }

                    // Strategy 5: Trigger node serialization update (forces UI refresh)
                    if (this.onPropertyChanged) {
                        this.onPropertyChanged("_force_refresh", Date.now());
                    }

                    // Strategy 6: Force graph change event
                    if (app.graph && app.graph.change) {
                        app.graph.change();
                    }

                    // Strategy 6b: Force LiteGraph node redraw
                    if (this.graph && this.graph.canvas) {
                        this.graph.canvas.dirty_canvas = true;
                        this.graph.canvas.dirty_bgcanvas = true;
                    }

                    // Strategy 7: Multiple delayed redraws to catch different rendering phases
                    [1, 10, 50].forEach(delay => {
                        setTimeout(() => {
                            try {
                                const newSize = this.computeSize();
                                if (this.size && typeof this.size.length === "number" && this.size.length >= 2) {
                                    this.setSize([this.size[0], newSize[1]]);
                                } else {
                                    this.setSize(newSize);
                                }
                                app.graph.setDirtyCanvas(true, true);
                                if (app.canvas) {
                                    app.canvas.draw(true, true);
                                }
                                // Force widget refresh
                                this.widgets?.forEach(w => {
                                    if (w.computeSize) w.computeSize();
                                });
                                // Force graph change event
                                if (app.graph && app.graph.change) {
                                    app.graph.change();
                                }
                            } catch {}
                        }, delay);
                    });
                } catch {}
            };
            const ensureGroupTitleCombo = () => {
                try {
                    if (!groupTitleWidget) return;
                    const titles = getGroupTitles();

                    if (groupTitleWidget.type === "combo") {
                        // Update combo options in place
                        groupTitleWidget.options = groupTitleWidget.options || {};
                        groupTitleWidget.options.values = titles.length ? titles : [""];
                        if (titles.length && !titles.includes(groupTitleWidget.value)) {
                            groupTitleWidget.value = titles[0];
                        }
                    } else if (titles.length > 0) {
                        // Convert string to combo only when we have group titles
                        // Do this conversion only once to minimize recreation
                        let val = (groupTitleWidget.value || "").trim();
                        if (!titles.includes(val)) val = titles[0] || "";

                        const idx = this.widgets.findIndex(w => w === groupTitleWidget);
                        const originalCallback = groupTitleWidget.callback;
                        this.widgets.splice(idx, 1);
                        this.addWidget("combo", "group_title", val, (v) => {
                            groupTitleWidget.value = v;
                            if (originalCallback) originalCallback.call(groupTitleWidget, v);
                            forceFullRedraw();
                        }, { values: titles });
                        groupTitleWidget = this.widgets.pop();
                        this.widgets.splice(idx, 0, groupTitleWidget);

                        forceFullRedraw();
                    }
                } catch (e) {
                    console.warn('[AUNNodeStateController] ensureGroupTitleCombo error:', e);
                }
            };

            // Simple delayed initialization
            setTimeout(() => {
                if (targetModeWidget?.value === "Group Title") {
                    ensureGroupTitleCombo();
                }
            }, 100);

            // Helpers adopted from group / bypass implementations
            const buildGroupsByTitle = () => {
                const map = new Map();
                for (const g of (app.graph.groups || [])) {
                    const gTitle = (g.title || "").toLowerCase();
                    if (!map.has(gTitle)) map.set(gTitle, []);
                    map.get(gTitle).push(g);
                }
                return map;
            };
            const cacheNodeBounds = () => {
                const boundsMap = {};
                const ensureBounds = (node) => {
                    let b = node.getBounding?.();
                    if (b && b[2] === 0 && b[3] === 0) {
                        const ctx = node.graph?.primaryCanvas?.canvas?.getContext?.('2d');
                        if (ctx && node.updateArea) {
                            try { node.updateArea(ctx); } catch {}
                            b = node.getBounding?.();
                        }
                    }
                    return b || [node.pos?.[0] ?? 0, node.pos?.[1] ?? 0, node.size?.[0] ?? 0, node.size?.[1] ?? 0];
                };
                for (const n of app.graph._nodes) boundsMap[String(n.id)] = ensureBounds(n);
                return boundsMap;
            };
            const nodesInsideGroups = (groups) => {
                if (!groups?.length) return [];
                const boundsMap = cacheNodeBounds();
                const result = [];
                for (const node of app.graph._nodes) {
                    let inAny = false;
                    if (node.group && groups.some(g => node.group === g)) inAny = true;
                    else {
                        const b = boundsMap[String(node.id)];
                        const cx = b[0] + b[2] * 0.5, cy = b[1] + b[3] * 0.5;
                        for (const g of groups) {
                            const GB = g._bounding || [g.pos?.[0] ?? 0, g.pos?.[1] ?? 0, g.size?.[0] ?? 0, g.size?.[1] ?? 0];
                            if (cx >= GB[0] && cx < GB[0] + GB[2] && cy >= GB[1] && cy < GB[1] + GB[3]) { inAny = true; break; }
                        }
                    }
                    if (inAny) result.push(node);
                }
                return result;
            };
            const getNodesByTitles = (titles) => {
                if (!titles?.length) return [];
                const wanted = titles.map(t => t.trim().toLowerCase()).filter(Boolean);
                const result = [];
                for (const node of app.graph._nodes) {
                    if (node.title) {
                        const nTitle = node.title.toLowerCase();
                        if (matchesTarget(nTitle, wanted)) {
                            result.push(node);
                        }
                    }
                }
                return result;
            };
            const applyCollapseToNodeArray = (nodes, collapse) => {
                if (!nodes?.length) return;
                for (const node of nodes) {
                    const isCollapsed = !!(node.flags && node.flags.collapsed);
                    if (collapse && !isCollapsed) { node.collapse?.(); }
                    else if (!collapse && isCollapsed) { node.collapse?.(); }
                }
            };
            const applyBypassToNodeArray = (nodes, bypass) => {
                if (!nodes?.length) return;
                for (const node of nodes) node.mode = bypass ? 4 : 0;
            };
            const applyMuteToNodeArray = (nodes, mute) => {
                if (!nodes?.length) return;
                for (const node of nodes) node.mode = mute ? 2 : 0;
            };

            // Hide / show inputs based on mode
            const refreshVisibility = () => {
                const mode = targetModeWidget?.value;
                if (nodeIdsWidget) nodeIdsWidget.hidden = (mode !== "Node IDs");
                if (groupTitleWidget) groupTitleWidget.hidden = (mode !== "Group Title");
                if (groupExcludeWidget) groupExcludeWidget.hidden = (mode !== "Group Title");
                if (nodeTitlesWidget) nodeTitlesWidget.hidden = (mode !== "Node Titles");
                if (nodeTitlePresetWidget) nodeTitlePresetWidget.hidden = (mode !== "Node Titles");
                if (openPickerBtn) openPickerBtn.hidden = (mode !== "Node Titles");
                // Show use_mute for IDs, Group Title, and Node Titles (group mute newly supported)
                if (useMuteWidget) useMuteWidget.hidden = !(mode === "Node IDs" || mode === "Group Title" || mode === "Node Titles");
                // Enforce minimum visual height (~3 lines) for node_titles textarea
                try {
                    if (nodeTitlesWidget && !nodeTitlesWidget.hidden) {
                        // LiteGraph text widgets use widget.inputEl after edit; we can set height via custom property
                        if (nodeTitlesWidget.inputEl) {
                            nodeTitlesWidget.inputEl.style.minHeight = '60px'; // approx 3 lines
                        }
                        // Also adjust widget height property if present
                        if (typeof nodeTitlesWidget.computeSize === 'function') {
                            // Force recompute then add extra padding
                            const sz = nodeTitlesWidget.computeSize(nodeTitlesWidget.width || 200);
                            if (sz && sz[1] < 70) {
                                // Increase internal height metric so box renders larger even before focus
                                nodeTitlesWidget.height = 70;
                            }
                        } else {
                            // fallback rough assignment
                            nodeTitlesWidget.height = Math.max(nodeTitlesWidget.height || 0, 70);
                        }
                    }
                    if (groupExcludeWidget && !groupExcludeWidget.hidden) {
                        if (groupExcludeWidget.inputEl) {
                            groupExcludeWidget.inputEl.style.minHeight = '50px';
                        }
                        if (typeof groupExcludeWidget.computeSize === 'function') {
                            const gsz = groupExcludeWidget.computeSize(groupExcludeWidget.width || 200);
                            if (gsz && gsz[1] < 60) groupExcludeWidget.height = 60;
                        } else {
                            groupExcludeWidget.height = Math.max(groupExcludeWidget.height || 0, 60);
                        }
                    }
                } catch {}
                const combined = !!(combinedWidget?.value);
                if (collapseWidget) collapseWidget.hidden = combined;
                if (activeWidget) activeWidget.hidden = combined;
                forceFullRedraw();
            };
            const forceRefreshVisibility = () => {
                try { refreshVisibility(); } catch {}
            };
            forceRefreshVisibility();

            // Build / refresh title preset combo values
            const getAllNodeTitles = () => Array.from(new Set((app.graph._nodes||[]).map(n=>n.title).filter(t=>t))).sort();
            // status overlay removed
            const ensureTitlePresetCombo = () => {
                try {
                    if (!nodeTitlesWidget) return;
                    if (targetModeWidget?.value !== "Node Titles") {
                        if (nodeTitlePresetWidget) { nodeTitlePresetWidget.hidden = true; }
                        return;
                    }
                    const titles = getAllNodeTitles();

                    if (!nodeTitlePresetWidget) {
                        // Create widget once
                        const cb = (val)=>{
                            if (!val) return;
                            const existing = nodeTitlesWidget.value || "";
                            const lines = existing.split('\n').map(l=>l.trim()).filter(Boolean);
                            if (!lines.includes(val)) lines.push(val);
                            nodeTitlesWidget.value = lines.join('\n');
                            nodeTitlePresetWidget.value = ""; // reset
                            forceFullRedraw();
                        };

                        nodeTitlePresetWidget = this.addWidget("combo", "add_title", "", cb, {
                            values: ["", ...titles],
                            serialize: false,
                            tooltip: "Quick add a node title to the Node Titles list.",
                            placeholder: titles.length ? "Add Title..." : "(No Titled Nodes Yet)"
                        });

                        // Position widget after nodeTitlesWidget
                        const idxTitles = this.widgets.indexOf(nodeTitlesWidget);
                        if (idxTitles >= 0 && idxTitles < this.widgets.length - 1) {
                            const widget = this.widgets.pop();
                            this.widgets.splice(idxTitles + 1, 0, widget);
                        }

                        forceFullRedraw();
                    } else {
                        // Simple update without comparison
                        nodeTitlePresetWidget.options = nodeTitlePresetWidget.options || {};
                        nodeTitlePresetWidget.options.values = ["", ...titles];
                        nodeTitlePresetWidget.options.placeholder = titles.length ? 'Add Title...' : '(No Titled Nodes Yet)';

                        if (nodeTitlePresetWidget.value && !titles.includes(nodeTitlePresetWidget.value)) {
                            nodeTitlePresetWidget.value = "";
                        }
                        nodeTitlePresetWidget.hidden = false;
                    }
                } catch (e) {
                    console.warn('[AUNNodeStateController] ensureTitlePresetCombo error', e);
                }
            };
            // Fallback overlay picker setup (once globally)
            if (!window.__AUNTitlePickerInit) {
                window.__AUNTitlePickerInit = true;
                const style = document.createElement('style');
                style.textContent = `#AUN-title-picker-overlay{position:fixed;z-index:99999;background:#222;border:1px solid #555;padding:10px;max-width:300px;max-height:400px;overflow:auto;font:12px sans-serif;color:#eee;box-shadow:0 4px 18px rgba(0,0,0,0.5);border-radius:4px;}#AUN-title-picker-overlay h3{margin:0 0 6px;font:600 13px sans-serif;}#AUN-title-picker-overlay input{width:100%;margin:0 0 6px;padding:4px;background:#111;color:#eee;border:1px solid #444;border-radius:2px;}#AUN-title-picker-overlay .AUN-title-item{padding:4px 6px;cursor:pointer;border-radius:3px;margin:1px 0;background:#333;}#AUN-title-picker-overlay .AUN-title-item:hover{background:#555;}#AUN-title-picker-overlay .close-btn{float:right;cursor:pointer;color:#aaa;}#AUN-title-picker-overlay .close-btn:hover{color:#fff;}`;
                document.head.appendChild(style);
                window.__AUNOpenTitlePicker = (nodeRef, getAllTitlesFn, nodeTitlesWidgetRef) => {
                    try { const existing = document.getElementById('AUN-title-picker-overlay'); if (existing) existing.remove(); } catch {}
                    const overlay = document.createElement('div'); overlay.id='AUN-title-picker-overlay';

                    // Calculate position relative to the node
                    let overlayLeft = 100, overlayTop = 100; // Default fallback position
                    try {
                        if (nodeRef && app.canvas && app.canvas.canvas) {
                            const canvas = app.canvas.canvas;
                            const canvasRect = canvas.getBoundingClientRect();

                            // Get node position in canvas coordinates
                            const nodeX = nodeRef.pos[0];
                            const nodeY = nodeRef.pos[1];
                            const nodeWidth = nodeRef.size[0];

                            // Convert to screen coordinates
                            const scale = app.canvas.ds.scale || 1;
                            const offsetX = app.canvas.ds.offset[0] || 0;
                            const offsetY = app.canvas.ds.offset[1] || 0;

                            const screenX = canvasRect.left + (nodeX + offsetX) * scale;
                            const screenY = canvasRect.top + (nodeY + offsetY) * scale;

                            // Position overlay to the right of the node, or left if not enough space
                            overlayLeft = screenX + (nodeWidth * scale) + 10;
                            overlayTop = screenY;

                            // Adjust if overlay would go off-screen
                            const overlayWidth = 300; // max-width from CSS
                            const overlayHeight = 400; // max-height from CSS

                            if (overlayLeft + overlayWidth > window.innerWidth) {
                                overlayLeft = screenX - overlayWidth - 10; // Position to the left instead
                            }
                            if (overlayTop + overlayHeight > window.innerHeight) {
                                overlayTop = window.innerHeight - overlayHeight - 20;
                            }
                            if (overlayLeft < 10) overlayLeft = 10;
                            if (overlayTop < 10) overlayTop = 10;
                        }
                    } catch (e) {
                        console.warn('Could not calculate overlay position:', e);
                    }

                    // Apply calculated position
                    overlay.style.left = overlayLeft + 'px';
                    overlay.style.top = overlayTop + 'px';

                    const titles = getAllTitlesFn();
                    overlay.innerHTML = `<h3 style="margin-right:20px;">Node Titles <span class='close-btn'>&times;</span></h3><input type='text' placeholder='Filter...'><div class='list'></div>`;
                    const listDiv = overlay.querySelector('.list');
                    const filterInput = overlay.querySelector('input');
                    const closeBtn = overlay.querySelector('.close-btn');
                    const buildList = () => {
                        listDiv.innerHTML='';
                        const filter = (filterInput.value||'').toLowerCase();
                        const current = (nodeTitlesWidgetRef.value||'').split('\n').map(s=>s.trim()).filter(Boolean);
                        titles.filter(t=>!filter || t.toLowerCase().includes(filter)).forEach(t=>{
                            const div=document.createElement('div');
                            div.className='AUN-title-item';
                            const added = current.includes(t);
                            div.textContent = added?`✔ ${t} (remove)`:t;
                            if (added) { div.style.opacity='0.75'; div.style.background='#284'; }
                            div.onclick=()=>{ 
                                const existingVal = nodeTitlesWidgetRef.value||'';
                                const lines = existingVal.split('\n').map(l=>l.trim()).filter(Boolean);
                                const idx = lines.indexOf(t);
                                if (idx === -1) lines.push(t); else lines.splice(idx,1); // toggle
                                nodeTitlesWidgetRef.value = lines.join('\n');
                                buildList();
                                try { app.graph.setDirtyCanvas(true,true);} catch {}
                            };
                            listDiv.appendChild(div);
                        });
                    };
                    filterInput.oninput = buildList;
                    closeBtn.onclick = ()=> overlay.remove();
                    document.body.appendChild(overlay);
                    buildList();
                };
                window.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ const ov=document.getElementById('AUN-title-picker-overlay'); if(ov) ov.remove(); }});
            }
            // Ensure fallback button present
            let openPickerBtn = this.widgets.find(w => w.__AUNInternal === 'openTitlePicker' || w.name === 'openTitlePicker' || w.name === 'Title Picker');
            if (!openPickerBtn) {
                // Create button with both label and button text as 'Title Picker'.
                openPickerBtn = this.addWidget('button', 'Title Picker', 'Title Picker', () => { window.__AUNOpenTitlePicker(this, getAllNodeTitles, nodeTitlesWidget); }, { tooltip: 'Open node title picker overlay', serialize: false });
                openPickerBtn.__AUNInternal = 'openTitlePicker';
            } else {
                // Normalize legacy instances (blank name or different value) to unified appearance.
                openPickerBtn.__AUNInternal = 'openTitlePicker';
                if (openPickerBtn.name === '' || openPickerBtn.name === 'openTitlePicker') openPickerBtn.name = 'Title Picker';
                if (openPickerBtn.value !== 'Title Picker') openPickerBtn.value = 'Title Picker';
            }
            // Simple retry mechanism
            setTimeout(()=>{
                if(!nodeTitlePresetWidget) {
                    ensureTitlePresetCombo();
                }
            }, 100);
            // Removed rebuild button & context menu entry

            // Simple graph change hooks
            if (!app.__AUNPresetPatched) {
                app.__AUNPresetPatched = true;
                const origAdd = app.graph.add;
                if (origAdd) app.graph.add = function() {
                    const r = origAdd.apply(this, arguments);
                    try { ensureTitlePresetCombo(); } catch{}
                    return r;
                };
                const origRemove = app.graph.remove;
                if (origRemove) app.graph.remove = function() {
                    const r = origRemove.apply(this, arguments);
                    try { ensureTitlePresetCombo(); } catch{}
                    return r;
                };
            }

            if (targetModeWidget) { const prev = targetModeWidget.callback; targetModeWidget.callback = (v)=>{ prev?.call(targetModeWidget, v); forceRefreshVisibility(); if (v === "Group Title") { ensureGroupTitleCombo(); } if (v === "Node Titles") { ensureTitlePresetCombo(); } }; }

            // ID helpers
            const getIds = () => parseIds(nodeIdsWidget?.value || "");

            // Execution handlers
            const executeCombined = (val) => {
                const mode = targetModeWidget?.value;
                const combined = !!val;

                if (mode === "Node IDs") {
                    const ids = getIds();
                    if (!ids.length) return;
                    applyCollapseToIds(ids, combined);
                    const useMute = !!(useMuteWidget?.value);
                    if (useMute) applyMuteToIds(ids, combined); else applyBypassToIds(ids, combined);
                } else if (mode === "Group Title") {
                    const title = (groupTitleWidget?.value || "").trim().toLowerCase(); if (!title) return;
                    const groups = [];
                    for (const g of (app.graph.groups || [])) {
                        const gTitle = (g.title || "").toLowerCase();
                        if (matchesTarget(gTitle, [title])) {
                            groups.push(g);
                        }
                    }
                    let nodes = nodesInsideGroups(groups);
                    // Apply client-side exclusion list
                    if (groupExcludeWidget && groupExcludeWidget.value) {
                        const exc = groupExcludeWidget.value.split(/[,\n;]+/).map(l=>l.trim().toLowerCase()).filter(Boolean);
                        if (exc.length) nodes = nodes.filter(n => {
                            if (!n.title) return true;
                            const nt = n.title.toLowerCase();
                            return !matchesTarget(nt, exc);
                        });
                    }
                    applyCollapseToNodeArray(nodes, combined);
                    const useMute = !!(useMuteWidget?.value);
                    if (useMute) applyMuteToNodeArray(nodes, combined); else applyBypassToNodeArray(nodes, combined);
                } else if (mode === "Node Titles") {
                    const titles = (nodeTitlesWidget?.value || "").split(/[,\n;]+/).map(l=>l.trim()).filter(Boolean);
                    if (!titles.length) return;
                    const nodes = getNodesByTitles(titles);
                    const useMute = !!(useMuteWidget?.value);
                    applyCollapseToNodeArray(nodes, combined);
                    if (useMute) applyMuteToNodeArray(nodes, combined); else applyBypassToNodeArray(nodes, combined);
                }

                // Simple immediate redraw
                forceFullRedraw();
            };
            const executeCollapse = (val) => {
                const mode = targetModeWidget?.value;

                if (mode === "Node IDs") {
                    const ids = getIds();
                    if (ids.length) {
                        applyCollapseToIds(ids, !!val);
                    }
                } else if (mode === "Group Title") {
                    const title = (groupTitleWidget?.value || "").trim().toLowerCase();
                    if (title) {
                        const groups = [];
                        for (const g of (app.graph.groups || [])) {
                            const gTitle = (g.title || "").toLowerCase();
                            if (matchesTarget(gTitle, [title])) {
                                groups.push(g);
                            }
                        }
                        let nodes = nodesInsideGroups(groups);
                        if (groupExcludeWidget && groupExcludeWidget.value) {
                            const exc = groupExcludeWidget.value.split(/[,\n;]+/).map(l=>l.trim().toLowerCase()).filter(Boolean);
                            if (exc.length) nodes = nodes.filter(n => {
                                if (!n.title) return true;
                                const nt = n.title.toLowerCase();
                                return !matchesTarget(nt, exc);
                            });
                        }
                        applyCollapseToNodeArray(nodes, !!val);
                    }
                } else if (mode === "Node Titles") {
                    const titles = (nodeTitlesWidget?.value || "").split(/[,\n;]+/).map(l=>l.trim()).filter(Boolean);
                    if (titles.length) {
                        const nodes = getNodesByTitles(titles);
                        applyCollapseToNodeArray(nodes, !!val);
                    }
                }

                forceFullRedraw();
            };
            const executeActive = (val) => {
                const mode = targetModeWidget?.value;
                const active = !!val;

                if (mode === "Node IDs") {
                    const ids = getIds();
                    if (ids.length) {
                        const useMute = !!(useMuteWidget?.value);
                        if (useMute) applyMuteToIds(ids, !active); else applyBypassToIds(ids, !active);
                    }
                } else if (mode === "Group Title") {
                    const title = (groupTitleWidget?.value || "").trim().toLowerCase();
                    if (title) {
                        const groups = [];
                        for (const g of (app.graph.groups || [])) {
                            const gTitle = (g.title || "").toLowerCase();
                            if (matchesTarget(gTitle, [title])) {
                                groups.push(g);
                            }
                        }
                        let nodes = nodesInsideGroups(groups);
                        if (groupExcludeWidget && groupExcludeWidget.value) {
                            const exc = groupExcludeWidget.value.split(/[,\n;]+/).map(l=>l.trim().toLowerCase()).filter(Boolean);
                            if (exc.length) nodes = nodes.filter(n => {
                                if (!n.title) return true;
                                const nt = n.title.toLowerCase();
                                return !matchesTarget(nt, exc);
                            });
                        }
                        const useMute = !!(useMuteWidget?.value);
                        if (useMute) applyMuteToNodeArray(nodes, !active); else applyBypassToNodeArray(nodes, !active);
                    }
                } else if (mode === "Node Titles") {
                    const titles = (nodeTitlesWidget?.value || "").split(/[,\n;]+/).map(l=>l.trim()).filter(Boolean);
                    if (titles.length) {
                        const nodes = getNodesByTitles(titles);
                        const useMute = !!(useMuteWidget?.value);
                        if (useMute) applyMuteToNodeArray(nodes, !active); else applyBypassToNodeArray(nodes, !active);
                    }
                }

                forceFullRedraw();
            };

            // Simple callback setup without complex protection
            if (combinedWidget) {
                const prev = combinedWidget.callback;
                combinedWidget.callback = (v)=>{
                    prev?.call(combinedWidget, v);
                    executeCombined(v);
                    forceRefreshVisibility();
                };
            }
            if (collapseWidget) {
                const prev = collapseWidget.callback;
                collapseWidget.callback = (v)=>{
                    prev?.call(collapseWidget, v);
                    if (!combinedWidget?.value) { executeCollapse(v); }
                    forceRefreshVisibility();
                };
            }
            if (activeWidget) {
                const prev = activeWidget.callback;
                activeWidget.callback = (v)=>{
                    prev?.call(activeWidget, v);
                    if (!combinedWidget?.value) { executeActive(v); }
                    forceRefreshVisibility();
                };
            }
            if (useMuteWidget) {
                const prev = useMuteWidget.callback;
                useMuteWidget.callback = (v)=>{
                    prev?.call(useMuteWidget, v);
                    if (combinedWidget?.value) executeCombined(combinedWidget.value);
                    else executeActive(activeWidget?.value);
                    forceRefreshVisibility();
                };
            }

            const onPropertyChanged = this.onPropertyChanged;
            this.onPropertyChanged = (name, value) => {
                if (onPropertyChanged) {
                    onPropertyChanged.apply(this, arguments);
                }
                if (name === "target_mode") {
                    ensureGroupTitleCombo();
                    ensureTitlePresetCombo();
                }
            };
        };
    }
});







