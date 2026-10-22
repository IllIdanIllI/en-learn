import type { Migration } from './migrate';

const files = import.meta.glob('/src/db/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const migrations: Migration[] = Object.entries(files)
  .map(([path, sql]) => ({ version: Number(/\/(\d+)[^/]*\.sql$/.exec(path)?.[1]), sql }))
  .sort((a, b) => a.version - b.version);
