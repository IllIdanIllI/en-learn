import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { Prerequisites } from '@/ui/pages/Prerequisites';
import { Settings } from '@/ui/pages/Settings';
import { Today } from '@/ui/pages/Today';
import { Setup } from '@/ui/pages/Setup';
import { Progress } from '@/ui/pages/Progress';
import { Rules } from '@/ui/pages/Rules';
import { RuleView } from '@/ui/pages/RuleView';
import { ErrorBank } from '@/ui/pages/ErrorBank';

export function AppRoutes() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/today" replace />} />
          <Route path="today" element={<Today />} />
          <Route path="progress" element={<Progress />} />
          <Route path="rules" element={<Rules />} />
          <Route path="rules/:id" element={<RuleView />} />
          <Route path="errors" element={<ErrorBank />} />
          <Route path="settings" element={<Settings />} />
          <Route path="setup" element={<Setup />} />
          <Route path="prerequisites" element={<Prerequisites />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
