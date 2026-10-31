import type { LlmRequest } from '@/core/ports';

export type ClaudeLocation = 'local' | 'legacy' | 'homebrew' | 'usr-local';
export type ClaudeShape = 'version' | 'auth' | 'call' | 'call-budget' | 'chat' | 'chat-budget' | 'chat-next' | 'chat-next-budget';

export const CLAUDE_LOCATIONS: ReadonlyArray<{ loc: ClaudeLocation; path: string }> = [
  { loc: 'local', path: '$HOME/.local/bin/claude' },
  { loc: 'legacy', path: '$HOME/.claude/local/claude' },
  { loc: 'homebrew', path: '/opt/homebrew/bin/claude' },
  { loc: 'usr-local', path: '/usr/local/bin/claude' },
];

export function scopeName(loc: ClaudeLocation, shape: ClaudeShape): string {
  return `claude-${loc}-${shape}`;
}

/** Capability shape of a request: one-shot call, first chat turn, or a later chat turn that resumes a session. */
export function shapeFor(req: LlmRequest): ClaudeShape {
  const base = req.resume ? 'chat-next' : req.persist ? 'chat' : 'call';
  return req.budgetUsd === null ? base : `${base}-budget`;
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
    '--effort',
    req.effort,
  ];
  if (!req.persist && !req.resume) args.push('--no-session-persistence');
  args.push('--strict-mcp-config', '--safe-mode', '--disable-slash-commands');
  if (req.resume) args.push('--resume', req.resume, '--fork-session');
  if (req.budgetUsd !== null) args.push('--max-budget-usd', String(req.budgetUsd));
  args.push('--', req.userPrompt);
  return args;
}
