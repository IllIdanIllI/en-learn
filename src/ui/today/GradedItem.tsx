import { t, type Lang } from '@/core/i18n';
import type { ViewItem } from '@/core/session/view';
import { cn } from '@/lib/utils';
import { ItemActions } from './ItemActions';
import { NoteChip, RuleRef, VerdictChip } from './chips';
import { useSessionActions } from './sessionActions';

function notCountedReason(item: ViewItem, lang: Lang): string | null {
  const a = item.answer;
  if (item.status === 'defect') return item.note || t(lang, 'reason.defect');
  if (item.status === 'dropped' || a?.disputeDecision === 'drop') return t(lang, 'reason.dropped');
  if (a?.verdict === 'rule_gap' && item.effective === null) return t(lang, 'reason.ruleGap');
  if (a?.verdict === 'skipped') return t(lang, 'reason.skipped');
  return null;
}

/**
 * A graded item. Gap, fix and spelling items show their sentence; a hidden spot error shows `wrong → right`
 * instead. The verdict chip starts the answer line; the learner's wrong text stays visible in muted ink.
 */
export function GradedItem({ item, number, lang }: { item: ViewItem; number?: number; lang: Lang }) {
  const { openRule } = useSessionActions();
  const a = item.answer;
  const spot = item.format === 'spot';
  const reason = notCountedReason(item, lang);
  const ok = item.effective === 'correct';
  const section = a?.ruleSection || item.ruleSection || '';
  const expected = a?.fix || item.expected || '';
  const wrong = reason === null && !ok;
  return (
    <li className="flex gap-3">
      <span className="label tabular mt-1.5 w-6 shrink-0 text-right text-faint">{number ?? ''}</span>
      <div className={cn('min-w-0 flex-1', wrong && 'rounded-md border-l-[3px] border-destructive bg-destructive/8 px-3 py-2')}>
        {!spot && <p className="reading">{item.prompt}</p>}
        <p className={`answer flex flex-wrap items-center gap-x-2.5 gap-y-1 ${spot ? '' : 'mt-2'}`}>
          {reason !== null ? (
            <NoteChip>{t(lang, 'item.notCounted', { reason })}</NoteChip>
          ) : (
            <VerdictChip
              ok={ok}
              label={t(lang, spot ? (ok ? 'verdict.found' : 'verdict.notFound') : ok ? 'verdict.correct' : 'verdict.wrong')}
            />
          )}
          {spot ? (
            <>
              <span className={wrong ? 'line-through text-muted-foreground' : ''}>{item.prompt}</span> → <span className={wrong ? 'font-semibold text-success' : ''}>{item.expected}</span>
            </>
          ) : (
            <>
              {a && a.text !== '' && <span className={cn(ok ? '' : 'text-muted-foreground', wrong && 'line-through')}>{a.text}</span>}
              {wrong && expected !== '' && <span className="font-semibold text-success">→ {expected}</span>}
            </>
          )}
          {!ok && reason === null && section !== '' && (
            <RuleRef
              section={section}
              onOpen={item.ruleId === null ? undefined : (opener) => openRule({ ruleId: item.ruleId!, topicId: item.topicId, section }, opener)}
            />
          )}
        </p>
        {a && a.explanation !== '' && !ok && <p className="reading mt-2 text-muted-foreground">{a.explanation}</p>}
        {a && a.vocabularyNote !== '' && <p className="reading mt-2 rounded-sm bg-note/10 px-3 py-2 text-note">{a.vocabularyNote}</p>}
        <ItemActions item={item} lang={lang} />
      </div>
    </li>
  );
}
