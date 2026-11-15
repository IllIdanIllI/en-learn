import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Volume2, X } from 'lucide-react';
import { t, type Lang } from '@/core/i18n';
import { dictMatches } from '@/core/words/dictionary';
import type { Word } from '@/core/words/types';
import { ExternalLink } from '@/ui/components/ExternalLink';
import { Button } from '@/ui/components/ui/button';
import { useVoice } from '@/ui/voice/VoiceProvider';
import { canSpeak, cancelSpeech, speak, type SpellingVariant } from './speech';

export interface WordCardProps {
  word: Word;
  lang: Lang;
  spelling: SpellingVariant;
  /** Given on a word card before its answer; the feedback view leaves the two buttons out. */
  onKnown?: () => void;
  onRemove?: () => void;
  /** Known and Remove are off while a result is being saved. */
  busy?: boolean;
}

// The example with every whole-word occurrence of the word in bold (case-insensitive).
function Example({ text, word }: { text: string; word: string }) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = word.trim() === '' ? [text] : text.split(new RegExp(`(\\b${escaped}\\b)`, 'gi'));
  return <>{parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}</>;
}

/** The dictionary line under a word: its kaikki translations, and a warning when the translation is not among them. Russian only. */
export function DictLine({ word, lang }: { word: Word; lang: Lang }) {
  if (lang !== 'ru' || word.dict.checked !== 'found') return null;
  const warn = word.translation.trim() !== '' && !dictMatches(word.translation, word.dict.translations);
  return (
    <div className="grid gap-1 text-sm text-muted-foreground">
      <p>
        {t(lang, 'words.dict', { list: word.dict.translations.join(', ') })}{' '}
        <ExternalLink
          href={`https://en.wiktionary.org/wiki/${encodeURIComponent(word.word.replaceAll(' ', '_'))}`}
          className="text-primary underline underline-offset-2"
        >
          {t(lang, 'words.dict.link')}
        </ExternalLink>
      </p>
      {warn && (
        <p className="flex items-center gap-1.5 text-destructive">
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
          {t(lang, 'words.dict.warn')}
        </p>
      )}
    </div>
  );
}

/** A word in the Skyeng layout: the word on a coloured band with its translation, then transcription, definition and example. */
export function WordCard({ word, lang, spelling, onKnown, onRemove, busy = false }: WordCardProps) {
  const [confirming, setConfirming] = useState(false);
  const voice = useVoice();
  // The speakers show with the Kokoro voice, or with the system voice when the browser can speak.
  const speech = voice !== null || canSpeak();
  // A card that goes away stops its speech, so the word is not read over the next card.
  useEffect(() => () => {
    if (voice) voice.stop();
    else if (canSpeak()) cancelSpeech();
  }, [voice]);
  // The card's texts are synthesised in the background once the voice is ready, so a press plays at once.
  useEffect(() => {
    if (!voice) return;
    voice.prefetch(word.word, spelling);
    if (word.example !== '') voice.prefetch(word.example, spelling);
  }, [voice, word.word, word.example, spelling]);
  const meta = [word.transcription, word.partOfSpeech].filter((p) => p !== '').join(' · ');
  const speaker = (text: string) => (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0 text-current hover:bg-white/10"
      aria-label={t(lang, 'words.speak')}
      onClick={() => (voice ? voice.speak(text, spelling) : speak(text, spelling))}
    >
      <Volume2 aria-hidden />
    </Button>
  );

  return (
    <div className="grid gap-4">
      <div className="rounded-lg bg-primary p-5 text-primary-foreground">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="answer block text-3xl font-semibold">{word.word}</span>
            {word.translation !== '' && <p className="mt-1 text-lg">{word.translation}</p>}
          </div>
          {speech && speaker(word.word)}
        </div>
      </div>
      {meta !== '' && <p className="text-sm text-muted-foreground">{meta}</p>}
      {word.definition !== '' && <p className="reading">{word.definition}</p>}
      {word.example !== '' && (
        <div className="flex items-start justify-between gap-3">
          <p className="text-muted-foreground">
            <Example text={word.example} word={word.word} />
          </p>
          {speech && speaker(word.example)}
        </div>
      )}
      <DictLine word={word} lang={lang} />
      {onKnown !== undefined && (
        <div>
          <Button variant="ghost" disabled={busy} onClick={onKnown}>
            <Check aria-hidden />
            {t(lang, 'words.known')}
          </Button>
        </div>
      )}
      {onRemove !== undefined && (
        <div>
          {confirming ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              {t(lang, 'words.remove.confirm')}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onRemove()}>{t(lang, 'words.delete.yes')}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>{t(lang, 'words.delete.no')}</Button>
            </span>
          ) : (
            <Button variant="ghost" disabled={busy} onClick={() => setConfirming(true)}>
              <X aria-hidden />
              {t(lang, 'words.remove')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
