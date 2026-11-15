import { fetch } from '@tauri-apps/plugin-http';
import { exists, mkdir, open, readDir, readFile, remove, rename, stat } from '@tauri-apps/plugin-fs';
import type { ClipIo } from './clipStore';

/** A download that gets no chunk for this long is stalled: it rejects, and the `.part` cleanup takes over. */
const STALL_MS = 30_000;

/** Reads the next chunk, or rejects (and cancels the stream) when none arrives within STALL_MS. */
function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('download stalled: no data for 30 s'));
      reader.cancel().catch(() => undefined);
    }, STALL_MS);
  });
  return Promise.race([reader.read(), stalled]).finally(() => clearTimeout(timer));
}

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
        const { done, value } = await readChunk(reader);
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

/** The Tauri implementation of the clip folder access (plugin-fs, scope `$APPDATA/voice/**`). */
export class TauriClipIo implements ClipIo {
  async read(path: string): Promise<ArrayBuffer | null> {
    if (!(await exists(path))) return null;
    const bytes = await readFile(path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  async write(path: string, bytes: ArrayBuffer): Promise<void> {
    await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    const file = await open(path, { write: true, create: true, truncate: true });
    try {
      await file.write(new Uint8Array(bytes));
    } finally {
      await file.close();
    }
  }

  remove(path: string): Promise<void> {
    return remove(path);
  }

  async list(dir: string): Promise<{ name: string; size: number; modified: number }[]> {
    if (!(await exists(dir))) return [];
    const out: { name: string; size: number; modified: number }[] = [];
    for (const entry of await readDir(dir)) {
      if (!entry.isFile) continue;
      const info = await stat(`${dir}/${entry.name}`);
      out.push({ name: entry.name, size: info.size, modified: info.mtime?.getTime() ?? 0 });
    }
    return out;
  }
}
