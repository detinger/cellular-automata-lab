# ABM Learning Platform design language

This guide describes the visual language of the ABM Learning Platform: typography, color roles, density, surface hierarchy and interaction patterns. It was adapted from the BPMN Studio design language, so both products share one family resemblance; this version is specific to this app and points at its source files.

Tokens and component recipes live in [frontend/src/index.css](frontend/src/index.css). Tailwind is used for layout utilities, and its colors map to the same tokens (see [frontend/tailwind.config.js](frontend/tailwind.config.js)). Paragraphs marked **Guidance** are rules for new work rather than descriptions of existing code.

## 1. Character and principles

The interface is a calm, compact workspace for learning and analytical work. Cool gray backgrounds, bordered white or dark slate surfaces, blue actions, small outline icons, and restrained orange highlights give it its identity.

- **Keep the work prominent.** Diagrams, explanations, forms, and results occupy most of the screen. Navigation and controls provide a quiet frame.
- **Use density with structure.** Compact controls sit in clearly grouped toolbars; larger gaps separate sections. Borders and spacing establish hierarchy before shadows do.
- **Give color a job.** Blue identifies actions and selection; orange highlights special activity or milestones; semantic colors explain outcomes.
- **Explain alongside action.** Place hints, validation, empty states, and next steps near the relevant task.
- **Treat both themes as complete designs.** Surfaces, controls, charts, and embedded workspaces all change together.

To retain this character, avoid oversized marketing headings, decorative gradients, glass effects, heavy shadows on every surface, or pill-shaped primary controls. Pills belong to badges, filters, and step indicators.

## 2. Color tokens

Use semantic CSS variables throughout components. Keep palette values in a central theme layer. A token's role stays the same when its value changes between themes.

### Surfaces and text

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--bg` | `#f4f6f9` | `#0f141b` | Application background |
| `--bg-elevated` | `#ffffff` | `#171e27` | Navigation, cards, controls, dialogs |
| `--bg-subtle` | `#eef1f5` | `#1c2430` | Quiet grouping, table headers, neutral fills |
| `--bg-sunken` | `#e6eaf0` | `#121821` | Recessed tracks, such as progress bars |
| `--bg-hover` | `#e9eef5` | `#233042` | Hovered rows and controls |
| `--border` | `#d6dce5` | `#2b3645` | Default 1px dividers and outlines |
| `--border-strong` | `#b7c1cf` | `#3b4a5e` | Stronger outlines and hover borders |
| `--text` | `#17202c` | `#e6ebf1` | Main content and headings |
| `--text-muted` | `#4b5867` | `#b2bdcb` | Descriptions, labels, inactive navigation |
| `--text-subtle` | `#6b7787` | `#8a97a8` | Metadata, hints, secondary annotations |
| `--text-on-primary` | `#ffffff` | `#0b1520` | Text and icons on solid primary fills |

### Brand and interaction

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--primary` | `#1f5f8b` | `#5aa7d8` | Main actions, links, focus borders, selection |
| `--primary-hover` | `#184d72` | `#7ab9e3` | Solid primary button hover |
| `--primary-soft` | `#e3eef7` | `#16314a` | Selected navigation, controls, explanatory panels |
| `--primary-strong` | `#123b59` | `#a8d3ef` | Emphasized text within primary-tinted content |
| `--accent` | `#d9822b` | `#f0a457` | Special actions, active simulation, achievements |
| `--accent-soft` | `#fbeedd` | `#3a2a17` | Soft accent badges |

Solid accent buttons use dark text `#1d1205` (`--text-on-accent`) in both themes, and hover to `--accent-hover` (`#c47322` / `#f4b673`). Do not assume every saturated background takes white text.

### Semantic feedback

| Role | Foreground light / dark | Soft background light / dark | Use |
| --- | --- | --- | --- |
| Error | `#c0392b` / `#f2776a` | `#fbe9e7` / `#3b1d1a` | Failure, invalid input, destructive action |
| Warning | `#b7791f` / `#e8b45a` | `#fdf3dc` / `#3a2d14` | Caution, incomplete state, potential problem |
| Recommendation | `#2b6cb0` / `#79b2ec` | `#e6f0fa` / `#172a40` | Advice, explanation, suggested improvement |
| Info | `#5a6779` / `#a3afbf` | `#eef1f5` / `#1f2833` | Neutral information and metadata |
| Success | `#2f855a` / `#6fcf97` | `#e3f4ea` / `#16301f` | Completion, correct answers, improved outcomes |

