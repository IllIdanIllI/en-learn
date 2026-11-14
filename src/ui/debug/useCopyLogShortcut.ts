import { useEffect } from 'react';
import { toast } from 'sonner';
import { t, type Lang } from '@/core/i18n';
import { debugLog } from './debugLog';

/** Writes text to the clipboard; false when the write is refused or the clipboard is missing. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Cmd+Shift+L on macOS, Ctrl+Shift+L elsewhere; Alt makes it another shortcut. */
export function isCopyLogShortcut(
  e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  mac: boolean,
): boolean {
  if (e.key.toLowerCase() !== 'l' || !e.shiftKey || e.altKey) return false;
  return mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

/** Copies the debug log from anywhere in the app, also while a text field has focus. */
export function useCopyLogShortcut(lang: Lang): void {
  useEffect(() => {
    const mac = navigator.userAgent.includes('Mac');
    const onKey = (e: KeyboardEvent) => {
      if (!isCopyLogShortcut(e, mac)) return;
      e.preventDefault();
      debugLog.flush();
      void copyText(debugLog.text()).then((ok) =>
        ok ? toast.success(t(lang, 'debug.copied'), { id: 'debug-copy', duration: 4000 }) : toast.error(t(lang, 'debug.copyFailed'), { id: 'debug-copy', duration: 8000 }),
      );
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lang]);
}
