import { useRef, useState } from 'react';
import { decideRuleGap, saveMnemonic, setInattention } from '@/core/grading/actions';
import { t, type Lang } from '@/core/i18n';
import type { ViewItem } from '@/core/session/view';
import { useCore } from '@/ui/app/CoreProvider';
import { Button } from '@/ui/components/ui/button';
import { Input } from '@/ui/components/ui/input';
import { Toggle } from '@/ui/components/ui/toggle';
import { DisputeField } from './DisputeField';
import { RuleBody } from './RuleBody';
import { Notice } from './chips';
import { useSessionActions } from './sessionActions';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Rule gap: the proposed rule body inline, with Approve and Reject. */
function GapProposal({ item, lang }: { item: ViewItem; lang: Lang }) {
  const { deps } = useCore();
  const { reload } = useSessionActions();
  const gap = item.gap!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (gap.status !== 'pending') {
    return <p className="mt-3 text-muted-foreground">{t(lang, gap.status === 'approved' ? 'gap.approved' : 'gap.rejected')}</p>;
  }
  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await decideRuleGap(deps.db, gap.id, approve, deps.clock.now());
      reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 rounded-md border border-border px-4 py-3">
      <p className="label text-muted-foreground">{t(lang, 'gap.title')}</p>
      <RuleBody body={gap.proposal} className="mt-1 max-h-96 overflow-y-auto" />
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void decide(true)}>{t(lang, 'gap.approve')}</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void decide(false)}>{t(lang, 'gap.reject')}</Button>
      </div>
      {error !== null && <Notice className="mt-3">{t(lang, 'action.error', { message: error })}</Notice>}
    </div>
  );
}

/** For words spelt wrong, or that already have one. Saved on blur; the saved text is what the input shows in later graded views. */
function Mnemonic({ item, lang }: { item: ViewItem; lang: Lang }) {
  const { deps } = useCore();
  const [value, setValue] = useState(item.mnemonic ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef(item.mnemonic ?? '');
  const save = async () => {
    const next = value.trim();
    if (next === last.current) return;
    try {
      await saveMnemonic(deps.db, item.spellingWordId!, next);
      last.current = next;
      setError(null);
      setSaved(true);
    } catch (e) {
      setError(message(e));
    }
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <Input
        className="max-w-sm text-muted-foreground"
        aria-label={t(lang, 'mnemonic.label')}
        placeholder={t(lang, 'mnemonic.placeholder')}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onBlur={() => void save()}
      />
      <span role="status" className="label text-faint">{saved ? t(lang, 'mnemonic.saved') : ''}</span>
      {error !== null && <Notice>{t(lang, 'action.error', { message: error })}</Notice>}
    </div>
  );
}

/** What can be done with a graded item: dispute, inattention tag, rule gap decision, spelling mnemonic. */
export function ItemActions({ item, lang }: { item: ViewItem; lang: Lang }) {
  const { deps } = useCore();
  const { reload } = useSessionActions();
  const a = item.answer;
  const [disputeOpen, setDisputeOpen] = useState(a?.disputeText != null);
  const [error, setError] = useState<string | null>(null);
  if (!a) return null;

  const canDispute = item.status === 'active' && (a.verdict === 'wrong' || a.verdict === 'rule_gap');
  const canTag = item.status === 'active' && a.verdict === 'wrong';
  const tag = async (value: boolean) => {
    setError(null);
    try {
      await setInattention(deps.db, item.id, value);
      reload();
    } catch (e) {
      setError(message(e));
    }
  };

  return (
    <>
      {item.gap && <GapProposal item={item} lang={lang} />}
      {item.format === 'spelling' && item.spellingWordId != null && (a.verdict === 'wrong' || item.mnemonic) && <Mnemonic item={item} lang={lang} />}
      {(canDispute || canTag) && (
        <div className="mt-2 -ml-2.5 flex flex-wrap items-center gap-1">
          {canDispute && (
            <Button variant="ghost" size="sm" aria-expanded={disputeOpen} onClick={() => setDisputeOpen((open) => !open)}>
              {t(lang, 'item.dispute')}
            </Button>
          )}
          {canTag && (
            <Toggle size="sm" pressed={a.isInattention} onPressedChange={(v) => void tag(v)}>
              {t(lang, 'item.inattention')}
            </Toggle>
          )}
        </div>
      )}
      {error !== null && <Notice className="mt-2">{t(lang, 'action.error', { message: error })}</Notice>}
      {canDispute && disputeOpen && <DisputeField item={item} lang={lang} />}
    </>
  );
}