Tokens follow `--error` / `--error-soft`, `--warning` / `--warning-soft`, and the same pattern for the other roles. Informational **callouts** deliberately use the blue recommendation palette; neutral information **badges** use the gray info palette.

Pair semantic colors with readable labels or recognizable icons. Improvement and deterioration depend on the metric: a lower duration may be good, while a lower completion count may be bad.

## 3. Typography

```css
--font-sans: 'Inter', 'IBM Plex Sans', system-ui, -apple-system,
  'Segoe UI', Roboto, sans-serif;
--font-mono: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace,
  SFMono-Regular, Menlo, monospace;
```

Inter (variable) and JetBrains Mono (400, 600) are self-hosted through `@fontsource` packages imported at the top of `index.css`, so typography matches on every machine and nothing is fetched from a third-party CDN.

| Element | Size | Weight | Other properties |
| --- | --- | --- | --- |
| Body | 14px | 400 | Line height 1.5 |
| Home hero heading | 32px | 650 | Tracking `-0.02em` |
| Page heading / h1 | 26px | 650 | Tracking `-0.01em` |
| Section heading / h2 | 20px | 650 | Tracking `-0.01em` |
| Card heading / h3 | 16px | 650 | Tracking `-0.01em` |
| Subheading / h4 | 14px | 650 | Tracking `-0.01em` |
| Dialog heading | 17px | 650 | No bottom margin |
| Hero description | 15px | 400 | Muted text |
| Compact content / table body | 13px | 400 | Also used in side panels |
| Field label / table heading | 12px | 600 | Muted text |
| Hint | 12px | 400 | Subtle text |
| Small metadata / badge | 11px | 400 / 650 | Keep secondary |
| KPI value | 22px | 700 | Tracking `-0.02em`, tabular numerals |
| Eyebrow | 12px | 600 | Uppercase, tracking `0.08em`, primary color |
| Navigation group label | 11px | 400 | Uppercase, tracking `0.06em` |

Headings use line height 1.25 and bottom margin `0.5em`. Paragraphs use bottom margin `0.75em`. Body text remains sentence case; uppercase is reserved for short group labels and eyebrows.

Use monospace for code, identifiers, traces, and keyboard shortcuts. Inline `code` and `kbd` are `0.92em`. Use `font-variant-numeric: tabular-nums` for metrics, numeric table columns, zoom values, and comparisons. Explanatory prose is limited to `76ch`; page-header descriptions to `72ch`.

## 4. Spacing, shape, and elevation

Spacing is currently expressed as literal CSS values, not a named spacing-token system. These recurring values form the practical scale:

| Spacing | Typical use |
| --- | --- |
| 2–4px | Tight internal grouping, badge gaps, adjacent toolbar controls |
| 6px | Icon-to-label gaps, compact list gaps |
| 8px | Standard row gaps, small control padding |
| 10–12px | Form grids, compact surface padding, field separation |
| 14–16px | Panel padding, standard stacks and card-grid gaps |
| 18px | Default card and dialog-body padding |
| 20–24px | Page-header separation, larger layout gaps |
| 28–32px | Desktop page inset and hero spacing |
| 40–48px | Page bottom breathing room |

**Guidance:** in Tailwind markup prefer the matching utilities (`gap-2` = 8px, `gap-4` = 16px, `p-[18px]` only when a recipe calls for it) and keep the proportions above.

| Token / shape | Value | Use |
| --- | --- | --- |
| `--radius-sm` | 6px | Buttons, inputs, tabs' surrounding surfaces, callouts, menus |
| `--radius` | 10px | Cards, KPI tiles, grouped content |
| `--radius-lg` | 14px | Dialogs |
| Small local radius | 4px | Keyboard keys, focus outline shape, chart bar ends |
| Pill radius | 999px | Badges, chips, progress tracks, lesson steps |

