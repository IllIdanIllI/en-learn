import { fetch } from '@tauri-apps/plugin-http';
import type { Net } from '@/core/ports';

/** HTTP through the Tauri http plugin (the webview's fetch is blocked by CORS for these hosts). */
export class TauriNet implements Net {
  async getText(url: string): Promise<{ status: number; text: string }> {
    const res = await fetch(url, { headers: { 'User-Agent': 'en-learn' } });
    return { status: res.status, text: await res.text() };
  }
}
