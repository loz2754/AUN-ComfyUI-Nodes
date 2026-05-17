# Best Practices: Adding Compact Mode to AUN Nodes

> Lessons learned from applying compact mode to multiple nodes.
> Read this before adding compact mode to a new node.

## What Is Compact Mode?

Compact mode lets a node toggle between a "full" state (all controls visible) and a "compact" state (only essential widgets visible). Users toggle via double-click or context menu.

## Core Pattern

```javascript
const PROP_KEY = "_AUN_compactMode";
const ALL_WIDGETS = ["widget_a", "widget_b", "widget_c"];
const COMPACT_VISIBLE = new Set(["widget_a"]); // widgets that stay visible in compact mode

function isCompact(node) {
  return !!node?.properties?.[PROP_KEY];
}

function setCompact(node, value) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[PROP_KEY] = !!value;
}

function getWidget(node, name) {
  return node.widgets?.find((w) => w.name === name);
}
```

## Rule 1: Hide Widgets Properly

Hidden widgets must return zero height from `computeSize` AND have their DOM elements hidden. Use a single helper:

```javascript
function ensureHiddenAware(widget) {
  if (!widget || widget.__AUN_hiddenAware) return;
  const origComputeSize =
    typeof widget.computeSize === "function" ? widget.computeSize : null;
  widget.__AUN_hiddenAware = true;

  widget.computeSize = function (width) {
    if (this.hidden) return [width, 0];
    return origComputeSize
      ? origComputeSize.apply(this, arguments)
      : [width, this.comfyHeight ?? 20];
  };
}

function applyWidgetHidden(widget, hidden) {
  if (!widget) return;
  ensureHiddenAware(widget);
  widget.hidden = !!hidden;
  widget.__AUN_visible = !hidden;

  // LiteGraph flags
  if (widget.flags) {
    widget.flags.hidden = !!hidden;
    widget.flags.collapsed = !!hidden;
  }
  if (widget.options) {
    widget.options.noDraw = !!hidden;
  }

  // DOM element hiding (for standard widgets with inputEl)
  if (widget?.inputEl?.style) {
    widget.inputEl.style.display = hidden ? "none" : "";
  }

  // Container hiding (for addDOMWidget widgets)
  if (widget?.__aunContainer?.style) {
    widget.__aunContainer.style.display = hidden ? "none" : "";
  }
}
```

### Common pitfall: DOM widgets don't hide automatically
When using `addDOMWidget`, the container element is a sibling of the widget's inputEl. You need to store a reference (`widget.__aunContainer = container`) and hide it explicitly.

## Rule 2: Auto-Height — Mutate `size[1]` Directly, Never Call `setSize`

```javascript
function computeNodeHeight(node) {
  let total = 0;
  const w = node.size?.[0] ?? 300;
  for (const widget of node.widgets || []) {
    if (widget.hidden) continue;
    const cs = widget.computeSize?.(w);
    if (Array.isArray(cs)) {
      total += cs[1] ?? 0;
    } else if (Number.isFinite(cs)) {
      total += cs;
    }
  }
  return total;
}

function updateAutoHeight(node) {
  if (!node) return;
  const h = computeNodeHeight(node);
  if (!Number.isFinite(h)) return;
  node.__AUN_internalResize = true;
  // ONLY mutate size[1] — never call setSize([w, h])
  // setSize triggers LiteGraph to recalculate width from computeSize,
  // which overrides the user's saved/manual width on F5 reload.
  if (!Array.isArray(node.size)) node.size = [node.size?.[0] ?? 300, h];
  node.size[1] = h;
  node.__AUN_internalResize = false;
}
```

### Why not `setSize`?
Calling `setSize([w, h])` causes LiteGraph to call `node.computeSize()` which returns the computed minimum width, overwriting any user-set width. This is the #1 cause of "node goes wider on F5" bugs.

## Rule 3: Width — Only Enforce Minimum, Never Force Width Changes

