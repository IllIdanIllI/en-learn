import { Plus, X } from 'lucide-react';
import { t, type Lang } from '@/core/i18n';
import type { TopicKind } from '@/core/domain';
import { Button } from '@/ui/components/ui/button';
import { FieldInput } from '@/ui/components/ui/field-input';
import { FieldError } from '@/ui/components/FieldError';
import { Segmented } from '@/ui/components/Segmented';
import { rowKey, type SetupErrors, type TopicRow } from './form';

export function TopicList({
  lang,
  rows,
  numbered,
  testId,
  addLabel,
  errors,
  onChange,
  onAdd,
}: {
  lang: Lang;
  rows: TopicRow[];
  numbered: boolean;
  testId: string;
  addLabel: string;
  errors: SetupErrors['rows'];
  onChange: (rows: TopicRow[]) => void;
  onAdd: () => void;
}) {
  const update = (uid: string, patch: Partial<TopicRow>) => onChange(rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  const kinds: { value: TopicKind; label: string }[] = [
    { value: 'learn', label: t(lang, 'setup.kind.learn') },
    { value: 'notice', label: t(lang, 'setup.kind.notice') },
  ];

  return (
    <div>
      <ul className="flex flex-col gap-3">
        {rows.map((row, i) => {
          const err = errors[row.uid];
          const name = numbered ? t(lang, 'setup.weekN', { n: i + 1 }) : String(i + 1);
          return (
            <li key={row.uid} data-testid={testId}>
              <div className="flex items-center gap-2">
                {numbered && <span className="tabular w-5 shrink-0 text-right text-muted-foreground">{i + 1}</span>}
                <FieldInput
                  aria-label={`${t(lang, 'setup.topicTitle')}, ${name}`}
                  aria-invalid={err?.title ? true : undefined}
                  value={row.title}
                  onChange={(e) => update(row.uid, { title: e.target.value })}
                  className="min-w-0 flex-1"
                />
                <Segmented
                  label={`${t(lang, 'setup.kind')}, ${name}`}
                  value={row.kind}
                  options={kinds}
                  onChange={(kind) => update(row.uid, { kind })}
                />
                <FieldInput
                  aria-label={`${t(lang, 'setup.topicKey')}, ${name}`}
                  aria-invalid={err?.key ? true : undefined}
                  value={rowKey(row)}
                  onChange={(e) => update(row.uid, { keyOverride: e.target.value })}
                  className="w-32 shrink-0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${t(lang, 'setup.remove')}, ${name}`}
                  onClick={() => onChange(rows.filter((r) => r.uid !== row.uid))}
                >
                  <X strokeWidth={1.5} aria-hidden />
                </Button>
              </div>
              {err?.title && <FieldError className={numbered ? 'ml-7' : undefined}>{t(lang, err.title)}</FieldError>}
              {err?.key && <FieldError className={numbered ? 'ml-7' : undefined}>{t(lang, err.key)}</FieldError>}
            </li>
          );
        })}
      </ul>
      <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={onAdd}>
        <Plus strokeWidth={1.5} aria-hidden />
        {addLabel}
      </Button>
    </div>
  );
}
