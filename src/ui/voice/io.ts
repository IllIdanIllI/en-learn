import { fetch } from '@tauri-apps/plugin-http';
import { exists, mkdir, open, readFile, remove, rename, stat } from '@tauri-apps/plugin-fs';

/** File access for the voice files. Paths are absolute; `download` creates the parent folders. */
export interface VoiceIo {
  /** Size in bytes, or null when the file is missing. */
  size(path: string): Promise<number | null>;
  /** Streams the URL to `dest`; `onBytes` gets the cumulative bytes written. Throws on a failed response. */
  download(url: string, dest: string, onBytes: (n: number) => void): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  read(path: string): Promise<ArrayBuffer>;
}

/** The Tauri implementation: plugin-http for the download, plugin-fs for the files (scope `$APPDATA/voice/**`). */
export class TauriVoiceIo implements VoiceIo {
  async size(path: string): Promise<number | null> {
    if (!(await exists(path))) return null;
    return (await stat(path)).size;
  }

  async download(url: string, dest: string, onBytes: (n: number) => void): Promise<void> {
    const res = await fetch(url);
    if (!res.ok || res.body === null) throw new Error(`download failed: HTTP ${res.status}`);
    await mkdir(dest.slice(0, dest.lastIndexOf('/')), { recursive: true });
    const file = await open(dest, { write: true, create: true, truncate: true });
    try {
      const reader = res.body.getReader();
      let written = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await file.write(value);
        written += value.byteLength;
        onBytes(written);
      }
    } finally {
      await file.close();
    }
  }

  rename(from: string, to: string): Promise<void> {
    return rename(from, to);
  }

  remove(path: string): Promise<void> {
    return remove(path);
  }

  async read(path: string): Promise<ArrayBuffer> {
    const bytes = await readFile(path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
}
