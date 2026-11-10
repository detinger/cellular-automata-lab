# ADR 0001: Finite lattices and synchronous updates

**Status:** accepted

## Decision

All version-1 families run on finite square lattices (3–1024 per axis). Updates are synchronous: every new cell is computed from the old grid only, written into a second buffer, and then the two buffers are swapped. Boundaries are either periodic (torus) or a fixed exterior that supplies a declared state to off-grid samples.

## Indexing

`index = y * width + x`, with (0,0) at the top left and y increasing downward. Cells are `Uint8Array` state IDs.

## Implementation note

The Life-like kernel copies the old grid into a `(w+2)×(h+2)` padded buffer each generation. The border holds either the wrapped edge rows and columns or the exterior state. The inner loop is then branch-free. The engine never updates the grid in place. This is checked by SIM-06, which compares the engine against an independent naive implementation that visits cells in a scrambled order.

## Consequences

- The app does not emulate an infinite universe. Patterns that reach an edge interact with the boundary, and the Capabilities page says so.
- Reflection or clamping boundaries are not offered as aliases.
