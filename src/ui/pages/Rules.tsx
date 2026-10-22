import { useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '@/core/i18n';
import { getTopics } from '@/core/db/repos/programme';
import { listRules } from '@/core/db/repos/rules';
import { useCore } from '@/ui/app/CoreProvider';
import { useLoaded } from '@/ui/app/useLoaded';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/ui/table';
import { Notice } from '@/ui/today/chips';
import { RuleDraft } from '@/ui/today/RuleDraft';

export function Rules() {
  const { deps, lang } = useCore();
  const [reload, setReload] = useState(0);
  const loaded = useLoaded(async () => {
    const [rules, topics] = await Promise.all([listRules(deps.db), getTopics(deps.db)]);
    const withRule = new Set(rules.map((r) => r.topic.id));
    return { rules, missing: topics.filter((tp) => !withRule.has(tp.id) && !tp.archived) };
  }, reload);

  return (
    <>
      <h1 className="headline">{t(lang, 'nav.rules')}</h1>
      {loaded && 'error' in loaded && <Notice className="mt-6">{t(lang, 'rules.loadError', { message: loaded.error })}</Notice>}
      {loaded && 'data' in loaded && (
        <>
          {loaded.data.rules.length === 0 && loaded.data.missing.length === 0 && <p className="reading mt-6 text-muted-foreground">{t(lang, 'rules.empty')}</p>}
          {loaded.data.rules.length > 0 && (
            <Table className="mt-6">
              <TableHeader>
                <TableRow>
                  <TableHead>{t(lang, 'rules.col.topic')}</TableHead>
                  <TableHead>{t(lang, 'rules.col.kind')}</TableHead>
                  <TableHead>{t(lang, 'rules.col.version')}</TableHead>
                  <TableHead>{t(lang, 'rules.col.updated')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loaded.data.rules.map((r) => (
                  <TableRow key={r.ruleId} className={r.topic.archived ? 'text-muted-foreground' : undefined}>
                    <TableCell>
                      <Link to={`/rules/${r.ruleId}`} className={r.topic.archived ? 'underline underline-offset-2' : 'text-primary underline underline-offset-2'}>{r.topic.title}</Link>
                      {r.topic.archived && <span className="label ml-2 text-muted-foreground">{t(lang, 'rules.archived')}</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t(lang, r.topic.kind === 'learn' ? 'setup.kind.learn' : 'setup.kind.notice')}</TableCell>
                    <TableCell className="tabular">{r.version}</TableCell>
                    <TableCell className="tabular text-muted-foreground">{r.updatedAt.slice(0, 10)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {loaded.data.missing.length > 0 && (
            <section className="mt-12">
              <h2 className="title">{t(lang, 'rules.missing')}</h2>
              <ul className="mt-4 flex flex-col gap-6">
                {loaded.data.missing.map((topic) => (
                  <li key={topic.id}>
                    <RuleDraft topic={topic} lang={lang} label={topic.title} quiet onSaved={() => setReload((n) => n + 1)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
