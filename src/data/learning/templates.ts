// Student investigation template. Plain Markdown.
import { challengeById } from './challenges';

export function investigationTemplate(): string {
  const rubric = challengeById('CA-10')!.reflection.rubric;
  return `# Modeling investigation

Name: ____________________   Date: ____________

## 1. Question
What do you want to find out? Make it specific and answerable with the model.

## 2. Hypothesis
What do you expect, and why? Write this before running anything.

## 3. Model and assumptions
- Rule family and parameters:
- Lattice size and boundary:
- Neighborhood:
- Initial condition (fixed grid or regenerated per run; probabilities):
- What one generation represents (if anything):

## 4. Design
- Factor(s) and values:
- What stays fixed:
- Replicates per configuration and why that many:
- Master seed:
- Horizon, stop condition, analysis window (justify any burn-in):
- Response measure and how each run is summarized:

## 5. Results
Paste the results table from the exported report. Include the number of runs, mean, spread and interval for each configuration, and any censored or unavailable runs.

## 6. Interpretation
What do the results show? How certain are you? Did the effect persist across seeds?

## 7. Limitations
Boundary and finite-size effects, assumptions you did not vary, small samples, stopping policies, units.

## 8. Evidence attached
- [ ] Report (.md) exported from the experiment page
- [ ] Metrics CSV
- [ ] Experiment package (.ca-experiment.json)
- [ ] Model file (.ca.json)

---

## Rubric (for your instructor)
${rubric.map((r) => `- [ ] ${r}`).join('\n')}
`;
}
