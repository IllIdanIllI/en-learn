import type { Effort, ISODate, LlmKind } from './domain';
import type { DayConfig } from './day';

export interface Db {
  execute(sql: string, params?: unknown[]): Promise<{ lastInsertId: number; rowsAffected: number }>;
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Clock {
  /** The app's date: the calendar date shifted by the day start hour and the new-day override. */
  today(): ISODate;
  /** The local calendar date. */
  calendarDate(): ISODate;
  configure(cfg: DayConfig): void;
  /** True while the app's date is behind the calendar date and a new day may be started. */
  canStartNewDay(): boolean;
  now(): string;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** The run was stopped through `signal`. */
  cancelled?: boolean;
}

export interface ProcessRunner {
  run(
    scope: string,
    args: string[],
    opts: { stdin?: string; cwd?: string; env?: Record<string, string>; timeoutMs: number; signal?: AbortSignal },
  ): Promise<RunResult>;
}

export interface LlmRequest {
  kind: LlmKind;
  systemPrompt: string;
  userPrompt: string;
  schema: object;
  model: string;
  effort: Effort;
  budgetUsd: number | null;
  timeoutMs: number;
  /** Chat only: previous CLI session to continue (forked); null starts a new one. Implies persist. */
  resume?: string | null;
  /** Keep the CLI session on disk (omits --no-session-persistence). */
  persist?: boolean;
  /** Aborting it stops the call: the result is `cancelled`. */
  signal?: AbortSignal;
}

export type LlmErrorCode =
  | 'timeout'
  | 'not_signed_in'
  | 'budget'
  | 'cli_error'
  | 'invalid_json'
  | 'schema'
  | 'check'
  | 'spawn_failed'
  | 'cancelled';

export type LlmResult<T> =
  | { ok: true; data: T; costUsd: number; durationMs: number; raw: string; sessionId?: string }
  | {
      ok: false;
      code: LlmErrorCode;
      message: string;
      costUsd: number;
      durationMs: number;
      raw: string;
    };

export interface Llm {
  call(req: LlmRequest): Promise<LlmResult<unknown>>;
}

export interface PromptStore {
  load(kind: LlmKind): Promise<{ system: string; schema: object }>;
}

export interface Deps {
  db: Db;
  llm: Llm;
  clock: Clock;
  prompts: PromptStore;
  /** Random source for the words feature; defaults to Math.random. */
  rand?: () => number;
}
