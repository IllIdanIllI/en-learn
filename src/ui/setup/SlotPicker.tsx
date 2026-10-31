import { t, type Lang, type MessageKey } from '@/core/i18n';
import type { Slot } from '@/core/domain';
import { Select } from '@/ui/components/ui/select';
import { FieldError } from '@/ui/components/FieldError';
import { SLOTS, WEEKDAYS, type SetupErrors, type SetupForm, type Weekday } from './form';

export function SlotPicker({
  lang,
  slots,
  errors,
  onChange,
}: {
  lang: Lang;
  slots: SetupForm['slots'];
  errors: SetupErrors['slots'];
  onChange: (weekday: Weekday, slot: Slot | '') => void;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {WEEKDAYS.map((wd) => {
        const id = `slot-${wd}`;
        const err = errors[wd];
        return (
          <li key={wd}>
            <div className="flex items-center gap-3">
              <label htmlFor={id} className="w-36 shrink-0 text-muted-foreground">
                {t(lang, `weekday.${wd}` as MessageKey)}
              </label>
              <Select
                id={id}
                value={slots[wd]}
                aria-invalid={err ? true : undefined}
                onValueChange={(v) => onChange(wd, v as Slot | '')}
                options={[
                  { value: '', label: t(lang, 'setup.slotChoose') },
                  ...SLOTS.map((s) => ({ value: s, label: t(lang, `slot.${s}` as MessageKey) })),
                ]}
                className="max-w-64"
              />
            </div>
            {err && <FieldError className="ml-[168px]">{t(lang, err)}</FieldError>}
          </li>
        );
      })}
    </ul>
  );
}
