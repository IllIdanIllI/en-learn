import { t } from '@/core/i18n';
import { getTopics } from '@/core/db/repos/programme';
import { listRules } from '@/core/db/repos/rules';
import { listBlockTitles, listGradedSessions } from '@/core/db/repos/sessions';
import { consistency } from '@/core/progress/derive';
import { getTopicStates, loadProgressLog } from '@/core/progress/history';
import { useCore } from '@/ui/app/CoreProvider';
import { useLoaded } from '@/ui/app/useLoaded';
import { ConsistencyGrid } from '@/ui/progress/ConsistencyGrid';
import { OpenTopics } from '@/ui/progress/OpenTopics';
import { ProgressLog } from '@/ui/progress/ProgressLog';
import { Notice } from '@/ui/today/chips';

export function Progress() {
  const { deps, lang } = useCore();
  const loaded = useLoaded(async () => {
    const sessions = await listGradedSessions(deps.db);
    const [topics, states, rules, log, blockTitles] = await Promise.all([
      getTopics(deps.db),
      getTopicStates(deps.db),
      listRules(deps.db),
      loadProgressLog(deps.db),
      listBlockTitles(deps.db, sessions.map((s) => s.id)),
    ]);
    return {
      grid: consistency(sessions.map((s) => ({ date: s.date, isLight: s.isLight, status: 'graded' as const })), deps.clock.today()),
      topics,
      states,
      ruleIds: new Map(rules.map((r) => [r.topic.id, r.ruleId])),
      log,
      blockTitles,
    };
  });

  return (
    <>
      <h1 className="headline">{t(lang, 'nav.progress')}</h1>
      {loaded && 'error' in loaded && <Notice className="mt-6">{t(lang, 'progress.loadError', { message: loaded.error })}</Notice>}
      {loaded && 'data' in loaded && (
        <>
          <section className="mt-6">
            <h2 className="title">{t(lang, 'progress.consistency')}</h2>
            <div className="mt-4">
              <ConsistencyGrid data={loaded.data.grid} lang={lang} />
            </div>
          </section>
          <section className="mt-12">
            <h2 className="title">{t(lang, 'progress.topics')}</h2>
            <OpenTopics topics={loaded.data.topics} states={loaded.data.states} ruleIds={loaded.data.ruleIds} lang={lang} />
          </section>
          <section className="mt-12">
            <h2 className="title">{t(lang, 'progress.log')}</h2>
            <ProgressLog rows={loaded.data.log} blockTitles={loaded.data.blockTitles} lang={lang} />
          </section>
        </>
      )}
    </>
  );
}
