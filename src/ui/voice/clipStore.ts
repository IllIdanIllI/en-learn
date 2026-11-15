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
