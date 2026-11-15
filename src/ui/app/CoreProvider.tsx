import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Db, Deps, Llm, ProcessRunner } from '@/core/ports';
import { MoveRefused } from '@/core/dataFolder';
import type { Lang } from '@/core/i18n';
import type { PrereqResult } from '@/core/prereq';
import { recheck } from './recheck';
import type { ClaudeLocation } from '@/core/llm/claude';
import type { ProgrammeInput, SeedRule } from '@/core/programme/setup';
import { useDayWatch } from './useDayWatch';
import { getSettings, type Settings } from '@/core/db/repos/settings';
import type { VoiceEngine } from '@/ui/voice/engine';

export interface SeedBundle { programme: ProgrammeInput; rules: SeedRule[] }

export interface CoreInit {
  deps: Deps;
  runner: ProcessRunner;
  /** Result of the `claude` check; null in preview states where it is not part of the fixture. */
  prereq: PrereqResult | null;
  settings: Settings;
  /** Seed programme and rules for the setup form; null when no seed is available. */
  loadSeedInput(): SeedBundle | null;
  /** Folder shown in Settings: the database and prompt overrides live there. */
  dataDir: string;
  /** Set when location.json could not be read and the default folder is used. */
  dataDirError?: string;
  /** Copies the data to `target` and switches to it (the caller reloads); absent in preview. Throws `MoveRefused` before touching anything. */
  moveDataDir?: (target: string) => Promise<void>;
  /** Reopens the database after a failed move closed it. */
  reopenDb?: () => Promise<Db>;
  /** Builds the real Llm once a `claude` location works; absent in preview, where a recheck changes nothing. */
  makeLlm?: (location: ClaudeLocation) => Llm;
  /** Opens an https URL in the system browser; absent in preview, where the anchor works normally. */
  openUrl?: (url: string) => Promise<void>;
  /** Swaps the Dock icon (Night when true); present only on macOS in the real app and in preview. */
  setAppIcon?: (night: boolean) => Promise<void>;
  /** The Kokoro voice (Tauri) or the preview voice; null leaves only the system voice. */
  voice?: VoiceEngine | null;
}

export interface Core {
  deps: Deps;
  runner: ProcessRunner;
  lang: Lang;
  settings: Settings;
  /** True when the `dark` class is on <html>, including "system" resolved against the OS. */
  isDark: boolean;
  prereq: PrereqResult | null;
  loadSeedInput(): SeedBundle | null;
  dataDir: string;
  dataDirError?: string;
  /** Present when the data folder can be changed. Reloads the app on success, throws on failure with the old folder still in use. */
  moveDataDir?: (target: string) => Promise<void>;
  /** Reruns the `claude` check; on success the Llm is swapped in and `prereq` becomes ok. */
  recheckPrerequisites(): Promise<PrereqResult | null>;
  /** Re-reads settings and bumps `version`; pages that load data depend on `version`. */
  refresh(): void;
  version: number;
  openUrl?: (url: string) => Promise<void>;
  setAppIcon?: (night: boolean) => Promise<void>;
  /** The voice engine, or null when only the system voice is used. */
  voice: VoiceEngine | null;
}

const CoreContext = createContext<Core | null>(null);

export function useCore(): Core {
  const core = useContext(CoreContext);
  if (!core) throw new Error('useCore must be used inside CoreProvider');
  return core;
}

function resolveDark(theme: Settings['theme']): boolean {
  return theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/** `dark` class on <html> follows the theme setting; "system" follows the OS. Returns whether the class is on. */
function useTheme(theme: Settings['theme']): boolean {
  const [isDark, setIsDark] = useState(() => resolveDark(theme));
  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = resolveDark(theme);
      root.classList.toggle('dark', dark);
      setIsDark(dark);
    };
    apply();
    if (theme !== 'system') return;
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [theme]);
  return isDark;
}

export function CoreProvider({ init, children }: { init: CoreInit; children: ReactNode }) {
  const { runner, loadSeedInput, dataDir, dataDirError, makeLlm, openUrl, setAppIcon, voice = null } = init;
  const [deps, setDeps] = useState(init.deps);
  const [prereq, setPrereq] = useState(init.prereq);
  const [settings, setSettings] = useState(init.settings);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    getSettings(deps.db).then(
      (s) => {
        deps.clock.configure({ dayStartHour: s.dayStartHour, overrideDate: s.dayOverride });
        setSettings(s);
        setVersion((v) => v + 1);
      },
      (e: unknown) => console.error('refresh failed', e),
    );
  }, [deps]);

  useDayWatch(deps.clock, refresh);

  const recheckPrerequisites = useCallback(async () => {
    if (!makeLlm) return prereq;
    const next = await recheck(runner, deps, makeLlm);
    setDeps(next.deps);
    setPrereq(next.prereq);
    return next.prereq;
  }, [makeLlm, prereq, runner, deps]);

  const moveDataDir = useMemo(() => {
    const move = init.moveDataDir;
    if (!move) return undefined;
    return async (target: string) => {
      try {
        await move(target);
      } catch (e) {
        if (!(e instanceof MoveRefused) && init.reopenDb) {
          try {
            const db = await init.reopenDb();
            setDeps((d) => ({ ...d, db }));
          } catch (reopen) {
            const message = (x: unknown) => (x instanceof Error ? x.message : String(x));
            throw new Error(`${message(e)}; ${message(reopen)}`, { cause: reopen });
          }
        }
        throw e;
      }
      window.location.reload();
    };
  }, [init]);

  const isDark = useTheme(settings.theme);
  useEffect(() => {
    document.documentElement.lang = settings.nativeLanguage;
  }, [settings.nativeLanguage]);
  useEffect(() => {
    document.documentElement.dataset.design = settings.design;
  }, [settings.design]);

  const value = useMemo<Core>(
    () => ({
      deps, runner, lang: settings.nativeLanguage, settings, isDark, prereq, loadSeedInput, dataDir, dataDirError, moveDataDir, recheckPrerequisites, refresh, version, openUrl, setAppIcon, voice,
    }),
    [deps, runner, settings, isDark, prereq, loadSeedInput, dataDir, dataDirError, moveDataDir, recheckPrerequisites, refresh, version, openUrl, setAppIcon, voice],
  );
  return <CoreContext.Provider value={value}>{children}</CoreContext.Provider>;
}
