import { Command } from '@tauri-apps/plugin-shell';
import type { ProcessRunner, RunResult } from '@/core/ports';

export class TauriProcessRunner implements ProcessRunner {
  async run(
    scope: string,
    args: string[],
    opts: { stdin?: string; cwd?: string; env?: Record<string, string>; timeoutMs: number; signal?: AbortSignal },
  ): Promise<RunResult> {
    const cmd = Command.create(scope, args, { cwd: opts.cwd, env: opts.env });
    let stdout = '';
    let stderr = '';
    cmd.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    cmd.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    return new Promise<RunResult>((resolve, reject) => {
      let settled = false;
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let child: { kill(): Promise<void> } | undefined;
      const onAbort = () => {
        if (child) void child.kill().catch(() => undefined);
        finish(() => resolve({ code: null, stdout, stderr, timedOut: false, cancelled: true }));
      };
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
        fn();
      };
      if (opts.signal?.aborted) {
        finish(() => resolve({ code: null, stdout, stderr, timedOut: false, cancelled: true }));
        return;
      }
      opts.signal?.addEventListener('abort', onAbort);
      cmd.on('close', ({ code }) => finish(() => resolve({ code, stdout, stderr, timedOut })));
      cmd.on('error', (err) => finish(() => reject(new Error(String(err)))));
      cmd.spawn().then(
        (spawned) => {
          child = spawned;
          // Stopped while starting: the process is killed as soon as it exists.
          if (settled) {
            if (opts.signal?.aborted) void spawned.kill().catch(() => undefined);
            return;
          }
          timer = setTimeout(() => {
            timedOut = true;
            void spawned.kill().catch(() => undefined);
            finish(() => resolve({ code: null, stdout, stderr, timedOut: true }));
          }, opts.timeoutMs);
        },
        (e: unknown) => finish(() => reject(e instanceof Error ? e : new Error(String(e)))),
      );
    });
  }
}