```javascript
function computeNodeWidth(node) {
  let maxW = 0;
  for (const widget of node.widgets || []) {
    if (widget.hidden) continue;
    const cs = widget.computeSize?.(0);
    if (Array.isArray(cs) && Number.isFinite(cs[0])) {
      maxW = Math.max(maxW, cs[0]);
    }
  }
  return Math.max(maxW, 200); // minimum usable width for title text
}

function applyCompact(node) {
  const compact = isCompact(node);
  for (const name of ALL_WIDGETS) {
    const widget = getWidget(node, name);
    if (!widget) continue;
    applyWidgetHidden(widget, compact && !COMPACT_VISIBLE.has(name));
  }

  // Only widen if current width is narrower than minimum — never shrink or force
  const minW = computeNodeWidth(node);
  if (node.size && Number.isFinite(node.size[0]) && node.size[0] < minW) {
    node.size[0] = minW;
  }
  updateAutoHeight(node);

  // Delayed update for settling DOM state
  setTimeout(() => {
    const minW2 = computeNodeWidth(node);
    if (node.size && Number.isFinite(node.size[0]) && node.size[0] < minW2) {
      node.size[0] = minW2;
    }
    updateAutoHeight(node);
    node.widgets_dirty = true;
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
  }, 50);
}
```

### Why not force width?
On F5 reload, `loadedGraphNode` → `setupCompact` → `applyCompact` runs. If you unconditionally set width to the computed minimum, it overwrites the user's saved width from the workflow JSON.

## Rule 4: `computeSize` Wrapper — Height Padding Only

```javascript
if (typeof node.computeSize === "function" && !node.__aunSizePaddingHooked) {
  const origComputeSize = node.computeSize;
  node.__aunSizePaddingHooked = true;
  node.computeSize = function (...args) {
    const result = origComputeSize.apply(this, args);
    if (Array.isArray(result) && result.length >= 2) {
      return [result[0], result[1] + 30]; // height padding only
    }
    return result;
  };
}
```

### Anti-patterns to avoid:
- **NEVER** use `Object.defineProperty` to proxy `node.size` — it corrupts LiteGraph's internal cached references, freezing the title bar width during resize drags.
- **NEVER** wrap `drawBackground` — it interferes with rendering during resize operations.
- **NEVER** modify width in the `computeSize` wrapper — it's called on every frame and during F5 reload.

## Rule 5: `onExecuted` — Preserve User Width

```javascript
nodeType.prototype.onExecuted = function (message) {
  // ... update widget values ...

  requestAnimationFrame(() => {
    this.widgets_dirty = true;
    if (typeof this.computeSize === "function") {
      const [cw, ch] = this.computeSize();
      const curW = this.size?.[0] ?? cw;
      // Only grow if computed width is larger — never shrink
      this.setSize([Math.max(curW, cw), ch]);
    }
    this.setDirtyCanvas?.(true, true);
  });
};
```

## Rule 6: Min Height Enforcement

```javascript
const getMinH = (n) => (isCompact(n) ? 150 : 420);

const enforceMinHeight = (n) => {
  const minH = getMinH(n);
  if (n.size && n.size[1] < minH) {
    n.size[1] = minH;
  }
};

// In onResize
node.onResize = function () {
  enforceMinHeight(this);
  if (origResize) origResize.apply(this, arguments);
  enforceMinHeight(this);
  this.setDirtyCanvas?.(true, true);
};

// In setSize guard
node.setSize = function (size) {
  const minH = getMinH(this);
  if (Array.isArray(size) && size[1] < minH) {
    size = [size[0], minH];
  }
  return origSetSize.call(this, size);
};
```

## Rule 7: Toggle Guards

```javascript
function toggleCompact(node, { force = false } = {}) {
  if (node.__AUN_toggleInProgress) return;
  const active = document.activeElement;
  if (
    !force &&
    active &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.classList?.contains("litegraph") ||
      active.id?.includes("widget"))
  )
    return;
  const canvas = app.canvas;
  if (!force && (canvas?.interacting_widget || canvas?.active_widget)) return;

  node.__AUN_toggleInProgress = true;
  setCompact(node, !isCompact(node));
  applyCompact(node);
  setTimeout(() => {
    node.__AUN_toggleInProgress = false;
  }, 50);
}
```

## Rule 8: Double-Click Handler

```javascript
const origDbl = node.onDblClick;
node.onDblClick = function (...args) {
  origDbl?.apply(this, args);
  const pos = args[0];
  // Don't toggle if click is in title bar area (y < 0 in node coords)
  if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0)
    return;
  toggleCompact(this);
};
```

