/**
 * Centralized event bus for AUN web extensions.
 * Replaces individual polling loops with a single rAF watcher
 * that dispatches events to registered listeners.
 */

const EVENTS = {
  NODE_TITLE_CHANGED: "aun:nodeTitleChanged",
  GRAPH_CHANGED: "aun:graphChanged",
};

// ── Simple pub/sub ────────────────────────────────────────────

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/**
 * Subscribe to an event. Returns an unsubscribe function.
 */
export function on(event, callback) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(callback);
  return () => off(event, callback);
}

/**
 * Unsubscribe from an event.
 */
export function off(event, callback) {
  const set = listeners.get(event);
  if (set) set.delete(callback);
}

function emit(event, detail) {
  const set = listeners.get(event);
  if (!set) return;
  for (const cb of set) {
    try {
      cb(detail);
    } catch (e) {
      console.warn(`[AUN EventBus] listener error on "${event}":`, e);
    }
  }
}

// ── Single rAF watcher for node title changes ─────────────────

/** @type {Map<number, string>} */
const lastTitles = new Map();
let watcherRunning = false;

function startWatcher(appRef) {
  if (watcherRunning) return;
  watcherRunning = true;

  const tick = () => {
    let changed = false;
    const nodes = appRef?.graph?._nodes;

    if (nodes) {
      for (const node of nodes) {
        const currentTitle = String(node.title ?? "");
        const prevTitle = lastTitles.get(node.id);

        if (prevTitle === undefined) {
          // First pass — seed the map, don't emit
          lastTitles.set(node.id, currentTitle);
        } else if (currentTitle !== prevTitle) {
          lastTitles.set(node.id, currentTitle);
          changed = true;
          emit(EVENTS.NODE_TITLE_CHANGED, { nodeId: node.id, title: currentTitle });
        }
      }
    }

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

// Start the watcher once when first imported (lazy start on next tick)
let _appRef = null;
export function initEventBus(appRef) {
  if (_appRef) return; // already initialized
  _appRef = appRef;
  startWatcher(appRef);
}

// ── Public API ────────────────────────────────────────────────

export const EventBus = {
  EVENTS,
  on,
  off,
};
