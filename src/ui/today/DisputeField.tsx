import { useState } from 'react';
import type { DisputeDecision } from '@/core/domain';
import { decideDispute } from '@/core/grading/actions';
import { t, type Lang } from '@/core/i18n';
import type { DisputeReply } from '@/core/llm/types';
import type { ViewItem } from '@/core/session/view';
import { useCore } from '@/ui/app/CoreProvider';
import { Button } from '@/ui/components/ui/button';
import { Textarea } from '@/ui/components/ui/textarea';
import { SourceList } from './RulePanel';
import { Notice, RuleRef } from './chips';
import { useSessionActions } from './sessionActions';

function parseReply(raw: string | null): DisputeReply | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<DisputeReply> | null;
    if (value && typeof value === 'object' && typeof value.position === 'string') {
      return { position: value.position, ruleSection: value.ruleSection ?? '', sources: value.sources ?? [], recommendation: value.recommendation ?? 'keep' };
    }
  } catch {
    // Not JSON: show the stored text as the position.
  }
  return { position: raw, ruleSection: '', sources: [], recommendation: 'keep' };
}

const DECISIONS: { decision: DisputeDecision; label: 'dispute.keep' | 'dispute.correct' | 'dispute.drop' }[] = [
  { decision: 'keep', label: 'dispute.keep' },
  { decision: 'correct', label: 'dispute.correct' },
  { decision: 'drop', label: 'dispute.drop' },
];

/** Inline dispute under a graded item (no dialog): objection, the app's position, then the learner's decision. */
export function DisputeField({ item, lang }: { item: ViewItem; lang: Lang }) {
  const { deps } = useCore();
  const { reload, openRule, disputes, setDispute, sendDisputes } = useSessionActions();
  const a = item.answer;
  const text = disputes[item.id] ?? '';
  // `sending` stays true after a successful send: the reply branch takes over once the view reloads.
  const [sending, setSending] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reply = parseReply(a?.disputeReply ?? null);
  if (!a) return null;

  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    setSending(false);
    setDeciding(false);
  };
  const send = async () => {
    if (sending || text.trim() === '') return;
    setSending(true);
    setError(null);
    try {
      await sendDisputes([item.id]);
    } catch (e) {
      fail(e);
    }
  };
  const decide = async (decision: DisputeDecision) => {
    if (deciding) return;
    setDeciding(true);
    setError(null);
    try {
      await decideDispute(deps.db, item.id, decision);
      reload();
      setDeciding(false);
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="mt-3 max-w-md">
      {reply === null ? (
        <>
          <Textarea
            autoFocus
            rows={3}
            aria-label={t(lang, 'dispute.label')}
            placeholder={t(lang, 'dispute.placeholder')}
            value={text}
            onChange={(e) => setDispute(item.id, e.target.value)}
          />
          <Button className="mt-2" variant="secondary" size="sm" disabled={sending || text.trim() === ''} onClick={() => void send()}>
            {t(lang, sending ? 'dispute.sending' : 'dispute.send')}
          </Button>
        </>
      ) : (
        <>
          <p className="label text-faint">{t(lang, 'dispute.label')}</p>
          <p className="answer mt-1 whitespace-pre-line text-muted-foreground">{a.disputeText}</p>
          <p className="reading mt-3">{reply.position}</p>
          {reply.ruleSection !== '' && (
            <p className="mt-2">
              <RuleRef
                section={reply.ruleSection}
                onOpen={item.ruleId === null ? undefined : (opener) => openRule({ ruleId: item.ruleId!, topicId: item.topicId, section: reply.ruleSection }, opener)}
              />
            </p>
          )}
          <SourceList sources={reply.sources} lang={lang} />
          {a.disputeDecision === null ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {DECISIONS.map((d) => (
                <Button key={d.decision} variant="secondary" size="sm" disabled={deciding} onClick={() => void decide(d.decision)}>
                  {t(lang, d.label)}
                </Button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-muted-foreground">{t(lang, `dispute.decided.${a.disputeDecision}`)}</p>
          )}
        </>
      )}
      {error !== null && (
        <Notice className="mt-3">
          <span>{t(lang, reply === null ? 'dispute.error' : 'action.error', { message: error })}</span>
          {reply === null && (
            <Button variant="secondary" size="sm" disabled={sending} onClick={() => void send()}>
              {t(lang, 'today.retry')}
            </Button>
          )}
        </Notice>
      )}
    </div>
  );
}
