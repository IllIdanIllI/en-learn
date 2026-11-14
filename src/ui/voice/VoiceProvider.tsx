import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { useCore } from '@/ui/app/CoreProvider';
import type { VoiceEngine } from './engine';

const VoiceContext = createContext<VoiceEngine | null>(null);

/** Provides the app's voice engine to the word cards; null means the system voice only. */
export function VoiceProvider({ children }: { children: ReactNode }) {
  const { voice } = useCore();
  return <VoiceContext.Provider value={voice}>{children}</VoiceContext.Provider>;
}

export function useVoice(): VoiceEngine | null {
  return useContext(VoiceContext);
}

/** Download progress 0..1 while the voice downloads, otherwise null; re-renders on every change. */
export function useVoiceDownload(engine: VoiceEngine | null): number | null {
  const subscribe = useCallback((fn: () => void) => (engine ? engine.subscribe(fn) : () => {}), [engine]);
  const snapshot = useCallback(() => (engine?.status() === 'downloading' ? engine.progress() : null), [engine]);
  return useSyncExternalStore(subscribe, snapshot);
}
