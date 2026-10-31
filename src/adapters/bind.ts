/** Parameter handling shared by the SQL adapters: booleans become 1/0, undefined becomes null. */
export function bindParams(params: unknown[] = []): unknown[] {
  return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p === undefined ? null : p));
}
