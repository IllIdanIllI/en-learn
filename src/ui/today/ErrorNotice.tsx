import { useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '@/core/i18n';
import { useCore } from '@/ui/app/CoreProvider';
import { Button } from '@/ui/components/ui/button';
import { Notice } from './chips';

/** A failed build or check: `code` picks the text and the next step; without a known code the message is shown with Retry. */
export function ErrorNotice({ kind, message, code, busy, onRetry, className }: {
  kind: 'gen' | 'grade'; message: string; code?: string; busy: boolean; onRetry: () => void; className?: string;
}) {
  const { lang, recheckPrerequisites } = useCore();
  const [checking, setChecking] = useState(false);
  const [stillOut, setStillOut] = useState(false);

  const retry = (
    <Button variant="secondary" size="sm" disabled={busy} onClick={onRetry}>
      {t(lang, 'today.retry')}
    </Button>
  );

  if (code === 'not_signed_in') {
    const check = async () => {
      setChecking(true);
      setStillOut(false);
      try {
        const result = await recheckPrerequisites();
        if (result?.ok) onRetry();
        else setStillOut(true);
      } finally {
        setChecking(false);
      }
    };
    return (
      <Notice className={className}>
        <span>{t(lang, 'error.notSignedIn')}</span>
        <Button variant="secondary" size="sm" disabled={busy || checking} onClick={() => void check()}>
          {t(lang, 'error.signedIn')}
        </Button>
        {stillOut && <span>{t(lang, 'error.stillNotSignedIn')}</span>}
      </Notice>
    );
  }
  if (code === 'budget') {
    return (
      <Notice className={className}>
        <span>{t(lang, 'error.budget')}</span>
        <Link to="/settings" className="underline underline-offset-2">{t(lang, 'error.budgetLink')}</Link>
      </Notice>
    );
  }
  if (code === 'session_exists') return <Notice className={className}>{t(lang, 'error.sessionExists')}</Notice>;
  if (code === 'session_not_found') return <Notice className={className}>{t(lang, 'error.sessionNotFound')}</Notice>;
  if (code === 'session_not_ready') {
    return (
      <Notice className={className}>
        <span>{t(lang, 'error.sessionNotReady')}</span>
        {retry}
      </Notice>
    );
  }
  return (
    <Notice className={className}>
      <span>{t(lang, kind === 'gen' ? 'today.genError' : 'grade.error', { message })}</span>
      {retry}
    </Notice>
  );
}
