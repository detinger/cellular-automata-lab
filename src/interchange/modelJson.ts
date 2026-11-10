// Model JSON import/export (PLAN.md §8.5). Import never executes or fetches anything in the data.
import type { Model, ModelSpec } from '../domain/contracts/model';
import type { ValidationIssue } from '../domain/contracts/validation';
import { hasErrors } from '../domain/contracts/validation';
import { base64DecodedLength } from '../domain/model/encoding';
import { fromSpec, toSpec } from '../domain/model/convert';
import { validateModel } from '../domain/model/validate';
import validateSchema from '../schemas/generated/modelV1.validate.js';

export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;

export type ImportResult = { ok: true; model: Model; spec: ModelSpec; issues: ValidationIssue[] } | { ok: false; issues: ValidationIssue[] };

const schemaIssue = (path: string, message: string, code = 'SCHEMA_INVALID'): ValidationIssue => ({
  code,
  severity: 'error',
  category: 'schema',
  path,
  message,
});

export function importModelJson(text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES)
    return { ok: false, issues: [schemaIssue('', `The file exceeds the ${MAX_IMPORT_BYTES / 1024 / 1024} MiB import limit.`, 'SCHEMA_TOO_LARGE')] };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, issues: [schemaIssue('', `The file is not valid JSON: ${(e as Error).message}`, 'SCHEMA_JSON_PARSE')] };
  }
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (d.format === 'ca-studio-model' && typeof d.schemaVersion === 'number' && d.schemaVersion !== 1)
      return {
        ok: false,
        issues: [
          schemaIssue('/schemaVersion', `Schema version ${d.schemaVersion} is not supported; this build reads version 1.`, 'SCHEMA_VERSION_UNSUPPORTED'),
        ],
      };
  }
  if (!validateSchema(data)) {
    const issues = (validateSchema.errors ?? [])
      .slice(0, 20)
      .map((e) =>
        schemaIssue(
          e.instancePath || '/',
          `${e.instancePath || 'The document'} ${e.message ?? 'is invalid'}${e.keyword === 'additionalProperties' ? ` (“${String(e.params.additionalProperty)}”)` : ''}.`,
        ),
      );
    return { ok: false, issues };
  }
  const spec = data as ModelSpec;
  const decodedLength = base64DecodedLength(spec.initial.data);
  if (decodedLength === null) return { ok: false, issues: [schemaIssue('/initial/data', 'The cell data is not valid base64.')] };
  if (decodedLength !== spec.initial.byteLength || decodedLength !== spec.width * spec.height)
    return {
      ok: false,
      issues: [
        schemaIssue(
          '/initial/byteLength',
          `The cell data decodes to ${decodedLength} bytes, but byteLength is ${spec.initial.byteLength} and ${spec.width} × ${spec.height} needs ${spec.width * spec.height}.`,
          'SCHEMA_BYTE_LENGTH',
        ),
      ],
    };
  const model = fromSpec(spec);
  const issues = validateModel(model);
  // Unsupported-but-valid families still import; structural and semantic errors do not.
  if (hasErrors(issues.filter((i) => i.category !== 'capability'))) return { ok: false, issues };
  return { ok: true, model, spec, issues };
}

export function exportModelJson(model: Model, projectId: string, revisionId: string): string {
  return JSON.stringify(toSpec(model, projectId, revisionId), null, 2) + '\n';
}
