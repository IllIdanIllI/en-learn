const OXFORD_SEARCH = 'https://www.oxfordlearnersdictionaries.com/search/english/?q=';

/** The word's own link when it is https, else the code-built Oxford search link. */
export function wordLink(word: string, link: string): string {
  const trimmed = link.trim();
  return trimmed.startsWith('https://') ? trimmed : `${OXFORD_SEARCH}${encodeURIComponent(word)}`;
}
