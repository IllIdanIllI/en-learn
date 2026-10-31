import { ToggleGroup } from 'radix-ui';
import { cn } from '@/lib/utils';

/** Two or three exclusive choices as a radio group; arrow keys move between them. */
export function Segmented<V extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={label}
      onValueChange={(v) => {
        if (v) onChange(v as V);
      }}
      className={cn('inline-flex shrink-0 rounded-md border border-border p-0.5', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="h-[28px] rounded-sm px-2.5 text-sm whitespace-nowrap text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=on]:bg-secondary data-[state=on]:text-foreground data-[state=on]:ring-1 data-[state=on]:ring-primary"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