| Token | Light | Dark |
| --- | --- | --- |
| `--shadow-sm` | `0 1px 2px rgba(16, 24, 40, 0.06)` | Same as light |
| `--shadow` | `0 2px 8px rgba(16, 24, 40, 0.08), 0 1px 2px rgba(16, 24, 40, 0.06)` | `0 2px 10px rgba(0, 0, 0, 0.45)` |
| `--shadow-lg` | `0 12px 32px rgba(16, 24, 40, 0.16)` | `0 16px 40px rgba(0, 0, 0, 0.6)` |
| `--focus-ring` | `0 0 0 3px rgba(31, 95, 139, 0.35)` | `0 0 0 3px rgba(90, 167, 216, 0.45)` |

Use a 1px border for most surface separation. Cards have the smallest shadow; hovered linked cards and toasts use the medium shadow; menus and dialogs use the large shadow.

## 5. Layout and responsive behavior

### Application shell

- Full-height shell with a left navigation column and a flexible main region.
- Expanded navigation is `232px`; collapsed navigation is `64px`.
- Brand row and workspace toolbar share a `56px` height token. The toolbar can grow when controls wrap.
- Navigation uses an elevated background and a right border. Group headings organize related tasks; utility actions sit at the bottom.
- Navigation links use `8px 10px` padding, a `10px` icon gap, and a `6px` radius. Selection uses primary text on a primary-soft background.
- Standard pages scroll inside the main region, with `28px 32px 48px` padding. Narrow pages are centered with a maximum width of `1080px`.
- Page headers place a title and description on the left and actions on the right, with wrapping and a `16px` gap.

### Page compositions

| Composition | Structure | Used by |
| --- | --- | --- |
| Overview | Header → card collection → supporting cards | Model library (`/`) |
| Card collection | Auto-fill columns, minimum `260px`, `16px` gaps | Model cards |
| Configuration and results | `380px` configuration column + flexible results, `20px` gap | Simulation page (`/models/:id`) |
| Dashboard | KPI grid → chart cards → detailed tables | Results column of the simulation page |

Use `minmax(0, 1fr)`, `min-width: 0`, and `min-height: 0` in flexible workspaces so wide content and nested scrolling do not force the shell to expand.

### Existing breakpoints

| Maximum viewport width | Adaptation |
| --- | --- |
| 1100px | Configuration/results layout becomes one column (configuration first) |
| 900px | Two- and three-column utility grids become one column |
| 820px | Sidebar becomes a horizontal, scrollable icon row; labels, group headings and the collapse control are hidden; page padding becomes `18px 16px 40px` |

The simulation canvas measures its container and shrinks cells (down to 2px) so the grid never forces horizontal scrolling at 390px wide.

## 6. Component recipes

### Buttons and inputs

| Component | Geometry and treatment |
| --- | --- |
| Default button | `34px` high, `0 12px` padding, `6px` gap and radius, 1px border, elevated fill, weight 550 |
| Small button | `28px` high, `0 8px` padding, 13px text |
| Icon button | Square `34px`; small version `28px` |
| Primary button | Primary fill and border, text-on-primary foreground |
| Secondary button | Default bordered button; hover uses bg-hover and border-strong |
| Ghost button | Transparent fill and border; bg-hover on hover |
| Danger button | Error-colored text with the base button treatment |
| Selected button | Primary-soft fill, primary text and border |
| Input / select | `34px` high, `0 10px` padding, 6px radius, elevated fill, 1px border |
| Small input / select | `28px` high, `0 6px` padding, 13px text |
| Textarea | Auto height, `8px 10px` padding, vertical resize |

Disabled buttons use 50% opacity and a not-allowed cursor. Focused inputs use a primary border and the focus-ring shadow. Form fields stack label, control, and hint with a `4px` gap and `12px` separation between fields. Responsive field rows have `10px` gaps and minimum `120px` columns.

**Guidance:** give each task group one visually dominant action. Use labels with concrete verbs, such as “Run simulation,” “Create new simulation,” or “Export CSV.” Accent and danger variants have their own hover styles. The running simulation's Pause button uses the accent variant so the active state reads at a glance.

### Cards, lists, and selection

