import type { Deps } from '@/core/ports';
import { getProgramme } from '@/core/db/repos/programme';
import { insertSeedRules, replaceProgramme, saveProgramme, type ProgrammeInput, type SeedRule } from '@/core/programme/setup';

/**
 * Saves the programme. Checks for an existing programme at save time, so a retry after a
 * partial first save (programme written, seed rules not) replaces instead of failing.
 * insertSeedRules skips topics that already have a rule, so it is safe to run again.
 */
export async function saveSetup(deps: Deps, input: ProgrammeInput, seedRules: SeedRule[]): Promise<void> {
  if (await getProgramme(deps.db)) await replaceProgramme(deps.db, input);
  else await saveProgramme(deps.db, input);
  if (seedRules.length > 0) await insertSeedRules(deps.db, seedRules, deps.clock.now());
}
