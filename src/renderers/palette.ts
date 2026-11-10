// State palettes (STYLE.md §9). Fixed families use named theme tokens; cyclic CA uses an evenly
// spaced hue wheel because its state order is circular. Every palette entry is a #rrggbb string so
// the canvas renderer can pack it into pixels.
import { useMemo } from 'react';
import type { Model } from '../domain/contracts/model';
import { useTheme } from '../app/theme';

/** Token names (without `--`) per state, or null when the palette is generated (cyclic). */
export function stateTokens(model: Pick<Model, 'rule' | 'stateCount'>): string[] | null {
  switch (model.rule.id) {
    case 'life-like/v1':
    case 'elementary/v1':
      return ['sim-dead', 'sim-alive'];
    case 'brians-brain/v1':
      return ['sim-dead', 'sim-firing', 'sim-refractory'];
    case 'forest-fire/v1':
      return ['sim-dead', 'sim-tree', 'sim-fire'];
    case 'spatial-sir/v1':
      return ['sim-susceptible', 'sim-infected', 'sim-recovered'];
    case 'count-table/v1':
      return Array.from({ length: model.stateCount }, (_, s) => (s === 0 ? 'sim-dead' : `sim-cat-${s}`));
    case 'cyclic/v1':
      return null;
  }
}

const hex = (r: number, g: number, b: number) =>
  '#' +
  [r, g, b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
function hsl(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return hex(f(0), f(8), f(4));
}

/** Evenly spaced hues, starting at blue, so neighbors in the cycle are distinguishable. */
export const cyclicPalette = (states: number, dark: boolean) =>
  Array.from({ length: states }, (_, s) => hsl((210 + (360 * s) / states) % 360, dark ? 0.5 : 0.6, dark ? 0.56 : 0.5));

/** Resolved #rrggbb colors for each state of `model`, refreshed when the theme changes. */
export function useStatePalette(model: Pick<Model, 'rule' | 'stateCount'>): string[] {
  const { resolved } = useTheme();
  const tokens = stateTokens(model);
  const key = tokens ? tokens.join(',') : `cyclic:${model.stateCount}`;
  return useMemo(() => {
    if (!tokens) return cyclicPalette(model.stateCount, resolved === 'dark');
    const style = getComputedStyle(document.documentElement);
    return tokens.map((t) => style.getPropertyValue(`--${t}`).trim() || '#808080');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, key]);
}

/** Readable text color on a state swatch. */
export function textOn(bg: string) {
  const m = /^#([0-9a-f]{6})$/i.exec(bg);
  if (!m) return 'var(--text)';
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.55 ? '#17202c' : '#ffffff';
}
