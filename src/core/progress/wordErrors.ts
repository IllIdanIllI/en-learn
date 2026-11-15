import type { Db } from '@/core/ports';
import { listWordErrors } from '@/core/db/repos/words';
import type { ErrorBankRow } from './derive';

/** Mistakes in the learner's own sentences on the Words practice ("use it" cards), as error bank rows. */
export async function wordErrorRows(db: Db): Promise<ErrorBankRow[]> {
  const rows = await listWordErrors(db);
  return rows.map((r) => ({
    date: r.date,
    was: { before: '', changed: r.fragment, after: '' },
    shouldBe: { before: '', changed: r.fix, after: '' },
    sentence: r.sentence,
    hint: null,
    kind: 'grammar',
    topicId: r.topicId,
    itemId: r.id,
    suggestedTopic: r.suggestedTopic,
    source: 'words',
  }));
}
