import { useEffect, useRef, useState } from 'react';
import { t, type Lang } from '@/core/i18n';
import type { ViewBlock } from '@/core/session/view';
import { Button } from '@/ui/components/ui/button';
import { Input } from '@/ui/components/ui/input';
import { GradedItem } from './GradedItem';
import { addField, fieldsFromLines, linesFromFields, snapToWords, type SpotField } from './spotFields';

/** A selection in one paragraph, snapped to words, with the flyout's position inside the block. */
type Pending = { key: string; index: number; text: string; start: number; end: number; top: number; left: number };

/** Error spotting: each paragraph with its fixes as fields (`wrong → right` per line), or, once graded, what was found. */
export function SpotBlock({ block, lang, values, onChange, graded }: {
  block: ViewBlock; lang: Lang; values: Record<string, string>; onChange: (key: string, value: string) => void; graded: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const flyout = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<{ key: string; index: number } | null>(null);
  /** Each paragraph's fields register their add here, so the flyout adds to the same local fields the inputs edit. */
  const adders = useRef<Record<string, AddField>>({});
  const register = (key: string, add: AddField) => {
    adders.current[key] = add;
    return () => { delete adders.current[key]; };
  };
  const [pending, setPending] = useState<Pending | null>(null);
  const [seenGraded, setSeenGraded] = useState(graded);
  if (graded !== seenGraded) {
    setSeenGraded(graded);
    if (graded) setPending(null);
  }

  useEffect(() => {
    if (graded) return;
    const onSelectionChange = () => {
      const sel = window.getSelection();
      const host = root.current;
      const clear = () => { if (document.activeElement !== flyout.current) setPending(null); };
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !host) return clear();
      const range = sel.getRangeAt(0);
      const found = block.paragraphs
        .map((p) => ({ index: p.index, el: document.getElementById(`para-${block.id}-${p.index}`) }))
        .find((x) => x.el && x.el.contains(range.startContainer) && x.el.contains(range.endContainer));
      if (!found?.el) return clear();
      const measure = (node: Node, offset: number) => {
        const r = document.createRange();
        r.selectNodeContents(found.el!);
        r.setEnd(node, offset);
        return r.toString().length;
      };
      const text = found.el.textContent ?? '';
      const snapped = snapToWords(text, measure(range.startContainer, range.startOffset), measure(range.endContainer, range.endOffset));
      if (!snapped) return clear();
      const rect = range.getBoundingClientRect();
      const origin = host.getBoundingClientRect();
      setPending({
        key: `${block.id}:${found.index}`, index: found.index, text, ...snapped,
        top: rect.top - origin.top - 40, left: rect.left - origin.left + rect.width / 2,
      });
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [block, graded]);

  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    root.current?.querySelectorAll<HTMLInputElement>(`input[data-spot-key="${target.key}"]`)[target.index]?.focus();
  });

  return (
    <div ref={root} className="relative flex flex-col gap-8">
      {pending && !graded && (
        <Button
          ref={flyout}
          type="button"
          size="sm"
          className="absolute z-10 -translate-x-1/2"
          style={{ top: pending.top, left: pending.left }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const add = adders.current[pending.key];
            if (add) focusAfter.current = { key: pending.key, index: add(pending.text.slice(pending.start, pending.end), pending.text) };
            window.getSelection()?.removeAllRanges();
            setPending(null);
          }}
        >
          {t(lang, 'spot.fix')}
        </Button>
      )}
      {block.paragraphs.map((p) => {
        const key = `${block.id}:${p.index}`;
        const labelId = `para-${key.replace(':', '-')}`;
        const counted = (p.errors ?? []).filter((e) => e.effective !== null);
        const found = counted.filter((e) => e.effective === 'correct').length;
        return (
          <div key={key}>
            <p id={labelId} className="reading">{p.text}</p>
            {graded ? (
              <>
                {counted.length > 0 && <p className="label mt-2 text-muted-foreground">{t(lang, 'spot.count', { found, total: counted.length })}</p>}
                {p.learnerText?.trim() && (
                  <div className="mt-3">
                    <p className="label text-faint">{t(lang, 'spot.lines')}</p>
                    <p className="answer mt-1 whitespace-pre-line text-muted-foreground">
                      {p.learnerText.split(/\r?\n/).filter((l) => l.trim() !== '').join('\n')}
                    </p>
                  </div>
                )}
                <ul className="mt-4 flex flex-col gap-3">
                  {(p.errors ?? []).map((e) => <GradedItem key={e.id} item={e} lang={lang} />)}
                </ul>
                {(p.extra ?? []).map((x, i) => (
                  <p key={i} className="reading mt-3 rounded-sm bg-note/10 px-3 py-2 text-note">
                    {t(lang, 'spot.notError', { text: x.text, explanation: x.explanation })}
                  </p>
                ))}
              </>
            ) : (
              <SpotFields
                fieldKey={key}
                labelId={labelId}
                lines={values[key] ?? ''}
                lang={lang}
                register={register}
                onChange={(lines) => onChange(key, lines)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The fields of one paragraph. Edits are kept here, not re-parsed from the draft on every keystroke: parsing trims a
 * line, so a space typed at the end of a fix would be lost. The draft is re-read only when it changes from outside.
 */
type AddField = (original: string, paragraph: string) => number;

function SpotFields({ fieldKey, labelId, lines, lang, register, onChange }: {
  fieldKey: string; labelId: string; lines: string; lang: Lang; register: (key: string, add: AddField) => () => void;
  onChange: (lines: string) => void;
}) {
  const [fields, setFields] = useState(() => fieldsFromLines(lines));
  const [seen, setSeen] = useState(lines);
  if (lines !== seen) {
    setSeen(lines);
    if (lines !== linesFromFields(fields)) setFields(fieldsFromLines(lines));
  }
  const update = (next: SpotField[]) => {
    setFields(next);
    onChange(linesFromFields(next));
  };
  const add: AddField = (original, paragraph) => {
    const added = addField(fields, paragraph, original);
    update(added.fields);
    return added.index;
  };
  useEffect(() => register(fieldKey, add));
  return (
    <div className="mt-3 flex flex-col gap-3">
      {fields.map((f, i) => {
        const fieldId = `${labelId}-field-${i}`;
        return (
          <div key={f.original} className="flex flex-col gap-1.5">
            <p id={fieldId} className="label text-faint">{t(lang, 'spot.was', { text: f.original })}</p>
            <div className="flex items-center gap-2">
              <Input
                data-spot-key={fieldKey}
                aria-labelledby={fieldId}
                value={f.fix}
                onChange={(e) => update(fields.map((x, j) => (j === i ? { ...x, fix: e.target.value } : x)))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t(lang, 'spot.remove')}
                onClick={() => update(fields.filter((_, j) => j !== i))}
              >
                ✕
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
