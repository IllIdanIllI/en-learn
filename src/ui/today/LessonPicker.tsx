import { t, type Lang, type MessageKey } from '@/core/i18n';
import type { LessonChoice, LessonOptions, RowReason, TaskFormat } from '@/core/session/choice';

const FORMATS: TaskFormat[] = ['gap', 'fix', 'spot'];
const FORMAT_KEY: Record<TaskFormat, MessageKey> = { gap: 'picker.gap', fix: 'picker.fix', spot: 'picker.spot' };
const REASON_KEY: Record<RowReason, MessageKey> = {
  no_week_topic: 'picker.reason.no_week_topic',
  no_rule: 'picker.reason.no_rule',
  no_topics: 'picker.reason.no_topics',
};

/** One checkbox row: a native input inside its label. A disabled row shows its reason after the label. */
function Row({ label, reason, checked, disabled, onChange }: {
  label: string; reason?: string | null; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex min-h-9 items-center gap-3 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={disabled ? 'text-faint' : undefined}>{label}</span>
      {reason && <span className="label text-faint">{reason}</span>}
    </label>
  );
}

/** The task format rows (gap, fix, spot) in that order. `value` lists the ticked formats; a row with a reason is disabled. */
export function FormatRows({ lang, formats, value, disabled, onChange }: {
  lang: Lang; formats: LessonOptions['formats']; value: TaskFormat[]; disabled: boolean; onChange: (formats: TaskFormat[]) => void;
}) {
  return (
    <>
      {FORMATS.map((f) => {
        const reason = formats[f];
        return (
          <Row
            key={f}
            label={t(lang, FORMAT_KEY[f])}
            reason={reason === null ? null : t(lang, REASON_KEY[reason])}
            checked={value.includes(f)}
            disabled={disabled || reason !== null}
            onChange={(on) => onChange(FORMATS.filter((x) => (x === f ? on : value.includes(x))))}
          />
        );
      })}
    </>
  );
}

/** The picker before a lesson: review (when shown), the task formats, spelling and speaking, in lesson order. */
export function LessonPicker({ lang, options, value, disabled, onChange }: {
  lang: Lang; options: LessonOptions; value: LessonChoice; disabled: boolean; onChange: (value: LessonChoice) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {options.reviewAvailable && (
        <Row label={t(lang, 'picker.review')} checked={value.review} disabled={disabled} onChange={(review) => onChange({ ...value, review })} />
      )}
      <FormatRows lang={lang} formats={options.formats} value={value.formats} disabled={disabled} onChange={(formats) => onChange({ ...value, formats })} />
      <Row label={t(lang, 'picker.spelling')} checked={value.spelling} disabled={disabled} onChange={(spelling) => onChange({ ...value, spelling })} />
      <Row label={t(lang, 'picker.speaking')} checked={value.speaking} disabled={disabled} onChange={(speaking) => onChange({ ...value, speaking })} />
    </div>
  );
}
