import { t, type Lang } from '@/core/i18n';
import type { SessionView } from '@/core/session/view';

export function SessionHeader({ view, lang }: { view: SessionView; lang: Lang }) {
  return (
    <header>
      <h1 className="headline">{view.title}</h1>
      <p className="mt-2 text-muted-foreground">
        <span className="tabular">{t(lang, 'today.minutes', { n: view.totalMinutes })}</span>
        {view.readFirst && ` · ${t(lang, 'today.readFirst', { section: view.readFirst.section, n: view.readFirst.blockNumber })}`}
      </p>
    </header>
  );
}
