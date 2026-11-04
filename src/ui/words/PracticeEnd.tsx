import { Link } from 'react-router-dom';
import { t } from '@/core/i18n';
import type { Stage } from '@/core/words/types';
import { useCore } from '@/ui/app/CoreProvider';
import { Button, buttonVariants } from '@/ui/components/ui/button';

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

export function PracticeEnd({ correct, total, up, down, canContinue, onContinue }: {
  correct: number; total: number; up: Change[]; down: Change[]; canContinue: boolean; onContinue: () => void;
}) {
  const { lang } = useCore();
  return (
    <div data-testid="practice-end">
      <h1 className="headline">{t(lang, 'words.done', { x: correct, y: total })}</h1>
      <Changes title={t(lang, 'words.up')} list={up} />
      <Changes title={t(lang, 'words.down')} list={down} />
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/words" className={buttonVariants({ variant: 'secondary' })}>{t(lang, 'words.back')}</Link>
        {canContinue && <Button onClick={onContinue}>{t(lang, 'words.more')}</Button>}
      </div>
    </div>
  );
}
