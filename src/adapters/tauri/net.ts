import { fetch } from '@tauri-apps/plugin-http';
import type { Net } from '@/core/ports';

const TIMEOUT_MS = 20_000;

/** HTTP through the Tauri http plugin (the webview's fetch is blocked by CORS for these hosts). A request that takes longer than 20 s is aborted. */
export class TauriNet implements Net {
  async getText(url: string): Promise<{ status: number; text: string }> {
    const res = await fetch(url, { headers: { 'User-Agent': 'en-learn' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { status: res.status, text: await res.text() };
  }
}
