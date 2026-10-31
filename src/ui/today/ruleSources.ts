import { ruleSections } from '@/core/rules/rules';

/** The rule body owns its Sources section; the structured list is shown only when the body has none. */
export function bodyHasSources(body: string): boolean {
  return ruleSections(body).some((h) => ['источники', 'sources'].includes(h.toLowerCase()));
}
