import { mkdir } from '@tauri-apps/plugin-fs';

/** The CLI runs in its own empty folder so no project files or CLAUDE.md from the app data folder are picked up. */
export async function ensureCliDir(appDataDir: string): Promise<string> {
  const dir = `${appDataDir}/cli`;
  await mkdir(dir, { recursive: true });
  return dir;
}
