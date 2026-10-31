import type { Snippet } from '@/core/progress/errorContext';

export const WAS_TONE = 'rounded-sm bg-destructive/10 text-destructive';
export const SHOULD_TONE = 'rounded-sm bg-success/10 text-success';

/** A sentence snippet: muted context around the changed part, which carries `tone`. */
export function SnippetText({ s, tone }: { s: Snippet; tone: string }) {
  return (
    <>
      <span className="text-muted-foreground">{s.before}</span>
      <span className={`font-semibold ${tone}`}>{s.changed}</span>
      <span className="text-muted-foreground">{s.after}</span>
    </>
  );
}
