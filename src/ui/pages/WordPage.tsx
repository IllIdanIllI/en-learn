import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { t } from '@/core/i18n';
import { loadWordViews } from '@/core/words/practice';
import { useCore } from '@/ui/app/CoreProvider';
import { useLoaded } from '@/ui/app/useLoaded';
import { Notice } from '@/ui/today/chips';
import { WordDetails } from '@/ui/words/WordDetails';
import { useWordsJob } from '@/ui/words/WordsJobProvider';

/** One word: its fields, exercises, Regenerate and Delete. Back returns to the list with the search the learner had. */
export function WordPage() {
  const { id } = useParams();
  const wordId = Number(id);
  const { deps, lang } = useCore();
  const job = useWordsJob();
  const navigate = useNavigate();
  const [reload, setReload] = useState(0);
  const q = (useLocation().state as { q?: string } | null)?.q;
  const backTo = q ? `/words?q=${encodeURIComponent(q)}` : '/words';

  const loaded = useLoaded(async () => (Number.isInteger(wordId) ? (await loadWordViews(deps.db)).find((v) => v.word.id === wordId) ?? null : null), `${job.version}-${reload}`);

  const back = (
    <Link to={backTo} aria-label={t(lang, 'word.backAria')} className="inline-flex text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-5" aria-hidden="true" />
    </Link>
  );
  if (loaded === null) return back;
  if ('error' in loaded) {
    return (
      <>
        {back}
        <Notice className="mt-6">{t(lang, 'words.loadError', { message: loaded.error })}</Notice>
      </>
    );
  }
  const view = loaded.data;
  if (view === null) {
    return (
      <>
        {back}
        <p className="reading mt-6 text-muted-foreground">{t(lang, 'word.notFound')}</p>
      </>
    );
  }
  return (
    <>
      {back}
      <h1 className="headline mt-4">{view.word.word}</h1>
      {job.active.has(view.word.id) && <p className="mt-2 text-sm text-muted-foreground">{t(lang, 'words.creating')}</p>}
      <div className="mt-6">
        <WordDetails view={view} onChanged={() => setReload((n) => n + 1)} onDeleted={() => navigate(backTo, { replace: true })} backTo={backTo} />
      </div>
    </>
  );
}
