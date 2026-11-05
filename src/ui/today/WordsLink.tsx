import { Link } from 'react-router-dom';
import { getSettings } from '@/core/db/repos/settings';
import { t } from '@/core/i18n';
import { extraNewFor } from '@/core/words/queue';
import { wordsOverview } from '@/core/words/practice';
import { useCore } from '@/ui/app/CoreProvider';
import { useLoaded } from '@/ui/app/useLoaded';

/** One line under the lesson header when words are due or new ones are allowed today. */
export function WordsLink() {
  const { deps, lang } = useCore();
  const loaded = useLoaded(async () => {
    const today = deps.clock.today();
    return wordsOverview(deps.db, today, extraNewFor((await getSettings(deps.db)).wordsExtraNew, today));
  });
  if (!loaded || !('data' in loaded) || loaded.data.available === 0) return null;
  return (
    <p className="mt-2">
      <Link to="/words" className="text-primary underline underline-offset-2">
        {t(lang, 'words.todayLink', { n: loaded.data.available })}
      </Link>
    </p>
  );
}
