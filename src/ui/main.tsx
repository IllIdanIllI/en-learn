import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { t, type Lang } from '@/core/i18n';
import './styles/globals.css';
import { boot } from './app/boot';
import { CoreProvider } from './app/CoreProvider';
import { AppRoutes } from './app/routes';

const root = createRoot(document.getElementById('root')!);

boot().then(
  (init) =>
    root.render(
      <StrictMode>
        <CoreProvider init={init}>
          <AppRoutes />
        </CoreProvider>
      </StrictMode>,
    ),
  (e: unknown) => {
    console.error(e);
    // Settings are not available here: the app's default language (Russian) unless the system language is English.
    const lang: Lang = navigator.language.toLowerCase().startsWith('en') ? 'en' : 'ru';
    root.render(
      <div role="alert" className="p-6">
        <p className="font-semibold">{t(lang, 'boot.failed')}</p>
        <pre className="mt-2 whitespace-pre-wrap">{e instanceof Error ? e.message : String(e)}</pre>
      </div>,
    );
  },
);
