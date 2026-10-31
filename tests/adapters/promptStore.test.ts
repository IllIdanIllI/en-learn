import { beforeEach, expect, test, vi } from 'vitest';
import { bundledPrompts } from '@/core/llm/bundledPrompts';

const exists = vi.fn();
const readTextFile = vi.fn();
vi.mock('@tauri-apps/plugin-fs', () => ({ exists, readTextFile }));

beforeEach(() => {
  exists.mockReset();
  readTextFile.mockReset();
});

test('an override that cannot be read counts as no override', async () => {
  const { TauriPromptStore } = await import('@/adapters/tauri/promptStore');
  exists.mockRejectedValue(new Error('forbidden path'));
  await expect(new TauriPromptStore('/data/app').load('grade')).resolves.toEqual(bundledPrompts.grade);

  exists.mockResolvedValue(true);
  readTextFile.mockRejectedValue(new Error('forbidden path'));
  await expect(new TauriPromptStore('/data/app').load('grade')).resolves.toEqual(bundledPrompts.grade);
});

test('a readable override is used', async () => {
  const { TauriPromptStore } = await import('@/adapters/tauri/promptStore');
  exists.mockImplementation(async (p: string) => p.endsWith('.md'));
  readTextFile.mockResolvedValue('custom prompt');
  const loaded = await new TauriPromptStore('/data/app').load('grade');
  expect(loaded.system).toBe('custom prompt');
  expect(loaded.schema).toEqual(bundledPrompts.grade.schema);
});
