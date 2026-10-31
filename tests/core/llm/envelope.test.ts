import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseEnvelope } from '@/core/llm/envelope';

const fixture = (name: string) => readFileSync(`tests/fixtures/cli/${name}`, 'utf8');

describe('parseEnvelope', () => {
  test('success envelope yields structured_output and cost', () => {
    const r = parseEnvelope(fixture('envelope-success.json'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({ word: 'cat', n: 3 });
      expect(r.costUsd).toBeCloseTo(0.00077, 5);
    }
  });

  test('success envelope carries the session id; none when absent', () => {
    const r = parseEnvelope(fixture('envelope-success.json'));
    expect(r).toMatchObject({ ok: true, sessionId: '899551ba-7f2a-50d4-9014-08e79b4f3f71' });
    const none = parseEnvelope(JSON.stringify({ structured_output: { a: 1 } }));
    expect(none.ok && 'sessionId' in none).toBe(false);
  });

  test('budget envelope maps to budget', () => {
    const r = parseEnvelope(fixture('envelope-budget.json'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('budget');
      expect(r.costUsd).toBeGreaterThan(0);
    }
  });

  test('non-JSON maps to invalid_json', () => {
    const r = parseEnvelope('not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('invalid_json');
  });

  test('not logged in maps to not_signed_in', () => {
    const r = parseEnvelope('{"is_error":true,"errors":["Not logged in · Please run /login"]}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not_signed_in');
  });

  test('words merely containing login-like text are not not_signed_in', () => {
    const r = parseEnvelope('{"is_error":true,"errors":["Opened dialog in editor"]}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('cli_error');
  });

  test('other is_error maps to cli_error', () => {
    const r = parseEnvelope('{"is_error":true,"errors":["boom"],"total_cost_usd":0.1}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('cli_error');
      expect(r.costUsd).toBe(0.1);
    }
  });
});
