import * as React from 'react';
import { cn } from '@/lib/utils';

/** Settings and form input: system sans, raised, 34px. For typed answers use `Input` (mono). */
function FieldInput({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="field-input"
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      className={cn(
        'h-[34px] w-full min-w-0 rounded-sm border border-border bg-input px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-[invalid=true]:border-destructive [color-scheme:light] dark:[color-scheme:dark]',
        className,
      )}
      {...props}
    />
  );
}

export { FieldInput };
