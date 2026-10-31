import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseUsage, summarizeCalls } from '@/core/progress/usage';

const envelope = readFileSync('tests/fixtures/cli/envelope-success.json', 'utf8');
const zero = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };

describe('parseUsage', () => {
  test('reads a real envelope', () => {
    expect(parseUsage(envelope)).toEqual({ input: 2, cacheRead: 0, cacheWrite: 3266, output: 233 });
  });
  test('empty, non-JSON, null and usage-less envelopes are zero', () => {
    expect(parseUsage('')).toEqual(zero);
    expect(parseUsage(null)).toEqual(zero);
    expect(parseUsage('not json')).toEqual(zero);
    expect(parseUsage('{"is_error":true,"result":"boom"}')).toEqual(zero);
    expect(parseUsage('null')).toEqual(zero);
  });
});

describe('summarizeCalls', () => {
  test('sums tokens, keeps first-use model order and counts failures', () => {
    const second = JSON.stringify({ usage: { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 5, output_tokens: 7 } });
    const out = summarizeCalls([
      { model: 'claude-sonnet-5-5', ok: true, response: envelope },
      { model: 'claude-haiku-5-5', ok: false, response: '' },
      { model: 'claude-sonnet-5-5', ok: true, response: second },
    ]);
    expect(out).toEqual({
      models: ['claude-sonnet-5-5', 'claude-haiku-5-5'],
      calls: 3,
      failedCalls: 1,
      tokens: { input: 12, cacheRead: 100, cacheWrite: 3271, output: 240 },
    });
  });
  test('no calls', () => {
    expect(summarizeCalls([])).toEqual({ models: [], calls: 0, failedCalls: 0, tokens: zero });
  });
});
