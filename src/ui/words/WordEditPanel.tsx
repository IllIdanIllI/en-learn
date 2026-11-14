import { useRef, useState } from 'react';
import { t } from '@/core/i18n';
import { loadWordViews, type WordView } from '@/core/words/practice';
import { useCore } from '@/ui/app/CoreProvider';
import { useLoaded } from '@/ui/app/useLoaded';
import { Sheet, SheetContent, SheetTitle } from '@/ui/components/ui/sheet';
import { Notice } from '@/ui/today/chips';
import { WordDetails } from './WordDetails';
import { useWordsJob } from './WordsJobProvider';

/** A word's details in a modal right side panel, opened from a training. Esc, the close button or a click outside closes it. */
export function WordEditPanel({ wordId, onClose, onDeleted }: { wordId: number | null; onClose(): void; onDeleted(id: number): void }) {
  const { deps, lang } = useCore();
  const job = useWordsJob();
  const [reload, setReload] = useState(0);
  // The element that had focus when the panel opened (the card's Edit word button): focus returns to it.
  const opener = useRef<HTMLElement | null>(null);
  const loaded = useLoaded(
    async () => (wordId === null ? null : ((await loadWordViews(deps.db)).find((v) => v.word.id === wordId) ?? null)),
    `${wordId}-${reload}-${job.version}`,
  );
  // A view of another word (still loading) is not shown.
  const view: WordView | null = loaded !== null && 'data' in loaded && loaded.data?.word.id === wordId ? loaded.data : null;

  return (
    <Sheet open={wordId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="overflow-y-auto"
        closeLabel={t(lang, 'words.edit.close')}
        onOpenAutoFocus={() => {
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (opener.current?.isConnected) opener.current.focus();
        }}
        // Radix would also close through onOpenChange; one close is enough.
        onInteractOutside={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        <SheetTitle>{view?.word.word ?? ''}</SheetTitle>
        {loaded !== null && 'error' in loaded && <Notice>{t(lang, 'words.loadError', { message: loaded.error })}</Notice>}
        {view !== null && (
          <WordDetails view={view} onChanged={() => setReload((n) => n + 1)} onDeleted={() => onDeleted(view.word.id)} />
        )}
      </SheetContent>
    </Sheet>
  );
}
