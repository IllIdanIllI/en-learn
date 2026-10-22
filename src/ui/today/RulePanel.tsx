import { useEffect, useRef, useState } from 'react';
import { t, type Lang } from '@/core/i18n';
import type { Source } from '@/core/llm/types';
import { getRule } from '@/core/db/repos/rules';
import { useCore } from '@/ui/app/CoreProvider';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/ui/components/ui/sheet';
import { RuleBody } from './RuleBody';
import { Notice } from './chips';

/** `opener` is the element that opened the panel; focus returns to it on close. */
export interface RuleTarget { ruleId: number; topicId: number | null; section: string; opener: HTMLElement | null }

type Loaded = { title: string; body: string; version: number };

export function SourceList({ sources, lang }: { sources: Source[]; lang: Lang }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-4">
      <h4 className="label text-muted-foreground">{t(lang, 'rule.sources')}</h4>
      <ul className="mt-1 flex flex-col gap-0.5">
        {sources.map((s) => (
          <li key={s.url}>
            {s.title} <span className="label text-faint">{s.url}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The rule in a right side panel. It is a non-modal dialog: no overlay, no focus trap, the page behind stays
 * scrollable and clickable (the content column makes room while it is open, see globals.css).
 */
export function RulePanel({ target, onClose }: { target: RuleTarget | null; onClose: () => void }) {
  const { deps, lang } = useCore();
  const [rule, setRule] = useState<{ id: number; value: Loaded } | { id: number; error: string } | null>(null);

  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (target) opener.current = target.opener;
  }, [target]);

  const id = target?.ruleId ?? null;
  useEffect(() => {
    if (id === null) return;
    let live = true;
    (async () => {
      const [current, title] = await Promise.all([
        getRule(deps.db, id),
        deps.db.select<{ title: string }>('SELECT t.title AS title FROM rule r JOIN topic t ON t.id = r.topic_id WHERE r.id = ?', [id]),
      ]);
      return { title: title[0]?.title ?? '', ...current };
    })().then(
      (value) => {
        if (live) setRule({ id, value });
      },
      (e: unknown) => {
        if (live) setRule({ id, error: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [deps, id]);

  useEffect(() => {
    if (id === null) return;
    document.documentElement.dataset.rulePanel = 'open';
    return () => {
      delete document.documentElement.dataset.rulePanel;
    };
  }, [id]);

  const current = rule && rule.id === id ? rule : null;

  return (
    <Sheet modal={false} open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        closeLabel={t(lang, 'rule.close')}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (opener.current?.isConnected) opener.current.focus();
        }}
        className="overflow-y-auto"
      >
        <SheetHeader className="pr-8">
          <SheetTitle>{current && 'value' in current ? current.value.title : ''}</SheetTitle>
          <SheetDescription className="label">
            {current && 'value' in current ? t(lang, 'rule.version', { n: current.value.version }) : ''}
          </SheetDescription>
        </SheetHeader>
        {current && 'error' in current && <Notice>{t(lang, 'rule.loadError', { message: current.error })}</Notice>}
        {current && 'value' in current && (
          <RuleBody body={current.value.body} section={target?.section} />
        )}
      </SheetContent>
    </Sheet>
  );
}
