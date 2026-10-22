import * as React from 'react';
import { cn } from '@/lib/utils';

/** Answer-style input: raised, mono, 34px. Spellcheck and autocorrect stay off (spelling is being tested). */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      className={cn(
        'answer h-[34px] w-full min-w-0 rounded-sm border border-border bg-input px-2.5 py-1.5 text-foreground outline-none transition-colors duration-150 placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