- Standard card: elevated background, 1px border, 10px radius, 18px padding, smallest shadow.
- Card title row: aligned title and utility action, 8px gap, 12px bottom spacing.
- Linked card hover: primary border and medium shadow. No actual translation or scaling is applied.
- Compact rows: small outline icon, label, optional metadata or trailing action; bg-hover signals interaction.
- Selected rows and options: primary-soft background with a primary outline where appropriate.
- Collection preview cards: `140px` preview region separated by a bottom border, followed by `12px 14px` body padding.

### Tabs, chips, and badges

- Tabs sit above a 1px bottom divider. Each tab has `9px 12px` padding, a `6px` icon gap, and weight 550. Selection uses primary text and a 2px bottom border.
- Tab strips scroll horizontally when needed. Inspector tabs are denser: 13px text and `10px 8px` padding.
- Filter chips use `3px 9px` padding, 12px text, a pill radius, and a 1px border. Selection adds primary-soft fill, primary border, and primary text.
- Status badges are `20px` high with `0 7px` padding, 11px text, weight 650, and a pill radius. Semantic variants use matching foreground/soft pairs and transparent borders.

### Feedback and progress

- Callouts use `10px 12px` padding, a 6px radius, an 18px leading icon, and a `10px` content gap. Semantic borders mix the role color with transparency: 30% for informational callouts and 35% for warning, error, and success.
- Validation rows use a 3px inset severity stripe, a severity icon, a short title, and expandable explanatory content. Explanations connect the problem to its consequence and a possible fix.
- Empty states are centered with `36px 16px` padding, a muted icon, a short heading, and helpful next-step content.
- Progress tracks are `8px` high, pill-shaped, and sunken; fills use primary color.
- Toasts stack at the bottom right, `16px` from the edges, with an `8px` gap. Each has `10px 14px` padding, 6px radius, medium shadow, and a 4px primary or semantic left border. Current widths are `260–420px`.

### Tables and metrics

- Wrap tables in a horizontally scrollable container with a 1px border and 6px radius.
- Body text is 13px; sticky header text is 12px, weight 600, muted, on bg-subtle.
- Cells use `7px 10px` padding and horizontal separators. Hover highlights the entire row.
- Right-align numeric columns and use tabular numerals. Keep units visible and number formatting consistent.
- KPI grids use minimum `170px` columns and `12px` gaps. Tiles use `12px 14px` padding, 10px radius, and a 1px border.
- KPI hierarchy: 12px muted label → 22px bold value → 11px subtle supporting detail. Outcome deltas use semantic colors and weight 650.

### Dialogs and menus

- Dialog backdrop: `rgba(10, 16, 24, 0.5)`, centered layout, `24px` viewport padding.
- Dialog: elevated fill, 1px border, 14px radius, large shadow, width `min(960px, 100%)`, maximum height `calc(100vh - 48px)`.
- Header: `14px 18px` padding and bottom divider. Body: 18px padding and vertical scrolling. Footer: `12px 18px` padding, top divider, actions aligned right with an 8px gap.
- Menus: minimum `230px` width, 6px radius, large shadow, 4px outer padding, 4px below their trigger. Items use `7px 10px` padding.
- Existing layer order: watermark 10, canvas controls 15, canvas overlay 20, menus 30, dialogs 50, toasts 60, skip link 100.

## 7. Icons and brand treatment

Use Lucide outline icons for application actions and navigation. Common sizes are 16px in buttons, 18px in navigation and callouts, and 13–14px in small inline actions. Keep icons aligned to text and usually inherit the surrounding foreground color. Each model has one Lucide icon (set in `configs.ts`) that appears in the navigation, the library card and the page title; do not use emoji as icons.

The navigation brand uses a `30px` primary-colored square with an `8px` radius, containing a `20px` monochrome mark ([BrandMark.tsx](frontend/src/components/BrandMark.tsx)): a rounded grid with four agents, two emphasized, drawn with 2px strokes. The wordmark is 15px and its supporting line is 11px. The favicon ([frontend/public/favicon.svg](frontend/public/favicon.svg)) is the same mark on the light-theme primary.

## 8. Data visualization

Charts have a separate categorical palette. Do not use category colors to imply success, warning, or failure.

