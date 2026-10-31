import { useState } from 'react';
import { t, type Lang } from '@/core/i18n';
import type { Source } from '@/core/llm/types';
import { lineDiff } from '@/core/rules/lineDiff';
import { cn } from '@/lib/utils';
import { Segmented } from '@/ui/components/Segmented';
import { RuleBody } from '@/ui/today/RuleBody';
import { SourceList } from '@/ui/today/RulePanel';
import { bodyHasSources } from '@/ui/today/ruleSources';

const DIFF_TONE = { add: 'bg-success/10 text-success', del: 'bg-destructive/10 text-destructive', same: 'text-muted-foreground' } as const;
const DIFF_MARK = { add: '+ ', del: '- ', same: '  ' } as const;

/** A proposed rule version in two tabs: the new text, and the line diff against the current body. */
export function ProposalTabs({ body, sources, current, lang }: { body: string; sources: Source[]; current: string; lang: Lang }) {
  const [tab, setTab] = useState<'new' | 'diff'>('new');
  return (
    <>
      <Segmented
        value={tab}
        onChange={setTab}
        label={t(lang, 'rulechat.proposal')}
        options={[{ value: 'new', label: t(lang, 'rulechat.tabNew') }, { value: 'diff', label: t(lang, 'rulechat.tabDiff') }]}
      />
      {tab === 'new' ? (
        <>
          <RuleBody body={body} className="mt-3" />
          {!bodyHasSources(body) && <SourceList sources={sources} lang={lang} />}
        </>
      ) : (
        <pre className="mt-3 overflow-x-auto font-mono text-note whitespace-pre-wrap">
          {lineDiff(current, body).map((l, i) => (
            <div key={i} data-testid={l.kind === 'same' ? undefined : `diff-${l.kind}`} className={cn('px-1', DIFF_TONE[l.kind])}>
              {DIFF_MARK[l.kind]}{l.text}
            </div>
          ))}
        </pre>
      )}
    </>
  );
}
