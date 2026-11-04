import { useCore } from '@/ui/app/CoreProvider';

/** An https link that opens in the system browser inside Tauri; in preview, where `openUrl` is absent, the anchor works normally. */
export function ExternalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  const { openUrl } = useCore();
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      onClick={(e) => {
        if (openUrl && href.startsWith('https://')) {
          e.preventDefault();
          openUrl(href).catch((err: unknown) => console.error('open link failed', err));
        }
      }}
    >
      {children}
    </a>
  );
}
