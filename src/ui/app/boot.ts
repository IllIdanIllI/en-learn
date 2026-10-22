import { getSettings } from '@/core/db/repos/settings';
import { startApp } from '@/core/startup';
import { checkPrerequisites } from '@/core/prereq';
import type { Deps, Llm } from '@/core/ports';
import type { CoreInit } from './CoreProvider';

/** Real app: Tauri adapters, SQLite file, the installed `claude` CLI. */
export async function bootTauri(): Promise<CoreInit> {
  const [{ appDataDir, homeDir }, { openTauriDb }, { TauriClock }, { TauriProcessRunner }, { TauriPromptStore }, { ClaudeCli }] =
    await Promise.all([
      import('@tauri-apps/api/path'),
      import('@/adapters/tauri/db'),
      import('@/adapters/tauri/clock'),
      import('@/adapters/tauri/processRunner'),
      import('@/adapters/tauri/promptStore'),
      import('@/adapters/tauri/claudeCli'),
    ]);
  const [dataDir, home] = await Promise.all([appDataDir(), homeDir()]);
  const db = await openTauriDb();
  await startApp({ db });

  const runner = new TauriProcessRunner();
  const prereq = await checkPrerequisites(runner);
  // Without a usable `claude` the app routes to /prerequisites; no call is made, so the Llm is never reached.
  const llm: Llm = prereq.ok
    ? new ClaudeCli(runner, prereq.location, dataDir, home)
    : { call: () => Promise.reject(new Error('claude is not available')) };
  const deps: Deps = { db, llm, clock: new TauriClock(), prompts: new TauriPromptStore(dataDir) };
  return { deps, runner, prereq, settings: await getSettings(db) };
}

/** Browser preview: sql.js, canned LLM, fixed clock; `?state=` picks the fixture. */
export async function bootPreview(search: string): Promise<CoreInit> {
  const { buildPreview, parsePreviewState } = await import('@/adapters/preview/fixtures');
  const core = await buildPreview(parsePreviewState(search));
  return { ...core, settings: await getSettings(core.deps.db) };
}

export function boot(): Promise<CoreInit> {
  return '__TAURI_INTERNALS__' in window ? bootTauri() : bootPreview(window.location.search);
}
