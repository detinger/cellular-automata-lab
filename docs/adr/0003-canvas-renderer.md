# ADR 0003: Native Canvas 2D renderer

**Status:** accepted (Phase 1)

States map through a palette lookup into a reusable `ImageData`. That image is blitted to an offscreen canvas and drawn scaled with image smoothing disabled. Grid lines (drawn only at ≥ 6 px per cell), the hover cell and the inspected neighborhood are stroked on top. Pointer-to-cell mapping (`screenToCell`) inverts the same camera transform that drawing uses. Palette colors come from CSS tokens (`--sim-dead`, `--sim-alive`) and are reapplied when the theme changes.

PixiJS and GPU backends are deferred until profiling shows a need (PLAN.md §4.6).
