import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Deps, Llm, ProcessRunner } from '@/core/ports';
import type { Lang } from '@/core/i18n';
import type { PrereqResult } from '@/core/prereq';
import { recheck } from './recheck';
import type { ClaudeLocation } from '@/core/llm/claude';
import type { ProgrammeInput, SeedRule } from '@/core/programme/setup';
import { getSettings, type Settings } from '@/core/db/repos/settings';

export interface SeedBundle { programme: ProgrammeInput; rules: SeedRule[] }

export interface CoreInit {
  deps: Deps;
  runner: ProcessRunner;
  /** Result of the `claude` check; null in preview states where it is not part of the fixture. */
  prereq: PrereqResult | null;
  settings: Settings;
  /** Seed programme and rules for the setup form; null when no seed is available. */
  loadSeedInput(): SeedBundle | null;
  /** Folder shown in Settings where prompt overrides live. */
  promptsDir: string;
  /** Builds the real Llm once a `claude` location works; absent in preview, where a recheck changes nothing. */
  makeLlm?: (location: ClaudeLocation) => Llm;
}

export interface Core {
  deps: Deps;
  runner: ProcessRunner;
  lang: Lang;
  settings: Settings;
  prereq: PrereqResult | null;
  loadSeedInput(): SeedBundle | null;
  promptsDir: string;
  /** Reruns the `claude` check; on success the Llm is swapped in and `prereq` becomes ok. */
  recheckPrerequisites(): Promise<PrereqResult | null>;
  /** Re-reads settings and bumps `version`; pages that load data depend on `version`. */
  refresh(): void;
  version: number;
}

const CoreContext = createContext<Core | null>(null);

export function useCore(): Core {
  const core = useContext(CoreContext);
  if (!core) throw new Error('useCore must be used inside CoreProvider');
  return core;
}

/** `dark` class on <html> follows the theme setting; "system" follows the OS. */
function useTheme(theme: Settings['theme']): void {
  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => root.classList.toggle('dark', theme === 'dark' || (theme === 'system' && query.matches));
    apply();
    if (theme !== 'system') return;
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [theme]);
}

export function CoreProvider({ init, children }: { init: CoreInit; children: ReactNode }) {
  const { runner, loadSeedInput, promptsDir, makeLlm } = init;
  const [deps, setDeps] = useState(init.deps);
  const [prereq, setPrereq] = useState(init.prereq);
  const [settings, setSettings] = useState(init.settings);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    getSettings(deps.db).then(
      (s) => {
        setSettings(s);
        setVersion((v) => v + 1);
      },
      (e: unknown) => console.error('refresh failed', e),
    );
  }, [deps]);

  const recheckPrerequisites = useCallback(async () => {
    if (!makeLlm) return prereq;
    const next = await recheck(runner, deps, makeLlm);
    setDeps(next.deps);
    setPrereq(next.prereq);
    return next.prereq;
  }, [makeLlm, prereq, runner, deps]);

  useTheme(settings.theme);
  useEffect(() => {
    document.documentElement.lang = settings.nativeLanguage;
  }, [settings.nativeLanguage]);

  const value = useMemo<Core>(
    () => ({
      deps, runner, lang: settings.nativeLanguage, settings, prereq, loadSeedInput, promptsDir, recheckPrerequisites, refresh, version,
    }),
    [deps, runner, settings, prereq, loadSeedInput, promptsDir, recheckPrerequisites, refresh, version],
  );
  return <CoreContext.Provider value={value}>{children}</CoreContext.Provider>;
}