## Rule 9: Context Menu

```javascript
const origMenu = node.getExtraMenuOptions;
node.getExtraMenuOptions = function (...args) {
  origMenu?.apply(this, args);
  const options = args[1];
  if (!options) return;
  const compact = isCompact(this);
  options.push({
    content: compact ? "AUN: Show all controls" : "AUN: Compact mode",
    callback: () => {
      setCompact(this, !isCompact(this));
      applyCompact(this);
    },
  });
};
```

## Rule 10: Initialization Points

Call `setupCompact` in THREE places:

```javascript
// 1. onNodeCreated — for newly dragged nodes
nodeType.prototype.onNodeCreated = function () {
  onNodeCreated?.apply(this, arguments);
  // ... widget setup ...
  setupCompact(this);
};

// 2. nodeCreated — fallback for some registration paths
nodeCreated(node) {
  if (node.comfyClass !== "YourNodeClass") return;
  setupCompact(node);
},

// 3. loadedGraphNode — for nodes loaded from workflow JSON
loadedGraphNode(node) {
  if (node.comfyClass !== "YourNodeClass" && node.type !== "YourNodeClass")
    return;
  setupCompact(node);
  applyCompact(node); // re-apply visibility state
},
```

## Rule 11: Guard Against Double Initialization

```javascript
function setupCompact(node) {
  if (node.__AUN_compactInit) return; // prevents double-setup
  node.__AUN_compactInit = true;
  // ... rest of setup ...
}
```

## Rule 12: Multiline Textarea Widgets

If a widget is a multiline textarea (`type === "customtext"` or `options.multiline === true`), ensure it has a minimum height:

```javascript
// In ensureHiddenAware
const isMultiline =
  widget.type === "customtext" || widget.options?.multiline === true;

widget.computeSize = function (width) {
  if (this.hidden) return [width, 0];
  let [w, h] = origComputeSize
    ? origComputeSize.apply(this, arguments)
    : [width, this.comfyHeight ?? 20];
  if (isMultiline) {
    h = Math.max(h, 100);
    this.comfyHeight = h;
  }
  return [w, h];
};

if (isMultiline && widget.inputEl) {
  widget.inputEl.style.minHeight = "80px";
}
```

## Checklist for a New Compact Node

- [ ] Define `ALL_WIDGETS` and `COMPACT_VISIBLE` sets
- [ ] Implement `ensureHiddenAware` and `applyWidgetHidden`
- [ ] Implement `computeNodeHeight` and `updateAutoHeight` (mutate `size[1]` only)
- [ ] Implement `computeNodeWidth` (minimum enforcement only)
- [ ] Implement `applyCompact` with delayed re-check via `setTimeout`
- [ ] Wrap `computeSize` for height padding only (no width changes)
- [ ] Guard `onExecuted` to preserve user width
- [ ] Add min height enforcement in `onResize` and `setSize`
- [ ] Add toggle guards (active element, canvas state)
- [ ] Wire `onDblClick`, context menu, and three init points
- [ ] Test: manual resize drag, F5 reload, workflow load, workflow run, compact toggle during text input

## Common Bugs and Their Root Causes

| Symptom | Root Cause | Fix |
|---|---|---|
| Node goes wider on F5 | `setSize` or `computeSize` forces computed width | Mutate `size[1]` directly; never force width |
| Title bar freezes during drag | `Object.defineProperty` on `node.size` | Remove proxy; mutate `size` array directly |
| Rendering glitches on resize | `drawBackground` wrapper | Remove wrapper |
| Widgets not hiding | Missing `ensureHiddenAware` or DOM container not hidden | Use `applyWidgetHidden` helper |
| Node too small after toggle | No min height enforcement | Add `enforceMinHeight` in `onResize`/`setSize` |
| Double-click doesn't work | Title bar click not filtered | Check `pos[1] < 0` |
| Compact state lost on reload | Not calling `applyCompact` in `loadedGraphNode` | Add `applyCompact(node)` there |
| Double initialization | Missing `__AUN_compactInit` guard | Add guard at top of `setupCompact` |
