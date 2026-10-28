import { useState } from 'react';
import { t } from '@/core/i18n';
import { getTopics } from '@/core/db/repos/programme';
import { errorBank, type ErrorBankRow } from '@/core/progress/derive';
import { loadGradedFacts } from '@/core/progress/history';
import { useCore } from '@/ui/app/CoreProvider';
import { useLoaded } from '@/ui/app/useLoaded';
import { SHOULD_TONE, SnippetText, WAS_TONE } from '@/ui/components/SnippetText';
import { Select } from '@/ui/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/ui/table';
import { Notice } from '@/ui/today/chips';

const KINDS: ErrorBankRow['kind'][] = ['grammar', 'spelling', 'inattention'];

export function ErrorBank() {
  const { deps, lang } = useCore();
  const [kind, setKind] = useState('');
  const [topic, setTopic] = useState('');
  const loaded = useLoaded(async () => {
    const [facts, topics] = await Promise.all([loadGradedFacts(deps.db), getTopics(deps.db)]);
    return { rows: errorBank(facts.errorRows), topics };
  });

  return (
    <>
      <h1 className="headline">{t(lang, 'nav.errors')}</h1>
      {loaded && 'error' in loaded && <Notice className="mt-6">{t(lang, 'errors.loadError', { message: loaded.error })}</Notice>}
      {loaded && 'data' in loaded && (() => {
        const { rows, topics } = loaded.data;
        if (rows.length === 0) return <p className="reading mt-6 text-muted-foreground">{t(lang, 'errors.empty')}</p>;
        const titles = new Map(topics.map((tp) => [tp.id, tp.title]));
        const shown = rows.filter((r) => (kind === '' || r.kind === kind) && (topic === '' || String(r.topicId) === topic));
        return (
          <>
            <div className="mt-6 flex flex-wrap gap-4">
              <div className="w-48">
                <label htmlFor="errors-kind" className="label text-muted-foreground">{t(lang, 'errors.filter.kind')}</label>
                <Select
                  id="errors-kind"
                  className="mt-1"
                  value={kind}
                  onValueChange={setKind}
                  options={[{ value: '', label: t(lang, 'errors.filter.all') }, ...KINDS.map((k) => ({ value: k, label: t(lang, `kind.${k}`) }))]}
                />
              </div>
              <div className="w-56">
                <label htmlFor="errors-topic" className="label text-muted-foreground">{t(lang, 'errors.filter.topic')}</label>
                <Select
                  id="errors-topic"
                  className="mt-1"
                  value={topic}
                  onValueChange={setTopic}
                  options={[
                    { value: '', label: t(lang, 'errors.filter.all') },
                    ...topics.filter((tp) => rows.some((r) => r.topicId === tp.id)).map((tp) => ({ value: String(tp.id), label: tp.title })),
                  ]}
                />
              </div>
            </div>
            <Table className="mt-6">
              <TableHeader>
                <TableRow>
                  <TableHead>{t(lang, 'errors.col.was')}</TableHead>
                  <TableHead>{t(lang, 'errors.col.shouldBe')}</TableHead>
                  <TableHead>{t(lang, 'errors.col.kind')}</TableHead>
                  <TableHead>{t(lang, 'errors.col.topic')}</TableHead>
                  <TableHead>{t(lang, 'errors.col.date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r) => (
                  <TableRow key={r.itemId}>
                    <TableCell className="answer" title={r.sentence === '' ? undefined : r.sentence}>
                      <SnippetText s={r.was} tone={WAS_TONE} />
                      {r.hint !== null && <div className="mt-1 text-sm text-muted-foreground">{r.hint}</div>}
                    </TableCell>
                    <TableCell className="answer" title={r.sentence === '' ? undefined : r.sentence}>
                      <SnippetText s={r.shouldBe} tone={SHOULD_TONE} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t(lang, `kind.${r.kind}`)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.topicId === null ? '' : (titles.get(r.topicId) ?? '')}</TableCell>
                    <TableCell className="tabular whitespace-nowrap text-muted-foreground">{r.date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        );
      })()}
    </>
  );
}
