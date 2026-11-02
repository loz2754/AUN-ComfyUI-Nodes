// Frontend shim for ComfyUI's workflow-tab hover popover
// (ComfyUI_frontend `src/components/topbar/WorkflowTabPopover.vue`).
//
// That popover caps its card at 250px and renders the filename with Tailwind's
// `truncate` (nowrap + ellipsis), so long workflow names are cut off in the one
// place meant to reveal them. Let the name wrap and allow a wider card instead.
//
// Upstream fix (for reference): swap `block truncate` for
// `block break-words whitespace-normal` on the filename span and raise the
// card's `max-w-62.5`. This shim is safe to keep once upstream lands — the
// `truncate` rule just stops matching.

import { injectStyles } from "./index.js";

injectStyles(
  "__aun_workflowTabTooltipStyles",
  `
  .workflow-popover-fade,
  .workflow-popover-fade > div {
    max-width: min(90vw, 32rem);
  }

  .workflow-popover-fade .truncate {
    white-space: normal;
    overflow-wrap: anywhere;
    text-overflow: clip;
  }
  `
);
