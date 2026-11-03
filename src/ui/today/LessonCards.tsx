import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { t, type Lang, type MessageKey } from '@/core/i18n';
import type { ExtendOptions, LessonChoice, LessonOptions, RowReason, TaskFormat } from '@/core/session/choice';

type CardKey = 'review' | 'gap' | 'fix' | 'spot' | 'spelling' | 'speaking' | 'writing' | 'rewrite';
const FORMATS: TaskFormat[] = ['gap', 'fix', 'spot'];
type CardReason = RowReason | 'light';
const REASON_KEY: Record<CardReason, MessageKey> = {
  no_week_topic: 'picker.reason.no_week_topic',
  no_rule: 'picker.reason.no_rule',
  no_topics: 'picker.reason.no_topics',
  no_text: 'picker.reason.no_text',
  light: 'picker.reason.light',
};

/** The round the learner adds: the ticked task formats and whether it ends with an essay. */
export interface AddRound { formats: TaskFormat[]; writing: boolean }

/** One card: a toggle button with the title, a one-line example and a description. An unavailable card (one with a reason) is dimmed and shows its reason instead of the example. */
function Card({ lang, id, reason, selected, disabled, onToggle }: {
  lang: Lang; id: CardKey; reason?: CardReason | null; selected: boolean; disabled: boolean; onToggle: () => void;
}) {
  const off = reason !== undefined && reason !== null;
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled || off}
      onClick={onToggle}
      className={`relative flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 hover:border-faint disabled:opacity-50 disabled:hover:border-border ${
        selected ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-muted'
      }`}
    >
      <span className="pr-6 font-semibold">{t(lang, `picker.card.${id}.title` as MessageKey)}</span>
      {reason ? (
        <span className="label text-faint">{t(lang, REASON_KEY[reason])}</span>
      ) : (
        !off && <span className="reading text-[0.8125rem] leading-normal text-muted-foreground">{t(lang, `picker.card.${id}.example` as MessageKey)}</span>
      )}
      {!off && <span className="label font-normal text-faint">{t(lang, `picker.card.${id}.desc` as MessageKey)}</span>}
      {selected && (
        <span aria-hidden className="absolute top-2 right-2.5 flex size-[18px] items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" strokeWidth={1.5} aria-hidden />
        </span>
      )}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="[&:not(:first-child)]:mt-4">
      <h3 className="label mb-2 tracking-wider text-faint uppercase">{title}</h3>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

/** The cards before a lesson, in three groups: review (when shown), the task formats, and spelling, speaking, writing and rewrite. */
export function LessonCards({ lang, options, value, light, disabled, onChange }: {
  lang: Lang; options: LessonOptions; value: LessonChoice; light: boolean; disabled: boolean; onChange: (value: LessonChoice) => void;
}) {
  const flip = (f: TaskFormat) => onChange({ ...value, formats: FORMATS.filter((x) => (x === f ? !value.formats.includes(f) : value.formats.includes(x))) });
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      {options.reviewAvailable && (
        <Group title={t(lang, 'picker.group.review')}>
          <Card lang={lang} id="review" selected={value.review} disabled={disabled} onToggle={() => onChange({ ...value, review: !value.review })} />
        </Group>
      )}
      <Group title={t(lang, 'picker.group.tasks')}>
        {FORMATS.map((f) => (
          <Card key={f} lang={lang} id={f} reason={options.formats[f]} selected={value.formats.includes(f)} disabled={disabled} onToggle={() => flip(f)} />
        ))}
      </Group>
      <Group title={t(lang, 'picker.group.more')}>
        <Card lang={lang} id="spelling" selected={value.spelling} disabled={disabled} onToggle={() => onChange({ ...value, spelling: !value.spelling })} />
        <Card lang={lang} id="speaking" selected={value.speaking} disabled={disabled} onToggle={() => onChange({ ...value, speaking: !value.speaking })} />
        <Card lang={lang} id="writing" reason={light ? 'light' : null} selected={value.writing} disabled={disabled} onToggle={() => onChange({ ...value, writing: !value.writing })} />
        <Card lang={lang} id="rewrite" reason={light ? 'light' : options.rewriteReason} selected={value.rewrite} disabled={disabled} onToggle={() => onChange({ ...value, rewrite: !value.rewrite })} />
      </Group>
    </div>
  );
}

/** The cards of the added round: the three task formats and writing (unavailable on a light session). */
export function AddRoundCards({ lang, options, value, disabled, onChange }: {
  lang: Lang; options: ExtendOptions; value: AddRound; disabled: boolean; onChange: (value: AddRound) => void;
}) {
  const flip = (f: TaskFormat) => onChange({ ...value, formats: FORMATS.filter((x) => (x === f ? !value.formats.includes(f) : value.formats.includes(x))) });
  return (
    <div className="grid max-w-sm gap-2.5">
      {FORMATS.map((f) => (
        <Card key={f} lang={lang} id={f} reason={options.formats[f]} selected={value.formats.includes(f)} disabled={disabled} onToggle={() => flip(f)} />
      ))}
      <Card lang={lang} id="writing" reason={options.writing ? null : 'light'} selected={value.writing} disabled={disabled} onToggle={() => onChange({ ...value, writing: !value.writing })} />
    </div>
  );
}
