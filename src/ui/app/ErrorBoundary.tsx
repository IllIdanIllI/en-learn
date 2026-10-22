import { Component, type ReactNode } from 'react';
import { t } from '@/core/i18n';
import { Button } from '@/ui/components/ui/button';
import { useCore } from './CoreProvider';

function Fallback() {
  const { lang } = useCore();
  return (
    <div role="alert">
      <h1 className="headline">{t(lang, 'error.boundary.title')}</h1>
      <p className="mt-2 text-muted-foreground">{t(lang, 'error.boundary.hint')}</p>
      <Button className="mt-6" variant="secondary" onClick={() => window.location.reload()}>
        {t(lang, 'error.reload')}
      </Button>
    </div>
  );
}

/** A render error shows a calm fallback instead of a blank window; a new `resetKey` (the route) clears it. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error(error);
  }

  componentDidUpdate(prev: { resetKey?: string }): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render(): ReactNode {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}
