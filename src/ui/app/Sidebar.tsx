import { NavLink } from 'react-router-dom';
import { BookOpen, CalendarDays, ChartLine, CircleAlert, Settings as SettingsIcon, type LucideIcon } from 'lucide-react';
import { t, type MessageKey } from '@/core/i18n';
import { cn } from '@/lib/utils';
import { useCore } from './CoreProvider';

const ITEMS: { to: string; key: MessageKey; icon: LucideIcon }[] = [
  { to: '/today', key: 'nav.today', icon: CalendarDays },
  { to: '/progress', key: 'nav.progress', icon: ChartLine },
  { to: '/rules', key: 'nav.rules', icon: BookOpen },
  { to: '/errors', key: 'nav.errors', icon: CircleAlert },
  { to: '/settings', key: 'nav.settings', icon: SettingsIcon },
];

/** 220px with labels; icons only (56px) below 1100px. */
export function Sidebar() {
  const { lang } = useCore();
  return (
    <nav
      aria-label={t(lang, 'nav.label')}
      className="flex w-14 shrink-0 flex-col gap-1 border-r border-border bg-sidebar px-2 py-4 text-sidebar-foreground min-[1100px]:w-[220px]"
    >
      {ITEMS.map(({ to, key, icon: Icon }) => {
        const label = t(lang, key);
        return (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            title={label}
            className={({ isActive }) =>
              cn(
                'relative flex h-8 items-center justify-center gap-2 rounded-md px-2 transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] hover:bg-secondary hover:text-foreground min-[1100px]:justify-start min-[1100px]:pl-4',
                isActive && 'bg-secondary text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span aria-hidden className="absolute top-1/2 left-1.5 size-1 -translate-y-1/2 rounded-full bg-primary" />}
                <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                <span className="hidden min-[1100px]:inline">{label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
