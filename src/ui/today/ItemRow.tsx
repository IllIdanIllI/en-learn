import { t, type Lang } from '@/core/i18n';
import type { ViewItem } from '@/core/session/view';
import { Input } from '@/ui/components/ui/input';

/** One numbered item: sentence in Reading style, answer input below. `children` holds an inline question. */
export function ItemRow({ item, number, lang, value, onChange, children }: {
  item: ViewItem; number: number; lang: Lang; value: string; onChange: (value: string) => void; children?: React.ReactNode;
}) {
  const labelId = `item-${item.id}`;
  return (
    <li className="flex gap-3">
      <span className="label tabular mt-1.5 w-6 shrink-0 text-right text-faint">{number}</span>
      <div className="min-w-0 flex-1">
        <p id={labelId} className="reading">{item.prompt}</p>
        <Input
          aria-labelledby={labelId}
          className="mt-2 max-w-md"
          value={value}
          placeholder={item.format === 'fix' ? t(lang, 'input.fix') : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {children}
      </div>
    </li>
  );
}
