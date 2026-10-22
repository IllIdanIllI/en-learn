import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { t } from '@/core/i18n';
import { getRule, ruleHistory, saveRuleVersion } from '@/core/db/repos/rules';
import { useCore } from '@/ui/app/CoreProvider';
import { useLoaded } from '@/ui/app/useLoaded';
import { Button } from '@/ui/components/ui/button';
import { FieldInput } from '@/ui/components/ui/field-input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/ui/table';
import { Textarea } from '@/ui/components/ui/textarea';
import { Notice } from '@/ui/today/chips';
import { RuleBody } from '@/ui/today/RuleBody';
import { SourceList } from '@/ui/today/RulePanel';

type Draft = { body: string; reason: string; error: string | null; saving: boolean };

export function RuleView() {
  const { id } = useParams();
  const ruleId = Number(id);
  const { deps, lang } = useCore();
  const [reload, setReload] = useState(0);
  const [shown, setShown] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const loaded = useLoaded(async () => {
    const [current, history, title] = await Promise.all([
      getRule(deps.db, ruleId),
      ruleHistory(deps.db, ruleId),
      deps.db.select<{ title: string }>('SELECT t.title AS title FROM rule r JOIN topic t ON t.id = r.topic_id WHERE r.id = ?', [ruleId]),
    ]);
    const viewed = shown === null || shown === current.version ? current : await getRule(deps.db, ruleId, shown);
    return { current, viewed, history, title: title[0]?.title ?? '' };
  }, `${reload}:${shown ?? ''}`);

  const back = (
    <Link to="/rules" className="label text-muted-foreground underline underline-offset-2">{t(lang, 'rule.back')}</Link>
  );
  if (loaded === null) return back;
  if ('error' in loaded) {
    return (
      <>
        {back}
        <Notice className="mt-6">{t(lang, 'rule.loadError', { message: loaded.error })}</Notice>
      </>
    );
  }
  const { current, viewed, history, title } = loaded.data;
  const isCurrent = viewed.version === current.version;

  const save = async () => {
    if (!draft) return;
    if (draft.reason.trim() === '') {
      setDraft({ ...draft, error: t(lang, 'rule.reasonRequired') });
      return;
    }
    setDraft({ ...draft, error: null, saving: true });
    try {
      await saveRuleVersion(deps.db, { ruleId }, draft.body, current.sources, draft.reason.trim(), deps.clock.now());
      setDraft(null);
      setShown(null);
      setReload((n) => n + 1);
    } catch (e) {
      setDraft({ ...draft, saving: false, error: t(lang, 'rule.saveError', { message: e instanceof Error ? e.message : String(e) }) });
    }
  };

  return (
    <>
      {back}
      <h1 className="headline mt-2">{title}</h1>
      <p className="mt-2 text-muted-foreground">{t(lang, 'rule.version', { n: viewed.version })}</p>

      {draft ? (
        <div className="mt-6">
          <Textarea
            rows={14}
            aria-label={t(lang, 'rule.edit')}
            value={draft.body}
            disabled={draft.saving}
            onChange={(e) => setDraft({ ...draft, body: e.target.value, error: null })}
          />
          <h2 className="label mt-6 text-muted-foreground">{t(lang, 'rule.preview')}</h2>
          <RuleBody body={draft.body} className="mt-1 rounded-md border border-border px-4 py-3" />
          <label className="mt-6 block">
            <span className="label text-muted-foreground">{t(lang, 'rule.reason')}</span>
            <FieldInput
              className="mt-1 max-w-md"
              value={draft.reason}
              disabled={draft.saving}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value, error: null })}
            />
          </label>
          {draft.error && <Notice className="mt-4">{draft.error}</Notice>}
          <div className="mt-6 flex gap-2">
            <Button disabled={draft.saving || draft.body.trim() === ''} onClick={() => void save()}>
              {t(lang, draft.saving ? 'rule.saving' : 'rule.save')}
            </Button>
            <Button variant="ghost" disabled={draft.saving} onClick={() => setDraft(null)}>{t(lang, 'rule.cancel')}</Button>
          </div>
        </div>
      ) : (
        <>
          {isCurrent ? (
            <Button className="mt-4" variant="secondary" onClick={() => setDraft({ body: current.body, reason: '', error: null, saving: false })}>
              {t(lang, 'rule.editAction')}
            </Button>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-muted-foreground">{t(lang, 'rule.viewingOld', { n: viewed.version, current: current.version })}</span>
              <Button variant="secondary" size="sm" onClick={() => setShown(null)}>{t(lang, 'rule.toCurrent')}</Button>
            </div>
          )}
          <RuleBody body={viewed.body} className="mt-6" />
          <SourceList sources={viewed.sources} lang={lang} />
        </>
      )}

      <section className="mt-12">
        <h2 className="title">{t(lang, 'rule.history')}</h2>
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>{t(lang, 'rule.col.version')}</TableHead>
              <TableHead>{t(lang, 'rule.col.reason')}</TableHead>
              <TableHead>{t(lang, 'rule.col.date')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((h) => (
              <TableRow key={h.version}>
                <TableCell className="tabular">
                  {h.version}
                  {h.version === current.version && <span className="label ml-2 text-muted-foreground">{t(lang, 'rule.current')}</span>}
                </TableCell>
                <TableCell>{h.reason}</TableCell>
                <TableCell className="tabular text-muted-foreground">{h.createdAt.slice(0, 10)}</TableCell>
                <TableCell className="text-right">
                  {h.version !== viewed.version && (
                    <Button variant="ghost" size="sm" disabled={draft !== null} onClick={() => setShown(h.version === current.version ? null : h.version)}>
                      {t(lang, 'rule.show')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}
