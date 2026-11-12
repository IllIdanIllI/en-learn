import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { t } from '@/core/i18n';
import { extraNewFor } from '@/core/words/queue';
import { getSettings } from '@/core/db/repos/settings';
import { addExtraNew, loadWordViews, wordsOverview, type WordView } from '@/core/words/practice';
import type { Stage } from '@/core/words/types';
import { cn } from '@/lib/utils';
import { useCore } from '@/ui/app/CoreProvider';
import { useLoaded } from '@/ui/app/useLoaded';
import { Button, buttonVariants } from '@/ui/components/ui/button';
import { FieldInput } from '@/ui/components/ui/field-input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/ui/table';
import { Notice } from '@/ui/today/chips';
import { ImportPanel } from '@/ui/words/ImportPanel';
import { WordForm } from '@/ui/words/WordForm';
import { WordsSummary } from '@/ui/words/WordsSummary';
import { useWordsJob } from '@/ui/words/WordsJobProvider';

type Panel = 'add' | 'import' | null;

function StageChip({ stage, label }: { stage: Stage; label: string }) {
  return (
    <span className={cn('label rounded-sm px-1.5 py-0.5', stage === 4 ? 'bg-success/15 text-success' : 'bg-input text-muted-foreground')}>{label}</span>
  );
}

export function Words() {
  const { deps, lang } = useCore();
  const job = useWordsJob();
  const today = deps.clock.today();
  const [reload, setReload] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const loaded = useLoaded(async () => {
    const { wordsExtraNew } = await getSettings(deps.db);
    return { views: await loadWordViews(deps.db), overview: await wordsOverview(deps.db, today, extraNewFor(wordsExtraNew, today)) };
  }, `${job.version}-${reload}`);
  const changed = () => setReload((n) => n + 1);
  const views = loaded && 'data' in loaded ? loaded.data.views : null;
  const existing = useMemo(() => (views ?? []).map((v) => v.word.word), [views]);

  const needle = search.trim().toLowerCase();
  const shown = (views ?? []).filter(
    (v: WordView) =>
      needle === '' ||
      [v.word.word, v.word.translation, v.word.definition].some((s) => s.toLowerCase().includes(needle)),
  );
  const togglePanel = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));

  return (
    <>
      <h1 className="headline">{t(lang, 'nav.words')}</h1>
      {loaded && 'error' in loaded && <Notice className="mt-6">{t(lang, 'words.loadError', { message: loaded.error })}</Notice>}
      {addError && <Notice className="mt-6">{t(lang, 'words.saveError', { message: addError })}</Notice>}
      {job.busy && <Notice className="mt-6">{t(lang, 'words.busy')}</Notice>}
      {job.error && <Notice className="mt-6">{job.error.message}</Notice>}
      {loaded && 'data' in loaded && (() => {
        const { overview } = loaded.data;
        const { newAvailable, reviewAvailable, canAddNew } = overview;
        const training = (mode: 'new' | 'review', count: number, label: string) =>
          count > 0 ? (
            <Link to={`/words/practice?mode=${mode}`} className={buttonVariants()}>{label}</Link>
          ) : (
            <a aria-disabled="true" className={cn(buttonVariants(), 'cursor-not-allowed opacity-50')}>{label}</a>
          );
        return (
          <div className="mt-6">
            <div className="flex flex-wrap items-center gap-3">
              {training('new', newAvailable, t(lang, 'words.startNew', { n: newAvailable }))}
              {training('review', reviewAvailable, t(lang, 'words.startReview', { n: reviewAvailable }))}
              {canAddNew && (
                <Button
                  variant="secondary"
                  disabled={adding}
                  onClick={() => {
                    setAdding(true);
                    setAddError(null);
                    addExtraNew(deps.db, today).then(
                      () => navigate('/words/practice?mode=new'),
                      (e: unknown) => {
                        setAddError(e instanceof Error ? e.message : String(e));
                        setAdding(false);
                      },
                    );
                  }}
                >
                  {t(lang, 'words.addNew')}
                </Button>
              )}
            </div>
            <WordsSummary overview={overview} lang={lang} />
          </div>
        );
      })()}
      {job.progress && (
        <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
          {t(lang, 'words.progress', { done: job.progress.done, total: job.progress.total })}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <Button variant="secondary" aria-expanded={panel === 'add'} onClick={() => togglePanel('add')}>{t(lang, 'words.add')}</Button>
        <Button variant="secondary" aria-expanded={panel === 'import'} onClick={() => togglePanel('import')}>{t(lang, 'words.import')}</Button>
        <div className="w-64">
          <label htmlFor="words-search" className="label text-muted-foreground">{t(lang, 'words.search')}</label>
          <FieldInput
            id="words-search"
            type="search"
            className="mt-1"
            placeholder={t(lang, 'words.search.placeholder')}
            value={search}
            onChange={(e) => setParams(e.target.value === '' ? {} : { q: e.target.value }, { replace: true })}
          />
        </div>
      </div>
      {panel === 'add' && (
        <div className="mt-4 rounded-md bg-card p-4">
          <WordForm onSaved={changed} onCancel={() => setPanel(null)} />
        </div>
      )}
      {panel === 'import' && (
        <div className="mt-4 rounded-md bg-card p-4">
          <ImportPanel
            existing={existing}
            onChanged={changed}
            onImported={() => {
              changed();
              setPanel(null);
            }}
            onCancel={() => setPanel(null)}
          />
        </div>
      )}
      {views && views.length === 0 && <p className="reading mt-6 text-muted-foreground">{t(lang, 'words.empty')}</p>}
      {views && views.length > 0 && shown.length === 0 && <p className="reading mt-6 text-muted-foreground">{t(lang, 'words.noMatch')}</p>}
      {views && shown.length > 0 && (
        <Table className="mt-6">
          <TableHeader>
            <TableRow>
              <TableHead>{t(lang, 'words.col.word')}</TableHead>
              <TableHead>{t(lang, 'words.col.translation')}</TableHead>
              <TableHead>{t(lang, 'words.col.stage')}</TableHead>
              <TableHead>{t(lang, 'words.col.next')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((v) => {
              const creating = job.active.has(v.word.id);
              const failed = !creating && v.word.generation !== 'ready';
              return (
                <TableRow key={v.word.id}>
                  <TableCell>
                    <Link
                      to={`/words/${v.word.id}`}
                      state={{ q: search }}
                      className="answer text-left hover:underline"
                    >
                      {v.word.word}
                    </Link>
                    {creating && <div className="mt-1 text-sm text-muted-foreground">{t(lang, 'words.creating')}</div>}
                    {failed && (
                      <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                        {t(lang, 'words.notCreated')}
                        <Button size="sm" variant="outline" onClick={() => job.run([v.word.id])}>{t(lang, 'words.retry')}</Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{v.word.translation}</TableCell>
                  <TableCell><StageChip stage={v.state.stage} label={t(lang, `words.stage.${v.state.stage}`)} /></TableCell>
                  <TableCell className="tabular whitespace-nowrap text-muted-foreground">{v.state.due ?? t(lang, 'words.new')}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </>
  );
}
