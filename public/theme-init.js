/* global localStorage, window, document */
// Applies the saved or system theme before first paint (external file so the CSP needs no inline script).
(function () {
  try {
    var pref = localStorage.getItem('ca-studio-theme') || 'system';
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch {
    // Storage blocked: the CSS system-theme fallback applies.
  }
})();
