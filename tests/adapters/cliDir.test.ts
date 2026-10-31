import { beforeEach, expect, test, vi } from 'vitest';

const mkdir = vi.fn(() => Promise.resolve());
vi.mock('@tauri-apps/plugin-fs', () => ({ mkdir }));

beforeEach(() => mkdir.mockClear());

test('ensureCliDir creates <app data>/cli and returns it', async () => {
  const { ensureCliDir } = await import('@/adapters/tauri/cliDir');
  await expect(ensureCliDir('/data/app')).resolves.toBe('/data/app/cli');
  expect(mkdir).toHaveBeenCalledWith('/data/app/cli', { recursive: true });
});
