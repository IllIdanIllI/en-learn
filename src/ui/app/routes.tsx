import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { t, type MessageKey } from '@/core/i18n';
import { AppShell } from './AppShell';
import { useCore } from './CoreProvider';
import { Prerequisites } from '@/ui/pages/Prerequisites';
import { Settings } from '@/ui/pages/Settings';
import { Today } from '@/ui/pages/Today';
import { Setup } from '@/ui/pages/Setup';

/** Stands in until the page tasks replace it: the page title in Headline style. */
function Placeholder({ titleKey }: { titleKey: MessageKey }) {
  const { lang } = useCore();
  return <h1 className="headline">{t(lang, titleKey)}</h1>;
}

const PAGES: { path: string; titleKey: MessageKey }[] = [
  { path: 'progress', titleKey: 'nav.progress' },
  { path: 'rules', titleKey: 'nav.rules' },
  { path: 'rules/:id', titleKey: 'nav.rules' },
  { path: 'errors', titleKey: 'nav.errors' },
];

export function AppRoutes() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/today" replace />} />
          <Route path="today" element={<Today />} />
          {PAGES.map(({ path, titleKey }) => (
            <Route key={path} path={path} element={<Placeholder titleKey={titleKey} />} />
          ))}
          <Route path="settings" element={<Settings />} />
          <Route path="setup" element={<Setup />} />
          <Route path="prerequisites" element={<Prerequisites />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
