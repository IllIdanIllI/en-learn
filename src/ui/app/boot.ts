import { getSettings } from '@/core/db/repos/settings';
import { startApp } from '@/core/startup';
import { loadSeed } from '@/core/programme/setup';
import { checkPrerequisites } from '@/core/prereq';
import type { Deps, Llm } from '@/core/ports';
import type { CoreInit } from './CoreProvider';

declare global {
  interface Window {
    /** Preview only: the last value passed to `setAppIcon`, for tests. */
    __appIcon?: boolean;
  }
}

/** Real app: Tauri adapters, SQLite file, the installed `claude` CLI. */
export async function bootTauri(): Promise<CoreInit> {
  const [{ appDataDir, appConfigDir, homeDir }, { openTauriDb }, { readDataDir, moveDataDir }, { ensureCliDir }, { TauriClock }, { TauriProcessRunner }, { TauriPromptStore }, { ClaudeCli }, { openUrl }, { invoke }, { TauriNet }] =
    await Promise.all([
      import('@tauri-apps/api/path'),
      import('@/adapters/tauri/db'),
      import('@/adapters/tauri/dataFolder'),
      import('@/adapters/tauri/cliDir'),
      import('@/adapters/tauri/clock'),
      import('@/adapters/tauri/processRunner'),
      import('@/adapters/tauri/promptStore'),
      import('@/adapters/tauri/claudeCli'),
      import('@tauri-apps/plugin-opener'),
      import('@tauri-apps/api/core'),
      import('@/adapters/tauri/net'),
    ]);
  const [appData, appConfig, home] = await Promise.all([appDataDir(), appConfigDir(), homeDir()]);
  let custom: string | null = null;
  let dataDirError: string | undefined;
  try {
    custom = await readDataDir(appData);
  } catch (e) {
    dataDirError = e instanceof Error ? e.message : String(e);
  }
  const dataDir = custom ?? appData;
  const db = await openTauriDb(custom);
  await startApp({ db });

  const settings = await getSettings(db);
  const cliDir = await ensureCliDir(appData);
  const runner = new TauriProcessRunner();
  const prereq = await checkPrerequisites(runner);
  // Without a usable `claude` Today shows a notice instead of building and no call is made, so this Llm is not reached.
  const llm: Llm = prereq.ok
    ? new ClaudeCli(runner, prereq.location, cliDir, home)
    : { call: () => Promise.reject(new Error('claude is not available')) };
  const clock = new TauriClock();
  clock.configure({ dayStartHour: settings.dayStartHour, overrideDate: settings.dayOverride });
  const deps: Deps = { db, llm, clock, prompts: new TauriPromptStore(dataDir), net: new TauriNet() };
  return {
    deps,
    runner,
    prereq,
    settings,
    loadSeedInput: () => {
      try {
        return loadSeed(clock.today());
      } catch {
        return null; // No usable seed files: the setup form starts empty.
      }
    },
    dataDir,
    ...(dataDirError === undefined ? {} : { dataDirError }),
    moveDataDir: (target) => moveDataDir({ appDataDir: appData, appConfigDir: appConfig, home, custom }, target, () => db.close()),
    reopenDb: () => openTauriDb(custom),
    makeLlm: (location) => new ClaudeCli(runner, location, cliDir, home),
    openUrl: (url) => openUrl(url),
    ...(navigator.userAgent.includes('Mac') ? { setAppIcon: (night: boolean) => invoke<void>('set_app_icon', { night }) } : {}),
  };
}

/** Browser preview: sql.js, canned LLM, fixed clock; `?state=` picks the fixture. */
export async function bootPreview(search: string): Promise<CoreInit> {
  const { buildPreview, parsePreviewState, parsePreviewDelay, parsePreviewEarly, parsePreviewFail, withDelay, withFailure } = await import('@/adapters/preview/fixtures');
  const { MINI_PROGRAMME, MINI_RULES } = await import('@/adapters/preview/miniSeed');
  const core = await buildPreview(parsePreviewState(search), { early: parsePreviewEarly(search) });
  const settings = await getSettings(core.deps.db);
  core.deps.clock.configure({ dayStartHour: settings.dayStartHour, overrideDate: settings.dayOverride });
  const { previewNet } = await import('@/adapters/preview/previewNet');
  const deps = { ...core.deps, llm: withFailure(withDelay(core.deps.llm, parsePreviewDelay(search)), parsePreviewFail(search)), net: previewNet };
  return {
    ...core,
    deps,
    settings,
    loadSeedInput: () => ({ programme: MINI_PROGRAMME, rules: MINI_RULES }),
    dataDir: '~/Library/Application Support/English Exam Coach',
    setAppIcon: (night) => {
      window.__appIcon = night;
      return Promise.resolve();
    },
  };
}

export function boot(): Promise<CoreInit> {
  return '__TAURI_INTERNALS__' in window ? bootTauri() : bootPreview(window.location.search);
}
