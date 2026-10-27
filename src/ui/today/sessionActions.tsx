import { createContext, useContext } from 'react';

/** What a graded item can ask of the session page: open a rule in the side panel, reload the view after a change, or keep and send dispute texts. */
export interface SessionActions {
  openRule(ref: { ruleId: number; topicId: number | null; section: string }, opener: HTMLElement): void;
  reload(): void;
  /** Objection texts by item id: typed, or restored from what was saved. */
  disputes: Record<number, string>;
  setDispute(itemId: number, text: string): void;
  /** Sends the given items (default: every unsent one) in one call; rejects with the failure. */
  sendDisputes(ids?: number[]): Promise<void>;
}

const Context = createContext<SessionActions | null>(null);

export const SessionActionsProvider = Context.Provider;

export function useSessionActions(): SessionActions {
  const actions = useContext(Context);
  if (!actions) throw new Error('useSessionActions must be used inside SessionPage');
  return actions;
}
