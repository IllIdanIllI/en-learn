import { createContext, useContext, type ReactNode } from 'react';
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
