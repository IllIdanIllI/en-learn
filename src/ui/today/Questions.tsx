import type { Question } from '@/core/grading/precheck';
import { t, type Lang } from '@/core/i18n';
import { Input } from '@/ui/components/ui/input';
import { Segmented } from '@/ui/components/Segmented';

export type Reply = { kind: Question['kind']; choice?: 'yes' | 'no'; text?: string };

/** The inline question under an item the pre-check or the grader could not decide (spec 8.2, 8.3). */
export function Questions({ question, reply, lang, onChange }: {
  question: Question; reply: Reply | undefined; lang: Lang; onChange: (reply: Reply) => void;
}) {
  if (question.kind === 'llm') {
    return (
      <div data-question className="mt-3">
        <p className="reading text-muted-foreground">{question.text}</p>
        <Input
          className="mt-2 max-w-md"
          aria-label={t(lang, 'q.answer')}
          placeholder={t(lang, 'q.answer')}
          value={reply?.text ?? ''}
          onChange={(e) => onChange({ kind: 'llm', text: e.target.value })}
        />
      </div>
    );
  }
  // Split on a marker so the symbol can be set in the answer font.
  const [before = '', after = ''] = t(lang, 'q.shorthand', { symbol: '\u0000' }).split('\u0000');
  const label = t(lang, 'q.skip');
  return (
    <div data-question className="mt-3 flex flex-wrap items-center gap-3">
      <p className="text-muted-foreground">
        {question.kind === 'blank' ? (
          label
        ) : (
          <>
            {before}
            <code className="answer text-foreground">{question.symbol}</code>
            {after}
          </>
        )}
      </p>
      <Segmented
        label={question.kind === 'blank' ? label : t(lang, 'q.shorthand', { symbol: question.symbol ?? '' })}
        value={reply?.choice ?? ('' as 'yes' | 'no')}
        options={[{ value: 'yes', label: t(lang, 'q.yes') }, { value: 'no', label: t(lang, 'q.no') }]}
        onChange={(choice) => onChange({ kind: question.kind, choice })}
      />
    </div>
  );
}
