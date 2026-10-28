import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { buildClaudeArgs, CLAUDE_LOCATIONS, scopeName } from '@/core/llm/claude';
import type { LlmRequest } from '@/core/ports';

type Slot = string | { validator: string };
interface Entry { name: string; cmd: string; args: Slot[] }

const caps = JSON.parse(readFileSync('src-tauri/capabilities/default.json', 'utf8')) as {
  permissions: Array<string | { identifier: string; allow?: Entry[] }>;
};
const spawn = caps.permissions.find((p) => typeof p !== 'string' && p.identifier === 'shell:allow-spawn');
const entries = (spawn as { allow: Entry[] }).allow;

const req = (budgetUsd: number | null): LlmRequest => ({
  kind: 'grade',
  systemPrompt: 'line one\nline two',
  userPrompt: 'the user prompt',
  schema: { type: 'object' },
  model: 'claude-sonnet-5-5',
  effort: 'medium',
  budgetUsd,
  timeoutMs: 1000,
});

describe('shell capability call shapes', () => {
  for (const { loc } of CLAUDE_LOCATIONS) {
    for (const [shape, budget] of [['call', null], ['call-budget', 0.3]] as const) {
      test(`${loc} ${shape} matches buildClaudeArgs`, () => {
        const entry = entries.find((e) => e.name === scopeName(loc, shape));
        expect(entry).toBeDefined();
        const args = buildClaudeArgs(req(budget));
        expect(entry!.args).toHaveLength(args.length);
        entry!.args.forEach((slot, i) => {
          if (typeof slot === 'string') expect(args[i]).toBe(slot);
          else expect(args[i]).toMatch(new RegExp(slot.validator));
        });
      });
    }
  }
});
