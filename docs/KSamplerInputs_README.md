# KSamplerInputs — KSampler Inputs

Purpose: Set common KSampler parameters (sampler, scheduler, CFG, steps) in one place and pass them downstream.

Category: `AUN Nodes/KSampler`

## Inputs

### Required

- `sampler` (choice): Sampler algorithm.
- `scheduler` (choice): Noise schedule (includes AUN extras like AYS and GITS variants).
- `cfg` (FLOAT): Classifier-Free Guidance value.
- `steps` (INT): Number of sampling steps.

## Outputs

- `ksampler` (Any): Selected sampler value.
- `scheduler` (Any): Selected scheduler value.
- `cfg` (FLOAT)
- `steps` (INT)

## Notes

- Outputs for `sampler`/`scheduler` are typed as “Any” so they can be routed flexibly.