| Token | Light | Dark |
| --- | --- | --- |
| `--chart-1` | `#2a78d6` | `#3987e5` |
| `--chart-2` | `#eb6834` | `#d95926` |
| `--chart-3` | `#1baf7a` | `#199e70` |
| `--chart-grid` | `#e1e0d9` | `#2c2c2a` |
| `--chart-axis` | `#c3c2b7` | `#383835` |
| `--chart-muted` | `#898781` | `#898781` |
| `--chart-surface` | `#ffffff` | `#171e27` |

Additional status-scale tokens stay the same in both themes: `--status-good: #0ca30c`, `--status-warning: #fab219`, `--status-serious: #ec835a`, and `--status-critical: #d03b3b`.

- Place charts in bordered cards with a title, concise subtitle including units, and a legend for multiple series.
- Use one value axis per chart, light grid lines, no tick marks, and 11px axis text; categorical labels commonly use 12px.
- Use horizontal bars for named categories. Bars generally have a maximum thickness of 24px; paired bars use 18px. Round exposed ends by 4px.
- Use 2px lines. Area fills use 10% opacity. Step curves represent discrete changes; continuous trends may use smooth lines.
- Tooltips match the card palette with a 6px radius, `8px 10px` padding, 12px text, and medium shadow.
- Present a table view alongside chart-based analysis. Labels, units, legends, and numeric values carry meaning as well as color.
- Resolve chart colors from theme tokens and refresh them when the theme changes (`useTokens` in [theme.tsx](frontend/src/app/theme.tsx)). Keep a series' identity consistent across related views: a model's series use the same `--sim-*` token as the matching agents on the grid, KPI swatches and legend. The exception is a state whose grid color has too little contrast as a line (white sheep), which uses a categorical `--chart-*` color instead.
- The time series card offers a Chart and a Table tab; long runs chart the latest 600 steps and the table the latest 200, and Export CSV has the full history.

## 9. Simulation grid

The grid is the app's workspace surface. It is drawn on a `<canvas>` ([SimulationCanvas.tsx](frontend/src/components/SimulationCanvas.tsx)) inside a quiet frame: `--canvas-bg` fill, 1px border, 6px radius, 12px padding. Cells are square, at most 28px, with hairline `--sim-grid-line` separators once cells are 6px or larger.

Every agent or cell state has one token. Background states paint the whole cell; dot states draw a circle sized as a fraction of the cell (up to four per cell, shrunk when they share).

| Token | Light | Dark | State |
| --- | --- | --- | --- |
| `--canvas-bg` | `#ffffff` | `#141a22` | Frame around the grid |
| `--sim-empty` | `#eef1f5` | `#1b232d` | Empty cell |
| `--sim-grass` / `--sim-grass-regrowing` | `#9fd3a3` / `#d8c7a6` | `#24583a` / `#4a3a28` | Predator-prey grass |
| `--sim-sheep` / `--sim-wolf` | `#ffffff` / `#b8322a` | `#f1f5f9` / `#f06a5e` | Predator-prey animals (sheep get a `--sim-sheep-outline` ring) |
| `--sim-susceptible` / `--sim-infected` / `--sim-recovered` | `#2a78d6` / `#d64545` / `#1baf7a` | `#3987e5` / `#f06a6a` / `#199e70` | SIR states |
| `--sim-tree` / `--sim-fire` / `--sim-burned` | `#3f9a62` / `#eb6834` / `#7a7068` | `#2f7a4f` / `#f07a3c` / `#3a3431` | Forest fire |
| `--sim-adopter` / `--sim-non-adopter` | `#d9822b` / `#b7c1cf` | `#f0a457` / `#3b4a5e` | Diffusion |
| `--sim-type-a` / `--sim-type-b` / `--sim-happy` | `#2a78d6` / `#eb6834` / `#1baf7a` | `#3987e5` / `#d95926` / `#199e70` | Schelling groups (blue and orange, a colorblind-safer pair than blue and red) |
| `--sim-sugar-none` … `--sim-sugar-high` | `#f4f1ea` → `#d9822b` | `#15120f` → `#d98a2b` | Sugarscape sequential ramp (5 steps) |
| `--sim-person` | `#17202c` | `#f8f1e0` | Sugarscape agents |

Rules:

