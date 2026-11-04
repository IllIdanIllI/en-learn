import { Link } from 'react-router-dom';
import { t } from '@/core/i18n';
import { wordsOverview } from '@/core/words/practice';
import { useCore } from '@/ui/app/CoreProvider';
import { useLoaded } from '@/ui/app/useLoaded';

/** One line under the lesson header when words are due or new ones are allowed today. */
export function WordsLink() {
  const { deps, lang } = useCore();
  const loaded = useLoaded(() => wordsOverview(deps.db, deps.clock.today()));
  if (!loaded || !('data' in loaded) || loaded.data.available === 0) return null;
  return (
    <p className="mt-2">
      <Link to="/words" className="text-primary underline underline-offset-2">
        {t(lang, 'words.todayLink', { n: loaded.data.available })}
      </Link>
    </p>
  );
}
