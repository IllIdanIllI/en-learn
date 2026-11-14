/**
 * A text picture of a clip: one character per cell, `#` when the cell's peak `|x|` is above the threshold, else `.`.
 * Cell `i` covers the samples `[floor(i*n/cells), floor((i+1)*n/cells))`. An empty clip gives `''`.
 */
export function outline(pcm: Float32Array, cells = 20, threshold = 0.02): string {
  const n = pcm.length;
  if (n === 0) return '';
  let out = '';
  for (let i = 0; i < cells; i++) {
    const from = Math.floor((i * n) / cells);
    const to = Math.floor(((i + 1) * n) / cells);
    let peak = 0;
    for (let j = from; j < to; j++) peak = Math.max(peak, Math.abs(pcm[j]!));
    out += peak > threshold ? '#' : '.';
  }
  return out;
}
