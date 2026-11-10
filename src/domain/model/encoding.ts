// base64-u8 grid encoding. Uses atob/btoa, available in browsers, workers and Node >= 16.
import type { EncodedGrid } from '../contracts/model';

export function encodeGrid(cells: Uint8Array): EncodedGrid {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < cells.length; i += chunk) {
    binary += String.fromCharCode(...cells.subarray(i, i + chunk));
  }
  return { encoding: 'base64-u8', byteLength: cells.length, data: btoa(binary) };
}

/** Decodes without validating ranges; callers validate the result. Throws on malformed base64. */
export function decodeGrid(grid: EncodedGrid): Uint8Array {
  const binary = atob(grid.data);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Exact decoded length of a base64 string, computed before allocating. */
export function base64DecodedLength(data: string): number | null {
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return null;
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return (data.length / 4) * 3 - padding;
}
