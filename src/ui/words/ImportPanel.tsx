import { useMemo, useState } from 'react';
import { t } from '@/core/i18n';
import { DuplicateWord, insertWord } from '@/core/db/repos/words';
import { importPreview, parseObsidian } from '@/core/words/importParse';
import { useCore } from '@/ui/app/CoreProvider';
import { Button } from '@/ui/components/ui/button';
import { Textarea } from '@/ui/components/ui/textarea';
import { Notice } from '@/ui/today/chips';
import { useWordsJob } from './WordsJobProvider';

/** Pasted Obsidian cards with a live preview; importing stores the new words and starts their generation. */
export function ImportPanel({ existing, onImported, onCancel }: { existing: string[]; onImported: () => void; onCancel: () => void }) {
  const { deps, lang } = useCore();
  const job = useWordsJob();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const preview = useMemo(() => (text.trim() === '' ? null : importPreview(parseObsidian(text), existing)), [text, existing]);
  const count = preview?.toImport.length ?? 0;

  const doImport = async () => {
    if (!preview || count === 0 || saving) return;
    setSaving(true);
    setError(null);
    const today = deps.clock.today();
    const ids: number[] = [];
    try {
      for (const { fields } of preview.toImport) {
        try {
          const id = await insertWord(
            deps.db,
            {
              word: fields.word,
              definition: fields.definition ?? '',
              translation: fields.translation ?? '',
              example: fields.example ?? '',
              synonyms: fields.synonyms ?? [],
              link: fields.link ?? '',
              added: fields.added || today,
            },
            deps.clock.now(),
          );
          ids.push(id);
        } catch (e) {
          if (!(e instanceof DuplicateWord)) throw e;
        }
      }
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (ids.length > 0) {
        job.run(ids);
        onImported();
      }
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div>
        <label htmlFor="words-import" className="label text-muted-foreground">{t(lang, 'words.import.label')}</label>
        <Textarea id="words-import" className="mt-1 min-h-40" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {preview && (
        <div>
          <p className="text-sm">
            {t(lang, 'words.import.preview', { n: preview.toImport.length + preview.duplicates, k: preview.duplicates, m: preview.problems.length })}
          </p>
          {preview.problems.length > 0 && (
            <ul className="mt-1 text-sm text-muted-foreground">
              {preview.problems.map((p) => <li key={p.index}>{t(lang, 'words.import.problem', { n: p.index })}</li>)}
            </ul>
          )}
        </div>
      )}
      {error !== null && <Notice>{t(lang, 'words.saveError', { message: error })}</Notice>}
      <div className="flex gap-2">
        <Button type="button" onClick={() => void doImport()} disabled={count === 0 || saving}>{t(lang, 'words.import.go', { n: count })}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{t(lang, 'words.cancel')}</Button>
      </div>
    </div>
  );
}
