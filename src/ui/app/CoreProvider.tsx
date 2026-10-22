import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Deps, ProcessRunner } from '@/core/ports';
import type { Lang } from '@/core/i18n';
import type { PrereqResult } from '@/core/prereq';
import { getSettings, type Settings } from '@/core/db/repos/settings';

export interface CoreInit {
  deps: Deps;
  runner: ProcessRunner;
  /** Result of the `claude` check; null in preview states where it is not part of the fixture. */
  prereq: PrereqResult | null;
  settings: Settings;
}

export interface Core {
  deps: Deps;
  runner: ProcessRunner;
  lang: Lang;
  settings: Settings;
  prereq: PrereqResult | null;
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
  const { deps, runner, prereq } = init;
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

  useTheme(settings.theme);
  useEffect(() => {
    document.documentElement.lang = settings.nativeLanguage;
  }, [settings.nativeLanguage]);

  const value = useMemo<Core>(
    () => ({ deps, runner, lang: settings.nativeLanguage, settings, prereq, refresh, version }),
    [deps, runner, settings, prereq, refresh, version],
  );
  return <CoreContext.Provider value={value}>{children}</CoreContext.Provider>;
}
