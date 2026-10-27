import type { ReactNode } from 'react';

/** Sticky bar at the bottom of the session page; holds the page's buttons. */
export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-10 flex gap-3 border-t border-border bg-background py-3">{children}</div>;
}
