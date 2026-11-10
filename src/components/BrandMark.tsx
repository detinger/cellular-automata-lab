/** Product mark: a blinker in its horizontal phase with the vertical phase as a ghost. */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="1.5" y="7.5" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="7.5" y="7.5" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="13.5" y="7.5" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="7.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeOpacity=".55" />
      <rect x="7.5" y="13.5" width="5" height="5" rx="1" stroke="currentColor" strokeOpacity=".55" />
    </svg>
  );
}
