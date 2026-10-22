import * as React from 'react';
import { cn } from '@/lib/utils';

/** Native select styled like FieldInput: keyboard and screen-reader behaviour come for free. */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'h-[34px] w-full min-w-0 rounded-sm border border-border bg-input px-2 py-1.5 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-[invalid=true]:border-destructive [color-scheme:light] dark:[color-scheme:dark]',
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
