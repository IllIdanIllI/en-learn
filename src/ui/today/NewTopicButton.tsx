import { useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { t, type Lang } from '@/core/i18n';
import { newEssayPrompt } from '@/core/writing/topic';
import type { Deps } from '@/core/ports';
import { logDebug } from '@/ui/debug/debugLog';
import { useGeneration } from '@/ui/app/GenerationProvider';
import { Button } from '@/ui/components/ui/button';
import { Notice } from './chips';

/**
 * "Новая тема" under the prompt of an open essay. With text in the editor a dialog asks first; Keep or Clear
 * start the request, and `onChanged(clear)` runs when the new prompt is saved, so the page reloads the block.
 */
export function NewTopicButton({ deps, blockId, hasText, lang, onChanged }: {
  deps: Deps; blockId: number; hasText: boolean; lang: Lang; onChanged: (clear: boolean) => void;
}) {
  const { running } = useGeneration();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set at once on a press, so a second click before the state renders sends no request.
  const pressed = useRef(false);
  const button = useRef<HTMLButtonElement>(null);

  const start = async (clear: boolean) => {
    if (pressed.current || running) return;
    pressed.current = true;
    setBusy(true);
    setError(null);
    let message: string | null = null;
    try {
      const res = await newEssayPrompt(deps, blockId);
      if (res.ok) {
        logDebug('writing', 'new topic ok');
        onChanged(clear);
      } else message = res.message;
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    } finally {
      pressed.current = false;
      setBusy(false);
    }
    if (message !== null) {
      logDebug('writing', `new topic error ${message}`);
      setError(message);
    }
  };

  const press = () => {
    if (hasText) setConfirming(true);
    else void start(false);
  };

  return (
    <div className="mt-3">
      <Button ref={button} variant="ghost" size="sm" disabled={busy || running} onClick={press}>
        {busy ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw aria-hidden />}
        {t(lang, busy ? 'writing.newTopic.busy' : 'writing.newTopic')}
      </Button>
      {error !== null && <Notice className="mt-2">{t(lang, 'writing.newTopic.error', { message: error })}</Notice>}
      <Dialog.Root open={confirming} onOpenChange={setConfirming}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70" />
          <Dialog.Content
            aria-describedby={undefined}
            // Closing returns the focus to the button, also after Keep or Clear.
            onCloseAutoFocus={(e) => { e.preventDefault(); button.current?.focus(); }}
            className="fixed top-1/2 left-1/2 z-50 flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-md border border-border bg-background p-6 text-foreground"
          >
            <Dialog.Title className="title">{t(lang, 'writing.newTopic.confirm')}</Dialog.Title>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirming(false)}>{t(lang, 'writing.newTopic.cancel')}</Button>
              <Button variant="outline" onClick={() => { setConfirming(false); void start(false); }}>{t(lang, 'writing.newTopic.keep')}</Button>
              <Button onClick={() => { setConfirming(false); void start(true); }}>{t(lang, 'writing.newTopic.clear')}</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
