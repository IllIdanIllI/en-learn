import type { ProcessRunner, RunResult } from '@/core/ports';

type RunOpts = Parameters<ProcessRunner['run']>[2];

export class FakeRunner implements ProcessRunner {
  readonly calls: Array<{ scope: string; args: string[]; opts: RunOpts }> = [];
  private readonly responses: Array<RunResult | Error>;

  constructor(responses: Array<RunResult | Error>) {
    this.responses = [...responses];
  }

  async run(scope: string, args: string[], opts: RunOpts): Promise<RunResult> {
    this.calls.push({ scope, args, opts });
    const next = this.responses.shift();
    if (!next) throw new Error('FakeRunner: no scripted response');
    if (next instanceof Error) throw next;
    return next;
  }
}
