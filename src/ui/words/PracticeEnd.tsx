import { useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '@/core/i18n';
import type { Stage } from '@/core/words/types';
import { useCore } from '@/ui/app/CoreProvider';
import { Button, buttonVariants } from '@/ui/components/ui/button';
import { Notice } from '@/ui/today/chips';

type Change = { word: string; stage: Stage };

function Changes({ title, list }: { title: string; list: Change[] }) {
  const { lang } = useCore();
  if (list.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="label text-muted-foreground">{title}</h2>
      <ul className="mt-2 grid gap-1">
        {list.map((c) => (
          <li key={c.word}>
            <span className="answer">{c.word}</span> → {t(lang, `words.stage.${c.stage}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PracticeEnd({ correct, total, up, down, canContinue, canAddNew, onContinue, onAddNew }: {
  correct: number; total: number; up: Change[]; down: Change[]; canContinue: boolean; canAddNew: boolean;
  onContinue: () => void; onAddNew: () => Promise<void>;
}) {
  const { lang } = useCore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div data-testid="practice-end">
      <h1 className="headline">{t(lang, 'words.done', { x: correct, y: total })}</h1>
      <Changes title={t(lang, 'words.up')} list={up} />
      <Changes title={t(lang, 'words.down')} list={down} />
      {error && <Notice className="mt-6">{t(lang, 'words.saveError', { message: error })}</Notice>}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/words" className={buttonVariants({ variant: 'secondary' })}>{t(lang, 'words.back')}</Link>
        {canContinue && <Button onClick={onContinue}>{t(lang, 'words.more')}</Button>}
        {canAddNew && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              onAddNew().catch((e: unknown) => {
                setError(e instanceof Error ? e.message : String(e));
                setBusy(false);
              });
            }}
          >
            {t(lang, 'words.addNew')}
          </Button>
        )}
      </div>
    </div>
  );
}
