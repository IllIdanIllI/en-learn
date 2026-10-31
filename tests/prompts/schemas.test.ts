import { readFileSync } from 'node:fs';
import { Validator } from '@cfworker/json-schema';
import { describe, expect, test } from 'vitest';
import { bundledPrompts } from '@/core/llm/bundledPrompts';
import type { LlmKind } from '@/core/domain';
import type { DisputeBatchReply, GeneratedSession, GradeResult, RuleChatReply, RuleDraft, ValidationResult } from '@/core/llm/types';

const kinds: LlmKind[] = ['rule_draft', 'rule_chat', 'generate_session', 'validate_session', 'grade', 'dispute'];
const validator = (schema: object) => new Validator(schema, '2019-09', false);
const fixture = (kind: string, which: 'valid' | 'invalid'): unknown =>
  JSON.parse(readFileSync(`tests/fixtures/llm/${kind}.${which}.json`, 'utf8'));

// Compile-time link between the exported output types and the fixtures' shapes.
export const typedFixtures = [
  fixture('generate_session', 'valid') as GeneratedSession,
  fixture('validate_session', 'valid') as ValidationResult,
  fixture('grade', 'valid') as GradeResult,
  fixture('rule_draft', 'valid') as RuleDraft,
  fixture('rule_chat', 'valid') as RuleChatReply,
  fixture('dispute', 'valid') as DisputeBatchReply,
];

function strictObjects(node: unknown, path: string, problems: string[]): void {
  if (Array.isArray(node)) return node.forEach((n, i) => strictObjects(n, `${path}[${i}]`, problems));
  if (typeof node !== 'object' || node === null) return;
  const s = node as Record<string, unknown>;
  if (s.type === 'object') {
    const props = Object.keys((s.properties as object | undefined) ?? {}).sort();
    if (s.additionalProperties !== false) problems.push(`${path}: additionalProperties must be false`);
    const required = [...((s.required as string[] | undefined) ?? [])].sort();
    if (JSON.stringify(required) !== JSON.stringify(props)) problems.push(`${path}: required must list every property`);
  }
  for (const [k, v] of Object.entries(s)) strictObjects(v, `${path}.${k}`, problems);
}

describe.each(kinds)('%s', (kind) => {
  const { system, schema } = bundledPrompts[kind];

  test('schema compiles and is a strict top-level object', () => {
    expect(() => validator(schema)).not.toThrow();
    expect((schema as { type?: string }).type).toBe('object');
    const problems: string[] = [];
    strictObjects(schema, '$', problems);
    expect(problems).toEqual([]);
  });

  test('valid fixture passes', () => {
    const result = validator(schema).validate(fixture(kind, 'valid'));
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  test('invalid fixture fails', () => {
    expect(validator(schema).validate(fixture(kind, 'invalid')).valid).toBe(false);
  });

  test('prompt is complete', () => {
    expect(system.trim().length).toBeGreaterThan(500);
    expect(system).not.toMatch(/TODO/);
    expect(system.trimEnd().endsWith('Return only the JSON object that matches the provided schema.')).toBe(true);
  });
});

test('learner-facing prompts use the native language placeholder', () => {
  for (const kind of ['rule_draft', 'rule_chat', 'grade', 'dispute'] as const) {
    expect(bundledPrompts[kind].system).toContain('{{nativeLanguage}}');
  }
});
