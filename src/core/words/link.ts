const OXFORD_SEARCH = 'https://www.oxfordlearnersdictionaries.com/search/english/?q=';

/** True for a trimmed link that starts with https:// and has something after it. */
export function isHttpsLink(link: string): boolean {
  const trimmed = link.trim();
  return trimmed.length > 'https://'.length && trimmed.startsWith('https://');
}

/** The word's own link when it is https, else the code-built Oxford search link. */
export function wordLink(word: string, link: string): string {
  return isHttpsLink(link) ? link.trim() : `${OXFORD_SEARCH}${encodeURIComponent(word)}`;
}
