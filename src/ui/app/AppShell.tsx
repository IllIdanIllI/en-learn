import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Toaster } from '@/ui/components/ui/sonner';
import { TooltipProvider } from '@/ui/components/ui/tooltip';
import { useCore } from './CoreProvider';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const { prereq } = useCore();
  const { pathname } = useLocation();
  if (prereq && !prereq.ok && pathname !== '/prerequisites') return <Navigate to="/prerequisites" replace />;
  return (
    <TooltipProvider>
      <div className="flex h-full bg-background text-foreground">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[720px] px-6 pt-12 pb-12">
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