- Domain colors may carry meaning that helps learning (fire is orange, grass is green), but the legend always names every state, and KPIs repeat the swatch next to a text label.
- The same token colors a state everywhere it appears: grid, legend, KPI tile and chart series.
- Add a model by adding tokens here and in both theme blocks of `index.css`, then referencing them by name in `configs.ts`. Never hard-code hex values in components.
- The canvas exposes `role="img"` with a text summary of the current counts.

## 10. Theme, motion, and accessibility

The theme model supports `light`, `dark`, and `system` (the default). The resolved theme is applied as `data-theme="light"` or `data-theme="dark"` on the root element, first by an inline script in `index.html` (no flash of the wrong theme) and then by [theme.tsx](frontend/src/app/theme.tsx). CSS also supplies a system-dark fallback when an explicit light theme is absent. The navigation toggle switches between light and dark and stores the choice under `abm-theme`; while the preference is `system`, OS changes are followed live.

Motion is brief and functional:

| Interaction | Existing timing |
| --- | --- |
| Button background and border | 120ms |
| Linked-card border and shadow | 120ms |
| Toast appearance | 180ms ease-out, fading in from 8px below |
| Progress width | 250ms |
| Loading spinner | 1s linear, repeating |

Implemented foundations: a skip link, labeled navigation with `aria-current`, a dialog that traps focus, closes on Escape or backdrop click and restores focus, tabs with arrow/Home/End navigation, `prefers-reduced-motion` support, accessible names on every icon-only control (including when responsive styles hide labels), and keyboard shortcuts on the simulation page (<kbd>Space</kbd>, <kbd>S</kbd>, <kbd>R</kbd>) that are ignored while typing in a field.

**Guidance:** review text contrast, touch targets and zoom/reflow in both themes for any new page; this guide is a visual specification, not an accessibility certification.

## 11. Content and voice

Use direct, instructional language. Prefer a clear action and an explanation of what happens next. Keep headings short, descriptions informative, and implementation terminology out of ordinary task flows.

- Actions: “Open model,” “Run simulation,” “Create simulation with changes.”
- Empty states: state what is missing, then give a useful next step.
- Errors: identify the problem, explain the consequence, and offer a fix.
- Results: show the value, its unit, and relevant context or uncertainty.
- Learning feedback: make progress and correctness understandable through words and icons as well as color.

Use the vocabulary of agent-based modeling (agents, steps, parameters, emergence) and explain a term the first time a page uses it.

## 12. Checklist and source map

When adding a page or model:

1. Use existing tokens and component classes; add a token (in both theme blocks) before adding a color.
2. Check normal, hover, selected, focused, disabled, empty, loading, success and error states.
3. Check 1440px, the documented breakpoints and 390px wide, in both themes.
4. Run `npm run lint` and `npm run build` in `frontend/`.

| Source | Responsibility |
| --- | --- |
| [frontend/src/index.css](frontend/src/index.css) | Theme tokens, fonts, reset, shell, component recipes, breakpoints, reduced motion |
| [frontend/tailwind.config.js](frontend/tailwind.config.js) | Tailwind colors, fonts and radii mapped to tokens |
| [frontend/src/app/theme.tsx](frontend/src/app/theme.tsx) | Theme resolution, persistence, `useTokens` for canvas and charts |
| [frontend/src/app/AppShell.tsx](frontend/src/app/AppShell.tsx) | Navigation groups, collapse, theme toggle, skip link |
| [frontend/src/components/ui.tsx](frontend/src/components/ui.tsx) | Card, Callout, Badge, EmptyState, Tabs, Dialog |
| [frontend/src/components/SimulationCanvas.tsx](frontend/src/components/SimulationCanvas.tsx) | Grid rendering |
| [frontend/src/components/PopulationChart.tsx](frontend/src/components/PopulationChart.tsx) | Chart styling |
| [frontend/src/models/configs.ts](frontend/src/models/configs.ts) | Per-model icons, token assignments, legends, KPIs |
| [frontend/src/components/BrandMark.tsx](frontend/src/components/BrandMark.tsx) | Product mark |

In short: **a compact analytical workspace with cool neutral surfaces, thin borders, restrained shadows, 14px sans-serif body text, 6px controls, 10px cards, blue primary actions, sparse orange accents, outline icons, readable data displays and complete light and dark themes, with clear grouping and explanation next to every control.**
