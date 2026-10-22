import type { LlmRequest } from '@/core/ports';

export type ClaudeLocation = 'local' | 'legacy' | 'homebrew' | 'usr-local';
export type ClaudeShape = 'version' | 'auth' | 'call' | 'call-budget';

export const CLAUDE_LOCATIONS: ReadonlyArray<{ loc: ClaudeLocation; path: string }> = [
  { loc: 'local', path: '$HOME/.local/bin/claude' },
  { loc: 'legacy', path: '$HOME/.claude/local/claude' },
  { loc: 'homebrew', path: '/opt/homebrew/bin/claude' },
  { loc: 'usr-local', path: '/usr/local/bin/claude' },
];

export function scopeName(loc: ClaudeLocation, shape: ClaudeShape): string {
  return `claude-${loc}-${shape}`;
}

export function buildClaudeArgs(req: LlmRequest): string[] {
  const args = [
    '-p',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(req.schema),
    '--system-prompt',
    req.systemPrompt,
    '--tools',
    '',
    '--model',
    req.model,
    '--no-session-persistence',
    '--strict-mcp-config',
  ];
  if (req.budgetUsd !== null) args.push('--max-budget-usd', String(req.budgetUsd));
  args.push('--', req.userPrompt);
  return args;
}
