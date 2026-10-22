import { cn } from '@/lib/utils';

/** Inline validation text under a field, in muted rust with a word, never a dialog. */
export function FieldError({ id, children, className }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <p id={id} role="alert" className={cn('label mt-1 text-destructive', className)}>
      {children}
    </p>
  );
}
