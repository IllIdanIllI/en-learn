import type { Deps } from '@/core/ports';
import { runMigrations } from '@/core/db/migrate';
import { migrations } from '@/core/db/migrations';
import { cleanupDrafts } from '@/core/session/generate';

/** Spec 12: migrations run at startup; a failure propagates and stops the app. */
export async function startApp(deps: Pick<Deps, 'db'>): Promise<void> {
  await runMigrations(deps.db, migrations);
  await cleanupDrafts(deps.db);
}
