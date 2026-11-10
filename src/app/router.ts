// Hash routing: works on any static host (Netlify, Railway, file preview) without server rewrites.
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'library' }
  | { name: 'project'; id: string }
  | { name: 'capabilities' }
  | { name: 'experiments' }
  | { name: 'experiment'; id: string }
  | { name: 'learn' }
  | { name: 'lesson'; id: string }
  | { name: 'challenge'; id: string }
  | { name: 'compare'; a: string; b: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  const m = /^\/project\/([\w-]+)$/.exec(path);
  if (m) return { name: 'project', id: m[1] };
  if (path === '/capabilities') return { name: 'capabilities' };
  if (path === '/experiments') return { name: 'experiments' };
  const e = /^\/experiment\/([\w-]+)$/.exec(path);
  if (e) return { name: 'experiment', id: e[1] };
  if (path === '/learn') return { name: 'learn' };
  const l = /^\/lesson\/([\w-]+)$/.exec(path);
  if (l) return { name: 'lesson', id: l[1] };
  const c = /^\/challenge\/([\w-]+)$/.exec(path);
  if (c) return { name: 'challenge', id: c[1] };
  const cmp = /^\/compare\/([\w-]+)\/([\w-]+)$/.exec(path);
  if (cmp) return { name: 'compare', a: cmp[1], b: cmp[2] };
  return { name: 'library' };
}

export const navigate = (path: string) => {
  window.location.hash = path;
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
