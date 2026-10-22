import { useState } from 'react';
import type { Topic } from '@/core/domain';
import { t, type Lang } from '@/core/i18n';
import type { Source } from '@/core/llm/types';
import { saveRuleVersion } from '@/core/db/repos/rules';
import { draftRule } from '@/core/rules/rules';
import { useCore } from '@/ui/app/CoreProvider';
import { Button } from '@/ui/components/ui/button';
import { Textarea } from '@/ui/components/ui/textarea';
import { RuleBody } from './RuleBody';
import { SourceList } from './RulePanel';
import { Notice } from './chips';

type Phase =
  | { kind: 'idle' }
  | { kind: 'drafting' }
  | { kind: 'preview'; body: string; sources: Source[]; saving: boolean }
  | { kind: 'error'; message: string; retry: 'draft' | 'save'; body?: string; sources?: Source[] };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Draft a missing rule (spec 6.2 step 1). Nothing is saved until the learner confirms the edited preview (D3).
 * `label` is the line before the button; `quiet` makes the Draft button secondary where another primary action is on the page;
 * `onSaved` runs after the rule is stored.
 */
export function RuleDraft({ topic, lang, label, quiet = false, onSaved }: {
  topic: Topic; lang: Lang; label: React.ReactNode; quiet?: boolean; onSaved: () => void;
}) {
  const { deps } = useCore();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const draft = async () => {
    setPhase({ kind: 'drafting' });
    try {
      const res = await draftRule(deps, topic.id);
      setPhase(res.ok ? { kind: 'preview', body: res.data.body, sources: res.data.sources, saving: false } : { kind: 'error', message: res.message, retry: 'draft' });
    } catch (e) {
      setPhase({ kind: 'error', message: message(e), retry: 'draft' });
    }
  };
  const save = async (body: string, sources: Source[]) => {
    setPhase({ kind: 'preview', body, sources, saving: true });
    try {
      await saveRuleVersion(deps.db, { topicId: topic.id }, body, sources, 'draft', deps.clock.now());
      onSaved();
    } catch (e) {
      setPhase({ kind: 'error', message: message(e), retry: 'save', body, sources });
    }
  };

  const editing = phase.kind === 'preview' ? phase : phase.kind === 'error' && phase.body !== undefined ? { body: phase.body, sources: phase.sources ?? [], saving: false } : null;

  return (
    <div>
      <p className="reading">{label}</p>
      {editing === null ? (
        <Button className="mt-4" variant={quiet ? 'secondary' : 'default'} disabled={phase.kind === 'drafting'} onClick={() => void draft()}>
          {t(lang, phase.kind === 'drafting' ? 'rule.drafting' : 'rule.draft')}
        </Button>
      ) : (
        <div className="mt-4">
          <Textarea
            rows={14}
            aria-label={t(lang, 'rule.edit')}
            value={editing.body}
            disabled={editing.saving}
            onChange={(e) => setPhase({ kind: 'preview', body: e.target.value, sources: editing.sources, saving: false })}
          />
          <h3 className="label mt-6 text-muted-foreground">{t(lang, 'rule.preview')}</h3>
          <RuleBody body={editing.body} className="mt-1 rounded-md border border-border px-4 py-3" />
          <SourceList sources={editing.sources} lang={lang} />
          <div className="mt-6 flex gap-2">
            <Button disabled={editing.saving || editing.body.trim() === ''} onClick={() => void save(editing.body, editing.sources)}>
              {t(lang, editing.saving ? 'rule.saving' : 'rule.save')}
            </Button>
            <Button variant="ghost" disabled={editing.saving} onClick={() => setPhase({ kind: 'idle' })}>
              {t(lang, 'rule.cancel')}
            </Button>
          </div>
        </div>
      )}
      {phase.kind === 'error' && (
        <Notice className="mt-4">
          <span>{t(lang, phase.retry === 'draft' ? 'rule.draftError' : 'rule.saveError', { message: phase.message })}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void (phase.retry === 'draft' ? draft() : save(phase.body ?? '', phase.sources ?? []))}
          >
            {t(lang, 'today.retry')}
          </Button>
        </Notice>
      )}
    </div>
  );
}
