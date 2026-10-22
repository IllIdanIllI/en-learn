import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t, type Lang } from '@/core/i18n';
import { getProgramme, getSlots, getTopics } from '@/core/db/repos/programme';
import { insertSeedRules, replaceProgramme, saveProgramme, type SeedRule } from '@/core/programme/setup';
import { Button } from '@/ui/components/ui/button';
import { FieldInput } from '@/ui/components/ui/field-input';
import { FieldError } from '@/ui/components/FieldError';
import { useCore } from '@/ui/app/CoreProvider';
import { SlotPicker } from '@/ui/setup/SlotPicker';
import { TopicList } from '@/ui/setup/TopicList';
import {
  emptyForm,
  endDateOf,
  formFromInput,
  formFromStored,
  newRow,
  toInput,
  validate,
  type SetupErrors,
  type SetupForm,
} from '@/ui/setup/form';

const NO_ERRORS: SetupErrors = { slots: {}, rows: {} };

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="title">{title}</h2>
      {hint && <p className="mt-1 text-muted-foreground">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function LabelledField({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex-1">
      <label htmlFor={id} className="label mb-1 block text-muted-foreground">
        {label}
      </label>
      {children}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

interface Loaded { form: SetupForm; exists: boolean; seedRules: SeedRule[] }

function useLoaded(): Loaded | null {
  const { deps, loadSeedInput } = useCore();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const programme = await getProgramme(deps.db);
      let next: Loaded;
      if (programme) {
        const [topics, slots] = await Promise.all([getTopics(deps.db), getSlots(deps.db)]);
        next = { form: formFromStored(programme, topics, slots), exists: true, seedRules: [] };
      } else {
        const seed = loadSeedInput();
        next = seed
          ? { form: formFromInput(seed.programme), exists: false, seedRules: seed.rules }
          : { form: emptyForm(), exists: false, seedRules: [] };
      }
      if (live) setLoaded(next);
    })().catch((e: unknown) => console.error('setup load failed', e));
    return () => {
      live = false;
    };
  }, [deps.db, loadSeedInput]);
  return loaded;
}

export function Setup() {
  const loaded = useLoaded();
  const { lang } = useCore();
  return (
    <>
      <h1 className="headline">{t(lang, 'page.setup')}</h1>
      {loaded && <SetupFormView key="form" loaded={loaded} lang={lang} />}
    </>
  );
}

function SetupFormView({ loaded, lang }: { loaded: Loaded; lang: Lang }) {
  const { deps, refresh } = useCore();
  const navigate = useNavigate();
  const [form, setForm] = useState(loaded.form);
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const result = validate(form);
  const errors = submitted && !result.ok ? result.errors : NO_ERRORS;
  const patch = (p: Partial<SetupForm>) => {
    setForm((f) => ({ ...f, ...p }));
    setConfirming(false);
  };

  const persist = async () => {
    if (!result.ok) return;
    setSaving(true);
    setSaveError(null);
    try {
      const input = toInput(form);
      if (loaded.exists) {
        await replaceProgramme(deps.db, input);
      } else {
        await saveProgramme(deps.db, input);
        await insertSeedRules(deps.db, loaded.seedRules, deps.clock.now());
      }
      refresh();
      navigate('/today');
    } catch (e) {
      setSaveError(t(lang, 'setup.err.save', { message: e instanceof Error ? e.message : String(e) }));
      setSaving(false);
    }
  };

  const onSave = () => {
    setSubmitted(true);
    if (!result.ok) return;
    if (loaded.exists) setConfirming(true);
    else void persist();
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <p className="mt-2 text-muted-foreground">{t(lang, 'setup.intro')}</p>

      <div className="mt-8">
        <LabelledField id="setup-title" label={t(lang, 'setup.title')} error={errors.title && t(lang, errors.title)}>
          <FieldInput
            id="setup-title"
            value={form.title}
            aria-invalid={errors.title ? true : undefined}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </LabelledField>
      </div>
      <div className="mt-4 flex gap-4">
        <LabelledField id="setup-start" label={t(lang, 'setup.start')} error={errors.start && t(lang, errors.start)}>
          <FieldInput
            id="setup-start"
            type="date"
            value={form.startDate}
            aria-invalid={errors.start ? true : undefined}
            onChange={(e) => patch({ startDate: e.target.value })}
          />
        </LabelledField>
        <LabelledField id="setup-end" label={t(lang, 'setup.end')} error={errors.end && t(lang, errors.end)}>
          <FieldInput
            id="setup-end"
            type="date"
            value={endDateOf(form)}
            aria-invalid={errors.end ? true : undefined}
            onChange={(e) => patch({ endOverride: e.target.value === '' ? null : e.target.value })}
          />
        </LabelledField>
      </div>

      <Section title={t(lang, 'setup.weeks')} hint={t(lang, 'setup.weeksHint')}>
        <TopicList
          lang={lang}
          rows={form.weeks}
          numbered
          testId="week-row"
          addLabel={t(lang, 'setup.addWeek')}
          errors={errors.rows}
          onChange={(weeks) => patch({ weeks })}
          onAdd={() => patch({ weeks: [...form.weeks, newRow('learn')] })}
        />
        {errors.weeks && <FieldError>{t(lang, errors.weeks)}</FieldError>}
      </Section>

      <Section title={t(lang, 'setup.background')} hint={t(lang, 'setup.backgroundHint')}>
        <TopicList
          lang={lang}
          rows={form.background}
          numbered={false}
          testId="background-row"
          addLabel={t(lang, 'setup.addBackground')}
          errors={errors.rows}
          onChange={(background) => patch({ background })}
          onAdd={() => patch({ background: [...form.background, newRow('notice')] })}
        />
      </Section>

      <Section title={t(lang, 'setup.slots')}>
        <SlotPicker
          lang={lang}
          slots={form.slots}
          errors={errors.slots}
          onChange={(wd, slot) => patch({ slots: { ...form.slots, [wd]: slot } })}
        />
      </Section>

      <div className="mt-10 border-t border-border pt-6">
        {confirming ? (
          <div>
            <p>{t(lang, 'setup.replaceWarning')}</p>
            <div className="mt-3 flex gap-2">
              <Button id="setup-confirm" type="button" disabled={saving} onClick={() => void persist()}>
                {t(lang, 'setup.confirm')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                {t(lang, 'setup.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button id="setup-save" type="submit" disabled={saving}>
            {t(lang, 'setup.save')}
          </Button>
        )}
        {saveError && <FieldError>{saveError}</FieldError>}
      </div>
    </form>
  );
}
