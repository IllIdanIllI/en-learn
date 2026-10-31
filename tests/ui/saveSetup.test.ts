import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { FixedClock } from '@/adapters/test/fixedClock';
import { FakeRunner } from '@/adapters/test/fakeRunner';
import type { Db, Deps, Llm } from '@/core/ports';
import { getProgramme, getTopics, topicHasRule } from '@/core/db/repos/programme';
import { MINI_PROGRAMME, MINI_RULES } from '@/adapters/preview/miniSeed';
import { saveSetup } from '@/ui/setup/save';
import { recheck } from '@/ui/app/recheck';

const llm = (name: string): Llm => ({ call: () => Promise.reject(new Error(name)) });

async function makeDeps(failRuleInsertOnce = false): Promise<Deps> {
  const real = await createTestDb();
  let armed = failRuleInsertOnce;
  const db: Db = {
    select: (sql, params) => real.select(sql, params),
    execute(sql, params) {
      if (armed && sql.startsWith('INSERT INTO rule ')) {
        armed = false;
        return Promise.reject(new Error('disk full'));
      }
      return real.execute(sql, params);
    },
  };
  return { db, llm: llm('old'), clock: new FixedClock('2026-10-20'), prompts: { load: () => Promise.reject(new Error('unused')) } };
}

describe('saveSetup', () => {
  test('first save writes the programme and the seed rules', async () => {
    const deps = await makeDeps();
    await saveSetup(deps, MINI_PROGRAMME, MINI_RULES);
    const topics = await getTopics(deps.db);
    expect(topics).toHaveLength(4);
    for (const t of topics) expect(await topicHasRule(deps.db, t.id)).toBe(true);
  });

  test('a retry after a failed rule insert succeeds and completes the rules', async () => {
    const deps = await makeDeps(true);
    await expect(saveSetup(deps, MINI_PROGRAMME, MINI_RULES)).rejects.toThrow('disk full');
    expect(await getProgramme(deps.db)).not.toBeNull();
    await saveSetup(deps, MINI_PROGRAMME, MINI_RULES);
    const topics = await getTopics(deps.db);
    expect(topics).toHaveLength(4);
    for (const t of topics) expect(await topicHasRule(deps.db, t.id)).toBe(true);
  });

  test('saving over an existing programme replaces it and archives topics with history', async () => {
    const deps = await makeDeps();
    await saveSetup(deps, MINI_PROGRAMME, MINI_RULES);
    await saveSetup(deps, { ...MINI_PROGRAMME, title: 'Changed', weeks: MINI_PROGRAMME.weeks.slice(0, 2) }, []);
    expect((await getProgramme(deps.db))?.title).toBe('Changed');
    const topics = await getTopics(deps.db);
    const dropped = topics.find((t) => t.key === 'present-perfect');
    expect(dropped?.archived).toBe(true); // it has a rule, so it is kept but archived
    expect(topics.find((t) => t.key === 'articles')?.weekNo).toBe(1);
  });
});

describe('recheck', () => {
  const ok = (stdout: string) => ({ code: 0, stdout, stderr: '', timedOut: false });

  test('success swaps the Llm', async () => {
    const deps = await makeDeps();
    const runner = new FakeRunner([ok('2.1.308\n'), ok('{"loggedIn":true}')]);
    const next = await recheck(runner, deps, (loc) => llm(`new-${loc}`));
    expect(next.prereq).toEqual({ ok: true, location: 'local', version: '2.1.308' });
    expect(next.deps.llm).not.toBe(deps.llm);
    expect(next.deps.db).toBe(deps.db);
  });

  test('failure keeps the Llm', async () => {
    const deps = await makeDeps();
    const fail = { code: 127, stdout: '', stderr: '', timedOut: false };
    const runner = new FakeRunner([fail, fail, fail, fail]);
    const next = await recheck(runner, deps, () => llm('new'));
    expect(next.prereq.ok).toBe(false);
    expect(next.deps).toBe(deps);
  });
});
