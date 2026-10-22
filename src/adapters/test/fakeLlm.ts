import type { Llm, LlmRequest, LlmResult } from '@/core/ports';
import type { LlmKind } from '@/core/domain';

type Scripted = LlmResult<unknown> | ((req: LlmRequest) => LlmResult<unknown>);

export class FakeLlm implements Llm {
  readonly calls: LlmRequest[] = [];
  private readonly queues: Partial<Record<LlmKind, Scripted[]>>;

  constructor(script: Partial<Record<LlmKind, Scripted[]>>) {
    this.queues = {};
    for (const k of Object.keys(script) as LlmKind[]) this.queues[k] = [...(script[k] ?? [])];
  }

  async call(req: LlmRequest): Promise<LlmResult<unknown>> {
    this.calls.push(req);
    const next = this.queues[req.kind]?.shift();
    if (!next) throw new Error(`FakeLlm: no scripted result for ${req.kind}`);
    return typeof next === 'function' ? next(req) : next;
  }
}
