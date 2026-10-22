import { createContext, useContext } from 'react';

/** What a graded item can ask of the session page: open a rule in the side panel, or reload the view after a change. */
export interface SessionActions {
  openRule(ref: { ruleId: number; topicId: number | null; section: string }, opener: HTMLElement): void;
  reload(): void;
}

const Context = createContext<SessionActions | null>(null);

export const SessionActionsProvider = Context.Provider;

export function useSessionActions(): SessionActions {
  const actions = useContext(Context);
  if (!actions) throw new Error('useSessionActions must be used inside SessionPage');
  return actions;
}
