import { Command } from '@tauri-apps/plugin-shell';
import type { ProcessRunner, RunResult } from '@/core/ports';

export class TauriProcessRunner implements ProcessRunner {
  async run(
    scope: string,
    args: string[],
    opts: { stdin?: string; cwd?: string; env?: Record<string, string>; timeoutMs: number },
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
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        fn();
      };
      cmd.on('close', ({ code }) => finish(() => resolve({ code, stdout, stderr, timedOut })));
      cmd.on('error', (err) => finish(() => reject(new Error(String(err)))));
      cmd.spawn().then(
        (child) => {
          if (settled) return;
          timer = setTimeout(() => {
            timedOut = true;
            void child.kill().catch(() => undefined);
            finish(() => resolve({ code: null, stdout, stderr, timedOut: true }));
          }, opts.timeoutMs);
        },
        (e: unknown) => finish(() => reject(e instanceof Error ? e : new Error(String(e)))),
      );
    });
  }
}
