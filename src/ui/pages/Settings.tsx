import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { t, type MessageKey } from '@/core/i18n';
import type { Effort, LlmKind } from '@/core/domain';
import { CLAUDE_LOCATIONS } from '@/core/llm/claude';
import { MoveRefused, moveTarget } from '@/core/dataFolder';
import { Button } from '@/ui/components/ui/button';
import { setSetting, type Settings as SettingsData } from '@/core/db/repos/settings';
import { FieldInput } from '@/ui/components/ui/field-input';
import { Select } from '@/ui/components/ui/select';
import { cn } from '@/lib/utils';
import { FieldError } from '@/ui/components/FieldError';
import { Segmented } from '@/ui/components/Segmented';
import { useCore } from '@/ui/app/CoreProvider';
import { Notice } from '@/ui/today/chips';

const MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'];
const EFFORTS: Effort[] = ['low', 'medium', 'high'];
const KINDS: LlmKind[] = ['rule_draft', 'rule_chat', 'generate_session', 'validate_session', 'grade', 'dispute'];

function Row({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-6 border-b border-border py-4">
      <div className="w-56 shrink-0 pt-1.5">
        <label htmlFor={htmlFor} className="text-foreground">
          {label}
        </label>
        {hint && <p className="label mt-0.5 text-muted-foreground">{hint}</p>}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const parseBudget = (raw: string): number | null | 'invalid' => {
  const text = raw.trim();
  if (text === '') return null;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 'invalid';
};

export function Settings() {
  const { deps, lang, settings, prereq, dataDir, dataDirError, moveDataDir, refresh } = useCore();
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const [budget, setBudget] = useState(settings.budgetUsd === null ? '' : String(settings.budgetUsd));
  const [budgetInvalid, setBudgetInvalid] = useState(false);
  const [failed, setFailed] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const changeDataDir = async () => {
    if (!moveDataDir) return;
    setMoveError(null);
    try {
      const { open, ask } = await import('@tauri-apps/plugin-dialog');
      const picked = await open({ directory: true, multiple: false, recursive: true });
      if (typeof picked !== 'string' || !(await ask(t(lang, 'settings.dataDir.confirm', { path: moveTarget(picked) }), { kind: 'warning' }))) return;
      setMoving(true);
      await moveDataDir(picked);
    } catch (e) {
      setMoveError(
        e instanceof MoveRefused
          ? t(lang, `settings.dataDir.err.${e.reason}` as MessageKey)
          : t(lang, 'settings.dataDir.err.failed', { message: e instanceof Error ? e.message : String(e) }),
      );
    } finally {
      setMoving(false);
    }
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const save = async <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    try {
      await setSetting(deps.db, key, value);
      setFailed(false);
      refresh();
      setSaved(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('setting not saved', e);
      setFailed(true);
    }
  };

  const onBudget = (raw: string) => {
    setBudget(raw);
    const parsed = parseBudget(raw);
    setBudgetInvalid(parsed === 'invalid');
    if (parsed !== 'invalid') void save('budgetUsd', parsed);
  };

  const claude = prereq === null
    ? t(lang, 'settings.claudeUnchecked')
    : prereq.ok
      ? t(lang, 'settings.claudeFound', {
          path: CLAUDE_LOCATIONS.find((l) => l.loc === prereq.location)?.path ?? prereq.location,
          version: prereq.version,
        })
      : t(lang, 'settings.claudeNotFound');

  return (
    <>
      <div className="flex items-baseline justify-between">
        <h1 className="headline">{t(lang, 'nav.settings')}</h1>
        <p role="status" className="label text-muted-foreground">
          {saved ? t(lang, 'settings.saved') : ''}
        </p>
      </div>
      {failed && <FieldError>{t(lang, 'settings.err.save')}</FieldError>}
      {dataDirError && <Notice className="mt-4">{t(lang, 'settings.dataDir.err.location', { message: dataDirError })}</Notice>}

      <div className="mt-6 border-t border-border">
        <Row label={t(lang, 'settings.language')}>
          <Segmented
            label={t(lang, 'settings.language')}
            value={settings.nativeLanguage}
            options={[
              { value: 'ru', label: 'Русский' },
              { value: 'en', label: 'English' },
            ]}
            onChange={(v) => void save('nativeLanguage', v)}
          />
        </Row>
        <Row label={t(lang, 'settings.spelling')}>
          <Segmented
            label={t(lang, 'settings.spelling')}
            value={settings.spellingVariant}
            options={[
              { value: 'british', label: t(lang, 'settings.spelling.british') },
              { value: 'american', label: t(lang, 'settings.spelling.american') },
            ]}
            onChange={(v) => void save('spellingVariant', v)}
          />
        </Row>
        <Row label={t(lang, 'settings.theme')}>
          <Segmented
            label={t(lang, 'settings.theme')}
            value={settings.theme}
            options={(['dark', 'light', 'system'] as const).map((v) => ({ value: v, label: t(lang, `settings.theme.${v}` as MessageKey) }))}
            onChange={(v) => void save('theme', v)}
          />
        </Row>
        <Row label={t(lang, 'settings.budget')} htmlFor="settings-budget" hint={t(lang, 'settings.budgetHint')}>
          <FieldInput
            id="settings-budget"
            inputMode="decimal"
            value={budget}
            aria-invalid={budgetInvalid ? true : undefined}
            onChange={(e) => onBudget(e.target.value)}
            className="w-32"
          />
          {budgetInvalid && <FieldError>{t(lang, 'settings.err.budget')}</FieldError>}
        </Row>
      </div>

      <h2 className="title mt-10">{t(lang, 'settings.models')}</h2>
      <p className="label mt-0.5 text-muted-foreground">{t(lang, 'settings.effortHint')}</p>
      <div className="mt-2 border-t border-border">
        {KINDS.map((kind) => {
          const current = settings.models[kind];
          const options = MODELS.includes(current) ? MODELS : [current, ...MODELS];
          return (
            <Row key={kind} label={t(lang, `llm.${kind}` as MessageKey)} htmlFor={`model-${kind}`}>
              <div className="flex flex-wrap gap-3">
                <Select
                  id={`model-${kind}`}
                  data-model-kind={kind}
                  value={current}
                  onValueChange={(v) => void save('models', { ...settings.models, [kind]: v })}
                  options={options.map((m) => ({ value: m, label: m }))}
                  className="max-w-64"
                />
                <Select
                  id={`effort-${kind}`}
                  data-effort-kind={kind}
                  value={settings.efforts[kind]}
                  onValueChange={(v) => void save('efforts', { ...settings.efforts, [kind]: v as Effort })}
                  options={EFFORTS.map((e) => ({ value: e, label: t(lang, `settings.effort.${e}` as MessageKey) }))}
                  aria-label={`${t(lang, `llm.${kind}` as MessageKey)}: ${t(lang, 'settings.effort')}`}
                  className="w-36"
                />
              </div>
            </Row>
          );
        })}
      </div>

      <div className="mt-10">
        <Row label={t(lang, 'settings.claude')}>
          <p className={cn('pt-1.5 break-words', prereq?.ok && 'font-mono text-[0.9375rem]')}>{claude}</p>
        </Row>
        <Row label={t(lang, 'settings.dataDir')}>
          <p className="pt-1.5 font-mono text-[0.9375rem] break-words">{dataDir}</p>
          {moveDataDir && (
            <Button className="mt-2" variant="secondary" disabled={moving} onClick={() => void changeDataDir()}>
              {moving ? t(lang, 'settings.dataDirMoving') : t(lang, 'settings.dataDirChange')}
            </Button>
          )}
          {moveError && <FieldError>{moveError}</FieldError>}
        </Row>
      </div>

      <p className="mt-6">
        <Link
          to="/setup"
          className="rounded-sm text-primary underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {t(lang, 'page.setup')}
        </Link>
      </p>
    </>
  );
}
