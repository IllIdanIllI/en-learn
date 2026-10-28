import { en } from './en';
import { ru } from './ru';

export type Lang = 'ru' | 'en';
export type MessageKey = keyof typeof en;

const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, ru };

const PLACEHOLDER = /\{(\w+)\}/g;

export function t(lang: Lang, key: MessageKey, vars: Record<string, string | number> = {}): string {
  return dictionaries[lang][key].replace(PLACEHOLDER, (_match, name: string) => {
    const value = vars[name];
    if (value === undefined) {
      throw new Error(`Missing i18n var: ${name}`);
    }
    return String(value);
  });
}

/** CLDR plural category of `n` in the language (ru: one/few/many, en: one/other). */
export function pluralForm(lang: Lang, n: number): Intl.LDMLPluralRule {
  return new Intl.PluralRules(lang).select(n);
}
