import { useState } from 'react';
import { t } from '@/core/i18n';
import { DuplicateWord, insertWord, updateWord } from '@/core/db/repos/words';
import { wordLink } from '@/core/words/link';
import type { Word, WordFields } from '@/core/words/types';
import { useCore } from '@/ui/app/CoreProvider';
import { Button } from '@/ui/components/ui/button';
import { ExternalLink } from '@/ui/components/ExternalLink';
import { FieldInput } from '@/ui/components/ui/field-input';
import { Textarea } from '@/ui/components/ui/textarea';
import { Notice } from '@/ui/today/chips';
import { useWordsJob } from './WordsJobProvider';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Add (no `word`) or edit a word. Only the word is required; a new word starts a words job for itself. */
export function WordForm({ word, onSaved, onCancel }: { word?: Word; onSaved: () => void; onCancel?: () => void }) {
  const { deps, lang } = useCore();
  const job = useWordsJob();
  const [text, setText] = useState(word?.word ?? '');
  const [translation, setTranslation] = useState(word?.translation ?? '');
  const [definition, setDefinition] = useState(word?.definition ?? '');
  const [example, setExample] = useState(word?.example ?? '');
  const [synonyms, setSynonyms] = useState((word?.synonyms ?? []).join(', '));
  const [link, setLink] = useState(word?.link ?? '');
  const [added, setAdded] = useState(word?.added ?? deps.clock.today());
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = text.trim();
    if (name === '' || saving) return;
    const fields: WordFields = {
      word: name,
      definition: definition.trim(),
      translation: translation.trim(),
      example: example.trim(),
      synonyms: synonyms.split(',').map((s) => s.trim()).filter((s) => s !== ''),
      link: link.trim(),
      added: ISO.test(added) ? added : (word?.added ?? deps.clock.today()),
    };
    setSaving(true);
    setError(null);
    setDuplicate(false);
    try {
      if (word) {
        await updateWord(deps.db, word.id, fields);
      } else {
        const id = await insertWord(deps.db, fields, deps.clock.now());
        job.run([id]);
      }
      onSaved();
      if (!word) {
        setText('');
        setTranslation('');
        setDefinition('');
        setExample('');
        setSynonyms('');
        setLink('');
      }
    } catch (err) {
      if (err instanceof DuplicateWord) setDuplicate(true);
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const id = word ? `word-${word.id}` : 'word-new';
  const field = (key: string, label: string, value: string, set: (v: string) => void, extra?: { type?: string; required?: boolean; invalid?: boolean; area?: boolean; dictionary?: boolean }) => (
    <div>
      <div>
        <label htmlFor={`${id}-${key}`} className="label text-muted-foreground">{label}</label>
        {extra?.dictionary && text.trim() !== '' && (
          <span className="label text-muted-foreground">
            {' ('}
            <ExternalLink href={wordLink(text.trim(), link)} className="text-primary underline underline-offset-2">{t(lang, 'words.openLinkShort')}</ExternalLink>
            {')'}
          </span>
        )}
      </div>
      {extra?.area ? (
        <Textarea id={`${id}-${key}`} className="mt-1 min-h-0 resize-y" rows={3} value={value} onChange={(e) => set(e.target.value)} />
      ) : (
        <FieldInput
          id={`${id}-${key}`}
          className="mt-1"
          value={value}
          onChange={(e) => set(e.target.value)}
          type={extra?.type}
          required={extra?.required}
          aria-invalid={extra?.invalid || undefined}
        />
      )}
    </div>
  );

  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      <div>
        {field('word', t(lang, 'words.field.word'), text, (v) => { setText(v); setDuplicate(false); }, { required: true, invalid: duplicate })}
        {duplicate && <p role="alert" className="mt-1 text-sm text-destructive">{t(lang, 'words.duplicate')}</p>}
      </div>
      {field('translation', t(lang, 'words.field.translation'), translation, setTranslation)}
      {field('definition', t(lang, 'words.field.definition'), definition, setDefinition, { area: true })}
      {field('example', t(lang, 'words.field.example'), example, setExample, { area: true })}
      {field('synonyms', t(lang, 'words.field.synonyms'), synonyms, setSynonyms)}
      {field('link', t(lang, 'words.field.link'), link, setLink, { dictionary: true })}
      {word && field('added', t(lang, 'words.field.added'), added, setAdded, { type: 'date' })}
      {error !== null && <Notice className="sm:col-span-2">{t(lang, 'words.saveError', { message: error })}</Notice>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={text.trim() === '' || saving}>{t(lang, 'words.save')}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{t(lang, 'words.cancel')}</Button>}
      </div>
    </form>
  );
}
