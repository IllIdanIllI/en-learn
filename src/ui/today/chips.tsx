import { cn } from '@/lib/utils';

/** Icon plus word, never colour alone. */
export function VerdictChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'label inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5',
        ok ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
      )}
    >
      <span aria-hidden>{ok ? '✓' : '✗'}</span>
      {label}
    </span>
  );
}

export function RuleRef({ section }: { section: string }) {
  return <span className="label shrink-0 rounded-sm bg-input px-1.5 py-0.5 text-muted-foreground">§ {section}</span>;
}

/** Dusk Note chip: "Not counted: …". */
export function NoteChip({ children }: { children: React.ReactNode }) {
  return <span className="label rounded-sm bg-note/15 px-1.5 py-0.5 text-note">{children}</span>;
}

/** Inline Dusk Note notice (errors, hints); the message is the exact next step. */
export function Notice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-wrap items-center gap-3 rounded-sm bg-muted px-3 py-2 text-note', className)}>
      {children}
    </div>
  );
}
