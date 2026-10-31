import { t, type Lang } from '@/core/i18n';
import type { ViewItem } from '@/core/session/view';
import { Input } from '@/ui/components/ui/input';
import { cn } from '@/lib/utils';

/** One numbered item: sentence in Reading style, answer input below. `children` holds an inline question. */
export function ItemRow({ item, number, lang, value, onChange, children }: {
  item: ViewItem; number: number; lang: Lang; value: string; onChange: (value: string) => void; children?: React.ReactNode;
}) {
  const labelId = `item-${item.id}`;
  const isFix = item.format === 'fix';
  const marked = isFix && value.trim() === '✓';
  return (
    <li className="flex gap-3">
      <span className="label tabular mt-1.5 w-6 shrink-0 text-right text-faint">{number}</span>
      <div className="min-w-0 flex-1">
        <p id={labelId} className="reading">{item.prompt}</p>
        <div className="relative mt-2 max-w-md">
          <Input
            aria-labelledby={labelId}
            className={cn(isFix && 'pl-12')}
            value={marked ? '' : value}
            disabled={marked}
            placeholder={isFix ? t(lang, marked ? 'input.correctAsIs' : 'input.fix') : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
          {isFix && (
            <button
              type="button"
              aria-label={t(lang, 'input.markCorrect')}
              aria-pressed={marked}
              onClick={() => onChange(marked ? '' : '✓')}
              className={cn(
                'absolute left-px top-1/2 inline-flex h-8 w-9 -translate-y-1/2 items-center justify-center rounded-sm text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                marked ? 'bg-success text-background' : 'bg-success/10 text-foreground hover:bg-success/15',
              )}
            >
              ✓
            </button>
          )}
        </div>
        {children}
      </div>
    </li>
  );
}
