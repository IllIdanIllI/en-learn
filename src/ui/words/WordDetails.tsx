import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { t } from '@/core/i18n';
import { deleteWord, updateExercise } from '@/core/db/repos/words';
import type { WordView } from '@/core/words/practice';
import type { WordExercise } from '@/core/words/types';
import { useCore } from '@/ui/app/CoreProvider';
import { Button, buttonVariants } from '@/ui/components/ui/button';
import { Textarea } from '@/ui/components/ui/textarea';
import { Notice } from '@/ui/today/chips';
import { WordForm } from './WordForm';
import { useSavedFlag } from './useSavedFlag';
import { useWordsJob } from './WordsJobProvider';

function ExerciseEditor({ exercise, onSaved }: { exercise: WordExercise; onSaved: () => void }) {
  const { deps, lang } = useCore();
  const [prompt, setPrompt] = useState(exercise.prompt);
  const [answers, setAnswers] = useState(exercise.answers.join('\n'));
  const [error, setError] = useState<string | null>(null);
  const { saved, markSaved, clear } = useSavedFlag();
  const list = answers.split('\n').map((a) => a.trim()).filter((a) => a !== '');
  const changed = prompt !== exercise.prompt || list.join('\n') !== exercise.answers.join('\n');

  const save = async () => {
    setError(null);
    try {
      await updateExercise(deps.db, { ...exercise, prompt: prompt.trim(), answers: list });
      markSaved();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <li className="grid gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <span className="label text-muted-foreground">{t(lang, `words.ex.${exercise.type}`)}</span>
      <div>
        <label htmlFor={`ex-${exercise.id}-prompt`} className="label text-muted-foreground">{t(lang, 'words.ex.prompt')}</label>
        <Textarea id={`ex-${exercise.id}-prompt`} className="mt-1 min-h-0" rows={2} value={prompt} onChange={(e) => { setPrompt(e.target.value); clear(); }} />
      </div>
      <div>
        <label htmlFor={`ex-${exercise.id}-answers`} className="label text-muted-foreground">{t(lang, 'words.ex.answers')}</label>
        <Textarea id={`ex-${exercise.id}-answers`} className="mt-1 min-h-0" rows={Math.max(1, list.length)} value={answers} onChange={(e) => { setAnswers(e.target.value); clear(); }} />
      </div>
      {error !== null && <Notice>{t(lang, 'words.saveError', { message: error })}</Notice>}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={!changed || prompt.trim() === '' || list.length === 0} onClick={() => void save()}>
          {t(lang, 'words.save')}
        </Button>
        {saved && (
          <span role="status" className="inline-flex items-center gap-1 text-sm text-success">
            <Check aria-hidden className="size-4" />
            {t(lang, 'words.saved')}
          </span>
        )}
      </div>
    </li>
  );
}

/** A word's body: the word's fields, its exercises, and a bottom row with Back (only when backTo is given), Regenerate and Delete (with an inline confirmation). */
export function WordDetails({ view, onChanged, onDeleted, backTo }: { view: WordView; onChanged: () => void; onDeleted: () => void; backTo?: string }) {
  const { deps, lang } = useCore();
  const job = useWordsJob();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { word, exercises } = view;

  const remove = async () => {
    try {
      await deleteWord(deps.db, word.id);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConfirming(false);
    }
  };

  return (
    <div className="grid gap-6 py-2">
      <WordForm key={word.id} word={word} onSaved={onChanged} />
      <section>
        <h2 className="title">{t(lang, 'words.exercises')}</h2>
        {exercises.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t(lang, 'words.exercises.none')}</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {exercises.map((ex) => <ExerciseEditor key={ex.id} exercise={ex} onSaved={onChanged} />)}
          </ul>
        )}
      </section>
      {error !== null && <Notice>{t(lang, 'words.saveError', { message: error })}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        {backTo !== undefined && <Link to={backTo} className={buttonVariants({ variant: 'ghost' })}>{t(lang, 'word.back')}</Link>}
        <Button variant="secondary" disabled={job.running} onClick={() => job.run([word.id])}>{t(lang, 'words.regenerate')}</Button>
        {confirming ? (
          <span className="flex items-center gap-2 text-sm">
            {t(lang, 'words.delete.confirm')}
            <Button size="sm" variant="outline" onClick={() => void remove()}>{t(lang, 'words.delete.yes')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>{t(lang, 'words.delete.no')}</Button>
          </span>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming(true)}>{t(lang, 'words.delete')}</Button>
        )}
      </div>
    </div>
  );
}
