import type { Net } from '@/core/ports';
import { kaikkiUrl } from '@/core/words/dictionary';

const files = import.meta.glob('./kaikki/*.jsonl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Preview: the recorded kaikki replies for their words; any other URL is 404 (no entry). */
const replies = new Map(
  Object.entries(files).map(([path, text]) => [kaikkiUrl(path.split('/').pop()!.replace(/\.jsonl$/, '')), text]),
);

export const previewNet: Net = {
  getText: async (url) => {
    const text = replies.get(url);
    return text === undefined ? { status: 404, text: '' } : { status: 200, text };
  },
};
