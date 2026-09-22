# Collapse Connections × Use Everywhere (UE) — quirks & notes

AUN's Collapse Connections system is compatible with
[cg-use-everywhere](https://github.com/chrisgoringe/cg-use-everywhere)
broadcasting, but the interaction has sharp edges. This page documents them.

## Broadcast works while collapsed

Collapsed slots keep UE-friendly data: the stored `slot.label` is falsy
(`""`), so UE's `label || name` matching resolves the real slot names at
queue time. The blank look is applied at draw time only (canvas) or via
stylesheet (VueNodes). Collapsing, expanding, or toggling via the
controller / All Graph button never breaks an active broadcast — no need to
expand nodes before queueing.

## Duplicated output types trigger UE's name-matching rule

Nodes like `AUNInputsWan22Basic` broadcast several outputs of the same type
(`MODEL` ×2, `STRING` ×2, `FLOAT` ×4, `INT` ×4). When a type is duplicated,
UE applies its repeated-type rule (default: exact name match of
source output name vs target input name). Consequences:

- Renaming inputs/outputs to route a broadcast must satisfy the rule
  (exact match by default; match-start / match-end / regex are set in the
  UE node's restrictions).
- A mismatch fails silently: no dotted UE links on hover and no data at
  runtime. If a broadcast "does nothing", check names first.

## `sampler` / `scheduler` (`*` outputs) never UE-broadcast — by design

The sampler/scheduler outputs are `AnyType("*")`, and the KSampler / MoE
nodes take them as COMBO widgets. UE exact-matches types, so a `*` source
never routes to a COMBO target, and UE skips widget-supplied inputs unless
marked connectable. This is deliberate: those outputs are meant for normal
links (e.g. into KSampler converted inputs and text/display nodes), where
`*` connects to everything.

To broadcast them wirelessly anyway, use UE's Combo Clone helper:

1. Convert the receiver's combo widgets to inputs, link one Combo Clone
   per combo (this copies options, value snapshot, and **name**), then
   disconnect and connect the clones into an `Anything Everywhere` node.
2. Clone **from the receiver's widgets** (`sampler_name`, `scheduler`) so
   the copied names match exactly under UE's default rule. Cloning from
   the Inputs node yields `sampler`, which does not exactly match
   `sampler_name`.
3. Mark the receiver combos UE-connectable (right-click node →
   UE Connectable Inputs).
4. Note the clone is a snapshot control: set the value **on the clone**.
   Changing the source widget later does not update it.

## Cosmetic: UE overlay geometry ignores the converged anchor

UE draws its own link dots/hover lines from uncollapsed slot positions, so
on a collapsed node the colored dots may sit where the outputs used to be
rather than on the single converged dot. Display-only; routing and values
are unaffected.

## Compact mode is not covered

The `""` treatment applies to Collapse Connections only. Compact-mode
label blanking still uses a truthy placeholder and will break UE name
matching the old way. Don't combine Compact with UE broadcast on the same
node.

## After updates: hard-refresh the browser

Collapse/UE behavior lives in cached web assets. Restarting ComfyUI alone
does not bust the browser cache — Ctrl+F5 (or clear site data) after
updating, otherwise you may be testing stale JS.
