import { useEffect, useRef, useState } from 'react';
import { t } from '@/core/i18n';
import { Button } from '@/ui/components/ui/button';
import { useCore } from '@/ui/app/CoreProvider';
import { useSavedFlag } from '@/ui/words/useSavedFlag';
import { debugLog } from './debugLog';
import { copyText } from './useCopyLogShortcut';

/** Settings section: the count of log entries, Copy, Show/Hide and Clear, with the log as read-only text. */
export function DebugLogSection() {
  const { lang } = useCore();
  const [count, setCount] = useState(() => debugLog.count());
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [manual, setManual] = useState(false);
  const copied = useSavedFlag(2000);
  const area = useRef<HTMLTextAreaElement>(null);

  // After a failed copy the text area opens with the log selected, for copying by hand.
  useEffect(() => {
    const el = area.current;
    if (manual && open && el) {
      el.focus();
      el.setSelectionRange(0, el.value.length);
    }
  }, [manual, open, text]);

  const copy = async () => {
    const ok = await copyText(debugLog.text());
    setCount(debugLog.count());
    if (ok) {
      setManual(false);
      copied.markSaved();
      return;
    }
    setText(debugLog.text());
    setOpen(true);
    setManual(true);
  };

  const show = () => {
    setText(debugLog.text());
    setCount(debugLog.count());
    setOpen(true);
  };

  const hide = () => {
    setOpen(false);
    setManual(false);
  };

  const clear = () => {
    debugLog.clear();
    debugLog.flush();
    setCount(debugLog.count());
    setText(debugLog.text());
  };

  return (
    <>
      <h2 className="title mt-10">{t(lang, 'settings.debug')}</h2>
      <p className="label mt-0.5 text-muted-foreground">{t(lang, 'settings.debug.count', { n: count })}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void copy()}>
          {t(lang, 'settings.debug.copy')}
        </Button>
        <Button variant="ghost" onClick={open ? hide : show}>
          {open ? t(lang, 'settings.debug.hide') : t(lang, 'settings.debug.show')}
        </Button>
        <Button variant="ghost" onClick={clear}>
          {t(lang, 'settings.debug.clear')}
        </Button>
        {copied.saved && (
          <span role="status" className="label text-muted-foreground">
            {t(lang, 'settings.debug.copied')}
          </span>
        )}
      </div>
      {manual && <p className="label mt-3 text-muted-foreground">{t(lang, 'settings.debug.manual')}</p>}
      {open && (
        <textarea
          ref={area}
          readOnly
          rows={12}
          value={text}
          aria-label={t(lang, 'settings.debug')}
          spellCheck={false}
          className="mt-3 w-full rounded-sm border border-border bg-input px-2.5 py-1.5 font-mono text-xs text-foreground outline-none"
        />
      )}
    </>
  );
}
