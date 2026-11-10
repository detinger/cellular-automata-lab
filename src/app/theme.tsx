import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Preference = 'light' | 'dark' | 'system';
interface ThemeValue {
  preference: Preference;
  resolved: 'light' | 'dark';
  toggle(): void;
}

const KEY = 'ca-studio-theme';
const ThemeContext = createContext<ThemeValue | null>(null);

const readPref = (): Preference => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};
const systemDark = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Preference>(readPref);
  const [sysDark, setSysDark] = useState(systemDark);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSysDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const resolved = preference === 'system' ? (sysDark ? 'dark' : 'light') : preference;
  // Applied during render (idempotent) so canvas token reads in the same render see the new theme.
  if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') !== resolved) {
    document.documentElement.setAttribute('data-theme', resolved);
  }
  const toggle = useCallback(() => {
    const next = resolved === 'dark' ? 'light' : 'dark';
    setPreference(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable: theme still applies for this session */
    }
  }, [resolved]);
  const value = useMemo(() => ({ preference, resolved, toggle }), [preference, resolved, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}

/** Resolves CSS custom properties for canvas drawing; refreshes when the theme changes. */
export function useTokens<T extends string>(names: readonly T[]): Record<T, string> {
  const { resolved } = useTheme();
  const key = names.join(',');
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((n) => [n, style.getPropertyValue(`--${n}`).trim()])) as Record<T, string>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, key]);
}
