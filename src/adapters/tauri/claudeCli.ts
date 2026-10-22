import type { Llm, LlmRequest, LlmResult, ProcessRunner, RunResult } from '@/core/ports';
import { buildClaudeArgs, scopeName, type ClaudeLocation } from '@/core/llm/claude';
import { failedRun, parseEnvelope } from '@/core/llm/envelope';

export class ClaudeCli implements Llm {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly location: ClaudeLocation,
    private readonly cwd: string,
    private readonly homeDir: string,
  ) {}

  async call(req: LlmRequest): Promise<LlmResult<unknown>> {
    const scope = scopeName(this.location, req.budgetUsd === null ? 'call' : 'call-budget');
    const env = { PATH: `${this.homeDir}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin` };
    const started = Date.now();
    let res: RunResult;
    try {
      res = await this.runner.run(scope, buildClaudeArgs(req), {
        cwd: this.cwd,
        env,
        timeoutMs: req.timeoutMs,
      });
    } catch (e) {
      return fail('spawn_failed', e instanceof Error ? e.message : String(e), '', started);
    }
    if (res.timedOut) return fail('timeout', `Timed out after ${req.timeoutMs} ms`, res.stdout, started);
    const failed = failedRun(res);
    if (failed) return fail(failed.code, failed.message, res.stdout, started);
    const parsed = parseEnvelope(res.stdout);
    const durationMs = Date.now() - started;
    if (parsed.ok) return { ok: true, data: parsed.data, costUsd: parsed.costUsd, durationMs, raw: res.stdout };
    return { ok: false, code: parsed.code, message: parsed.message, costUsd: parsed.costUsd, durationMs, raw: res.stdout };
  }
}

function fail(code: 'spawn_failed' | 'timeout' | 'cli_error' | 'not_signed_in', message: string, raw: string, started: number): LlmResult<unknown> {
  return { ok: false, code, message, costUsd: 0, durationMs: Date.now() - started, raw };
}
