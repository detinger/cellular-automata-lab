# Instructor guide

Cellular Automata Lab runs entirely in the student's browser: no accounts, no server, no grading backend. Students submit files they export.

## Course path (about 6 × 90 minutes)

| Session | Lessons | Challenges | In class |
|---|---|---|---|
| 1. Foundations | L01 Cells, states and generations; L02 Local rules; Conway's Game of Life | CA-01 Predict one Life generation | Students predict on paper, then check with the Inspect tool. |
| 2. Neighborhoods and boundaries | L03 Neighborhoods; L04 Boundaries | CA-04 Diagnose a boundary difference | Same glider, two boundaries: use **Compare** side by side. |
| 3. Deterministic dynamics | L05 Patterns; L06 Elementary rules; L11 Excitable and cyclic media | CA-02 Still life, CA-03 Oscillator, CA-05 Encode a rule | Groups find different still lifes; the checker accepts any valid one. |
| 4. Modeling choices | L07 Rule 184 traffic; L09 Count rules | CA-07 Traffic density, CA-09 Repair a rule table | Discuss conservation and why overlapping clauses are rejected. |
| 5. Stochastic systems | L08 Spatial SIR; L10 Forest fire | CA-06 Reproduce a stochastic run | Two students with the same seed get identical runs; different seeds differ. |
| 6. Experimentation | L12 Designing an experiment | CA-08 Compare spread assumptions, CA-10 Investigation | Students present one figure and one limitation. |

## What students submit

For CA-10 (and any investigation), ask for:

1. The **report** (`…-report.md`) from the experiment page — it lists assumptions, seeds, metric definition, results with uncertainty, limitations and the student's interpretation.
2. The **metrics CSV** and the **experiment package** (`.ca-experiment.json`) — so you can check the report against the data.
3. The **model file** (`.ca.json`) — opens in any copy of the app.
4. Optionally the filled **investigation template** (download on the CA-10 page).

To verify a submission, import the `.ca.json`, check the model hash in the report, and recompute a configuration mean from the CSV.

## Rubric for CA-10 (also shown in the app)

| Criterion | Strong | Developing |
|---|---|---|
| Question | Specific and answerable with the model | Vague or outside the model's scope |
| Hypothesis | Stated before results, with a reason | Missing or written after the fact |
| Design | One assumption varied; replication fits the model (≥ 10 for random models, 1 for deterministic) | Several changes at once; too few runs |
| Results | Uncertainty reported; censored or unavailable runs handled honestly | Means only; censored runs ignored or averaged |
| Limitations | Boundary, finite size, units and untested assumptions discussed | None or generic |
| Conclusion | Claims match the evidence | Over-claims ("proves", "always") |

Challenge checks are formative: they run locally and can be bypassed by a determined student. Written reflections are never graded automatically.

## Things to watch for

- Treating generations of one run as replications (L12 addresses this).
- Calling a quiet forest "extinct" when lightning can restart fires (L10).
- Comparing raw counts across lattice sizes (the Compare page switches to fractions and disables cell-by-cell distance).
- Changing the transition seed and expecting the same run.

## Technical notes

- Works offline after one visit; data stays in that browser. Remind students to export before clearing browser data or switching computers.
- Supported: current Chrome/Edge and Safari (WebKit). Firefox is expected to work but was not verified in this release.
