import { useRef, useState } from 'react';
import { t, type Lang } from '@/core/i18n';
import type { Source } from '@/core/llm/types';
import { saveRuleVersion } from '@/core/db/repos/rules';
import { lineDiff } from '@/core/rules/lineDiff';
import { ruleChatTurn } from '@/core/rules/chat';
import { cn } from '@/lib/utils';
import { useCore } from '@/ui/app/CoreProvider';
import { Segmented } from '@/ui/components/Segmented';
import { Button } from '@/ui/components/ui/button';
import { FieldInput } from '@/ui/components/ui/field-input';
import { Notice } from '@/ui/today/chips';
import { RuleBody } from '@/ui/today/RuleBody';
import { SourceList } from '@/ui/today/RulePanel';
import { bodyHasSources } from '@/ui/today/ruleSources';

interface Proposal { body: string; sources: Source[] }
type Message = { from: 'learner'; text: string } | { from: 'coach'; text: string; proposal: Proposal | null };

const DIFF_TONE = { add: 'bg-success/10 text-success', del: 'bg-destructive/10 text-destructive', same: 'text-muted-foreground' } as const;
const DIFF_MARK = { add: '+ ', del: '- ', same: '  ' } as const;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function ProposalCard({ proposal, current, ruleId, lang, onSaved }: {
  proposal: Proposal; current: string; ruleId: number; lang: Lang; onSaved: () => void;
}) {
  const { deps } = useCore();
  const [tab, setTab] = useState<'new' | 'diff'>('new');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (reason.trim() === '') {
      setError(t(lang, 'rule.reasonRequired'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await saveRuleVersion(deps.db, { ruleId }, proposal.body, proposal.sources, reason.trim(), deps.clock.now());
      onSaved();
    } catch (e) {
      setSaving(false);
      setError(t(lang, 'rule.saveError', { message: errorText(e) }));
    }
  };

  return (
    <div className="mt-3 rounded-md border border-border px-4 py-3">
      <Segmented
        value={tab}
        onChange={setTab}
        label={t(lang, 'rulechat.proposal')}
        options={[{ value: 'new', label: t(lang, 'rulechat.tabNew') }, { value: 'diff', label: t(lang, 'rulechat.tabDiff') }]}
      />
      {tab === 'new' ? (
        <>
          <RuleBody body={proposal.body} className="mt-3" />
          {!bodyHasSources(proposal.body) && <SourceList sources={proposal.sources} lang={lang} />}
        </>
      ) : (
        <pre className="mt-3 overflow-x-auto font-mono text-note whitespace-pre-wrap">
          {lineDiff(current, proposal.body).map((l, i) => (
            <div key={i} data-testid={l.kind === 'same' ? undefined : `diff-${l.kind}`} className={cn('px-1', DIFF_TONE[l.kind])}>
              {DIFF_MARK[l.kind]}{l.text}
            </div>
          ))}
        </pre>
      )}
      <label className="mt-4 block">
        <span className="label text-muted-foreground">{t(lang, 'rule.reason')}</span>
        <FieldInput className="mt-1 max-w-md" value={reason} disabled={saving} onChange={(e) => { setReason(e.target.value); setError(null); }} />
      </label>
      {error && <Notice className="mt-3">{error}</Notice>}
      <Button className="mt-3" disabled={saving} onClick={() => void save()}>
        {t(lang, saving ? 'rule.saving' : 'rulechat.save')}
      </Button>
    </div>
  );
}

/** Chat about the current rule version (spec L3). State lives here only: it ends when the page is left or the version changes (remount by key). */
export function RuleChat({ ruleId, currentBody, lang, onSaved }: { ruleId: number; currentBody: string; lang: Lang; onSaved: () => void }) {
  const { deps } = useCore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<{ text: string; message: string } | null>(null);
  const sessionId = useRef<string | null>(null);

  const send = async (turnText: string) => {
    setBusy(true);
    setFailed(null);
    try {
      const res = await ruleChatTurn(deps, ruleId, turnText, sessionId.current);
      if (res.ok) {
        if (res.sessionId) sessionId.current = res.sessionId;
        setMessages((m) => [...m, { from: 'coach', text: res.data.message, proposal: res.data.proposal }]);
      } else {
        setFailed({ text: turnText, message: res.message });
      }
    } catch (e) {
      setFailed({ text: turnText, message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const turnText = text.trim();
    if (turnText === '' || busy) return;
    setText('');
    setMessages((m) => [...m, { from: 'learner', text: turnText }]);
    void send(turnText);
  };

  return (
    <section className="mt-12" aria-label={t(lang, 'rulechat.title')}>
      <h2 className="title">{t(lang, 'rulechat.title')}</h2>
      <p className="mt-1 text-muted-foreground">{t(lang, 'rulechat.hint')}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {messages.map((m, i) => (
          <li key={i} className={m.from === 'learner' ? 'self-end rounded-md bg-secondary px-3 py-2' : ''}>
            <p className="reading whitespace-pre-wrap">{m.text}</p>
            {m.from === 'coach' && m.proposal && (
              <ProposalCard proposal={m.proposal} current={currentBody} ruleId={ruleId} lang={lang} onSaved={onSaved} />
            )}
          </li>
        ))}
      </ul>
      {busy && <p role="status" className="mt-3 text-muted-foreground">{t(lang, 'rulechat.thinking')}</p>}
      {failed && (
        <Notice className="mt-3">
          <span>{t(lang, 'rulechat.error', { message: failed.message })}</span>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void send(failed.text)}>{t(lang, 'today.retry')}</Button>
        </Notice>
      )}
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <FieldInput
          className="max-w-xl flex-1"
          aria-label={t(lang, 'rulechat.input')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" disabled={busy || text.trim() === ''}>{t(lang, 'rulechat.send')}</Button>
      </form>
    </section>
  );
}
