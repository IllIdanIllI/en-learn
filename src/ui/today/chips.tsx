import { cn } from '@/lib/utils';

/** The verdict word on a tinted chip; the word, not colour alone, carries the verdict. */
export function VerdictChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'label inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5',
        ok ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
      )}
    >
      {label}
    </span>
  );
}

/** `§ section` chip; with `onOpen` it is a button that opens the rule panel, passing the element for focus return. */
export function RuleRef({ section, onOpen }: { section: string; onOpen?: (opener: HTMLElement) => void }) {
  const style = 'label shrink-0 rounded-sm bg-input px-1.5 py-0.5 text-muted-foreground';
  if (!onOpen) return <span className={style}>§ {section}</span>;
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      className={cn(style, 'transition-colors duration-150 hover:bg-secondary hover:text-foreground')}
    >
      § {section}
    </button>
  );
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
