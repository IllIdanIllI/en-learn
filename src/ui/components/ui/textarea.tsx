import * as React from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      className={cn(
        'answer min-h-20 w-full rounded-sm border border-border bg-input px-2.5 py-1.5 text-foreground outline-none transition-colors duration-150 placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
