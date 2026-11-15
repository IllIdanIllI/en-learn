/** The texts to prepare for a training, most wanted first: the words of `cards[index..]` in order, then their examples, each text once. */
export function planTexts(cards: { word: { word: string; example: string } }[], index: number): string[] {
  const later = cards.slice(index);
  const texts = new Set<string>();
  for (const { word } of later) texts.add(word.word);
  for (const { word } of later) if (word.example !== '') texts.add(word.example);
  return [...texts];
}
