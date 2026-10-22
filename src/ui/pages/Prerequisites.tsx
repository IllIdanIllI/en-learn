import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t, type MessageKey } from '@/core/i18n';
import { Button } from '@/ui/components/ui/button';
import { useCore } from '@/ui/app/CoreProvider';

const INSTALL = 'curl -fsSL https://claude.ai/install.sh | bash';
const LINK = 'ln -s "$(which claude)" ~/.local/bin/claude';

function Command({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-sm border border-border bg-input px-3 py-2 font-mono text-[0.9375rem] select-all">
      {children}
    </pre>
  );
}

export function Prerequisites() {
  const { lang, prereq, recheckPrerequisites } = useCore();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [stillMissing, setStillMissing] = useState(false);
  const checked = prereq && !prereq.ok ? prereq.checked : [];

  const check = async () => {
    setChecking(true);
    setStillMissing(false);
    try {
      const result = await recheckPrerequisites();
      if (result?.ok) navigate('/today');
      else setStillMissing(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <h1 className="headline">{t(lang, 'page.prerequisites')}</h1>
      <p className="mt-2 text-muted-foreground">{t(lang, 'prereq.intro')}</p>

      <h2 className="title mt-10">{t(lang, 'prereq.checked')}</h2>
      <ul className="mt-3 border-t border-border">
        {checked.map((entry) => (
          <li key={entry.location} className="flex items-baseline justify-between gap-6 border-b border-border py-3">
            <span className="font-mono text-[0.9375rem]">{entry.path}</span>
            <span className="text-muted-foreground">{t(lang, `prereq.result.${entry.result}` as MessageKey)}</span>
          </li>
        ))}
      </ul>

      <h2 className="title mt-10">{t(lang, 'prereq.fix')}</h2>
      <ol className="mt-3 flex flex-col gap-5">
        <li>
          <p>{t(lang, 'prereq.step1')}</p>
          <Command>{INSTALL}</Command>
        </li>
        <li>
          <p>{t(lang, 'prereq.step2')}</p>
          <Command>{LINK}</Command>
        </li>
        <li>
          <p>{t(lang, 'prereq.step3')}</p>
          <Command>claude</Command>
        </li>
      </ol>

      <div className="mt-10">
        <Button id="prereq-check" variant="secondary" disabled={checking} onClick={() => void check()}>
          {checking ? `${t(lang, 'prereq.checking')}…` : t(lang, 'prereq.check')}
        </Button>
        <p role="status" className="mt-3 rounded-sm bg-muted px-3 py-2 text-note" hidden={!stillMissing}>
          {stillMissing ? t(lang, 'prereq.stillMissing') : ''}
        </p>
      </div>
    </>
  );
}
