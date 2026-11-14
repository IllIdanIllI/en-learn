import { VOICE_FILES, voiceUrl } from './files';
import type { VoiceIo } from './io';

/**
 * Makes sure every voice file is in `dir` with its exact size. Complete files are kept; the others are
 * streamed to `<file>.part` and renamed only when the size is right. A failure removes the `.part` and rethrows,
 * so a short file is never used and the next call starts that file again.
 * `onProgress` gets the fraction of the bytes still to fetch that are done.
 */
export async function ensureVoiceFiles(io: VoiceIo, dir: string, onProgress: (fraction: number) => void): Promise<void> {
  const missing: { path: string; size: number; dest: string }[] = [];
  for (const file of VOICE_FILES) {
    const dest = `${dir}/${file.path}`;
    if ((await io.size(dest)) !== file.size) missing.push({ ...file, dest });
  }
  const total = missing.reduce((sum, file) => sum + file.size, 0);
  if (total === 0) {
    onProgress(1);
    return;
  }
  let done = 0;
  for (const file of missing) {
    const part = `${file.dest}.part`;
    const base = done;
    try {
      await io.download(voiceUrl(file.path), part, (n) => onProgress((base + n) / total));
      if ((await io.size(part)) !== file.size) throw new Error(`voice file ${file.path} has the wrong size`);
      await io.rename(part, file.dest);
    } catch (e) {
      await io.remove(part).catch(() => undefined);
      throw e;
    }
    done += file.size;
    onProgress(done / total);
  }
}
