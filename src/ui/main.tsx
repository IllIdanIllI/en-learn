import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
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
    root.render(<pre className="p-6 whitespace-pre-wrap">{e instanceof Error ? e.message : String(e)}</pre>);
  },
);
