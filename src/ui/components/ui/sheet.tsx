import * as React from 'react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

/** Right side panel (420px). No dimming overlay: it sits over the content area, not as a modal. Use it with `modal={false}` on Sheet. */
function SheetContent({ className, children, closeLabel = 'Close', ...props }: React.ComponentProps<typeof SheetPrimitive.Content> & { closeLabel?: string }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Content
        data-slot="sheet-content"
        onInteractOutside={(e) => e.preventDefault()}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex h-full w-[420px] max-w-full flex-col gap-3 border-l border-border bg-background p-6 text-foreground animate-in fade-in-0 duration-200',
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          className="absolute top-4 right-4 rounded-sm p-1 text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={closeLabel}
        >
          <X className="size-4" strokeWidth={1.5} />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-1', className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn('title', className)} {...props} />;
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn('text-muted-foreground', className)} {...props} />;
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription };
