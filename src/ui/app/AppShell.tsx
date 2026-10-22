import { Outlet, useLocation } from 'react-router-dom';
import { Toaster } from '@/ui/components/ui/sonner';
import { TooltipProvider } from '@/ui/components/ui/tooltip';
import { ErrorBoundary } from './ErrorBoundary';
import { Sidebar } from './Sidebar';

/** Without `claude` only Today changes (it shows the prerequisites notice); every other page stays usable. */
export function AppShell() {
  const { pathname } = useLocation();
  return (
    <TooltipProvider>
      <div className="flex h-full bg-background text-foreground">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[720px] px-6 pt-12 pb-12">
            <ErrorBoundary resetKey={pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
