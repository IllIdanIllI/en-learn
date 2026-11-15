/** One synthesised clip: mono PCM and its sample rate. */
export interface StoredClip {
  pcm: Float32Array;
  rate: number;
}

/** Clips kept on disk between runs, so a text is synthesised once. Neither method throws. */
export interface ClipStore {
  /** The stored clip for this key, or null when there is none or its file is unusable. */
  get(key: string): Promise<StoredClip | null>;
  /** Saves the clip; a failure is logged and otherwise ignored. */
  put(key: string, clip: StoredClip): Promise<void>;
}

/** File access for the clip folder. Paths are absolute. */
export interface ClipIo {
  /** The file's bytes, or null when it is missing. */
  read(path: string): Promise<ArrayBuffer | null>;
  /** Writes the whole file, creating the parent folder. */
  write(path: string, bytes: ArrayBuffer): Promise<void>;
  remove(path: string): Promise<void>;
  /** The files in the folder (an empty list when it is missing); `modified` is in ms. */
  list(dir: string): Promise<{ name: string; size: number; modified: number }[]>;
}

/** The first 32 hex characters of SHA-256 over revision, voice and text, so another model or voice never reuses a file. */
export async function clipKey(revision: string, voice: string, text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${revision}|${voice}|${text}`));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 32);
}

const HEADER_BYTES = 4;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Clips as `<dir>/<key>.s16`: the sample rate (uint32 LE), then 16-bit PCM (LE).
 * The folder is listed once, lazily; name, size and age are then tracked in memory.
 */
export function createClipStore(io: ClipIo, dir: string, capBytes: number, log: (text: string) => void): ClipStore {
  const entries = new Map<string, { size: number; modified: number }>();
  let listed: Promise<void> | null = null;
  const pathOf = (key: string) => `${dir}/${key}.s16`;

  const ensureListed = (): Promise<void> => {
    listed ??= io
      .list(dir)
      .then((files) => {
        for (const f of files) entries.set(f.name, { size: f.size, modified: f.modified });
      })
      .catch((e: unknown) => log(`clip list failed ${errorMessage(e)}`));
    return listed;
  };

  return {
    async get(key) {
      await ensureListed();
      let bytes: ArrayBuffer | null;
      try {
        bytes = await io.read(pathOf(key));
      } catch (e) {
        log(`clip read failed ${errorMessage(e)}`);
        return null;
      }
      if (bytes === null || bytes.byteLength < HEADER_BYTES || (bytes.byteLength - HEADER_BYTES) % 2 !== 0) return null;
      const view = new DataView(bytes);
      const rate = view.getUint32(0, true);
      if (rate === 0) return null;
      const pcm = new Float32Array((bytes.byteLength - HEADER_BYTES) / 2);
      for (let i = 0; i < pcm.length; i++) pcm[i] = view.getInt16(HEADER_BYTES + i * 2, true) / 32767;
      return { pcm, rate };
    },

    async put(key, clip) {
      await ensureListed();
      const bytes = new ArrayBuffer(HEADER_BYTES + clip.pcm.length * 2);
      const view = new DataView(bytes);
      view.setUint32(0, clip.rate, true);
      for (let i = 0; i < clip.pcm.length; i++) {
        view.setInt16(HEADER_BYTES + i * 2, Math.round(Math.min(1, Math.max(-1, clip.pcm[i] ?? 0)) * 32767), true);
      }
      const name = `${key}.s16`;
      try {
        await io.write(pathOf(key), bytes);
        // The new file is the newest, so it is the last to go.
        const newest = Math.max(0, ...Array.from(entries.values(), (e) => e.modified)) + 1;
        entries.set(name, { size: bytes.byteLength, modified: newest });
        let total = 0;
        for (const e of entries.values()) total += e.size;
        const oldestFirst = [...entries.entries()].sort((a, b) => a[1].modified - b[1].modified);
        for (const [oldName, e] of oldestFirst) {
          if (total <= capBytes || oldName === name) break;
          entries.delete(oldName);
          total -= e.size;
          await io.remove(`${dir}/${oldName}`);
        }
      } catch (e) {
        log(`clip save failed ${errorMessage(e)}`);
      }
    },
  };
}
