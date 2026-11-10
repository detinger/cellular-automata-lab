// Canonical model hash (PLAN.md §8.2): semantics only — names, colors and viewport are excluded.
import type { Model, RuleSpec } from '../contracts/model';
import { encodeGrid } from './encoding';

function normalizeRule(rule: RuleSpec): RuleSpec {
  if (rule.id === 'life-like/v1') {
    const sort = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
    return { id: rule.id, birth: sort(rule.birth), survive: sort(rule.survive) };
  }
  return rule;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function canonicalModelString(model: Model): string {
  return canonicalJson({
    hashVersion: 'ca-studio-model-hash/v1',
    width: model.width,
    height: model.height,
    stateCount: model.stateCount,
    rule: normalizeRule(model.rule),
    boundary: model.boundary,
    schedule: model.schedule,
    initial: encodeGrid(model.initial).data,
  });
}

export async function modelHash(model: Model): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalModelString(model));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
