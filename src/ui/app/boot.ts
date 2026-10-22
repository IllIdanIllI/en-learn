import { getSettings } from '@/core/db/repos/settings';
import { startApp } from '@/core/startup';
import { loadSeed } from '@/core/programme/setup';
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
  // Without a usable `claude` Today shows a notice instead of building and no call is made, so this Llm is not reached.
  const llm: Llm = prereq.ok
    ? new ClaudeCli(runner, prereq.location, dataDir, home)
    : { call: () => Promise.reject(new Error('claude is not available')) };
  const clock = new TauriClock();
  const deps: Deps = { db, llm, clock, prompts: new TauriPromptStore(dataDir) };
  return {
    deps,
    runner,
    prereq,
    settings: await getSettings(db),
    loadSeedInput: () => {
      try {
        return loadSeed(clock.today());
      } catch {
        return null; // No usable seed files: the setup form starts empty.
      }
    },
    promptsDir: `${dataDir}/prompts`,
    makeLlm: (location) => new ClaudeCli(runner, location, dataDir, home),
  };
}

/** Browser preview: sql.js, canned LLM, fixed clock; `?state=` picks the fixture. */
export async function bootPreview(search: string): Promise<CoreInit> {
  const { buildPreview, parsePreviewState, parsePreviewDelay, parsePreviewFail, withDelay, withFailure } = await import('@/adapters/preview/fixtures');
  const { MINI_PROGRAMME, MINI_RULES } = await import('@/adapters/preview/miniSeed');
  const core = await buildPreview(parsePreviewState(search));
  const deps = { ...core.deps, llm: withFailure(withDelay(core.deps.llm, parsePreviewDelay(search)), parsePreviewFail(search)) };
  return {
    ...core,
    deps,
    settings: await getSettings(core.deps.db),
    loadSeedInput: () => ({ programme: MINI_PROGRAMME, rules: MINI_RULES }),
    promptsDir: '~/Library/Application Support/English Exam Coach/prompts',
  };
}

export function boot(): Promise<CoreInit> {
  return '__TAURI_INTERNALS__' in window ? bootTauri() : bootPreview(window.location.search);
}
