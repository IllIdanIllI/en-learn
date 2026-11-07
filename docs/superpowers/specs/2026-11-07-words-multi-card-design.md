# Design: several cards per word in one practice (2026-11-07)

Agreed with the learner in chat on 2026-11-07. It replaces the "a word appears at most once, plus one repeat" rule of V8 (`2026-11-04-words-design.md`); everything else there and in the feedback specs (`2026-11-05-words-feedback-{1,2}.md`) holds.

## Why
A practice showed each word once, so a new word got only its choice card and then waited a day. Other apps show a new word several times in its first session: Memrise about 3 tests (up to 6 to "plant" it), Quizlet Learn 2 correct answers going from multiple choice to written, Anki two same-day learning steps. Research (Rawson & Dunlosky, successive relearning) recommends 3 correct recalls in the first session, then one per later session spread over days. Only the first answer of the day sets the schedule (Anki with FSRS works the same way).

## M1. Cards per word
| Word at the start of the practice | Cards | After a mistake |
|---|---|---|
| New: never answered (`!state.reviewed`) | 3 | +1, max 4 |
| In progress: answered, stage 1–3 | 2 | +1, max 3 |
| Learned: stage 4 | 1 | +1, max 2 |

- A wrong answer on any card of the word adds **one** extra card; a word gets at most one extra card per practice.
- "Almost" followed by a correct retry and a correct answer after the hint are not mistakes (they rate Hard, as now).

## M2. Which exercises
The plan of each word is fixed when the practice starts, from its stage at that moment (a stage change during the practice does not change the remaining cards).

- **New word:** choice → anagram → gap with the translation (`gap_hint`). Without a gap exercise: choice → anagram → anagram.
- **In progress, stage 1 (New):** anagram and `gap_hint` (two anagrams without a gap exercise). The choice card stays only on a word's very first card (V4).
- **Stage 2 (Recall):** two **different** types from gap / collocation / form / confusable; if only one type exists, the same type with another item.
- **Stage 3 (Use):** translation → "use it". Without a translation exercise: one Recall type → "use it".
- **Learned:** one random exercise from Recall and Use (as now).
- **Extra card after a mistake:** the same exercise type as the missed card, with the item used least recently (another item when there is one). A missed choice card gets an anagram instead (choice is never shown twice).
- **Within a type** the least recently used item comes first (as now); two cards of the same type in one plan use different items when there are enough.
- **"Use it" Skip** (V4): the card is replaced at once by a translation card of the same word if one exists; otherwise the card is dropped and the practice moves on.

## M3. Order: rounds
- Round 1 holds the first card of every word, round 2 the second cards, and so on.
- Within a round, words with more cards come first (new, then in progress, then learned); equal counts keep the queue order (due first). This keeps a word's cards apart across round borders.
- An extra card after a mistake goes to the end of the next round (a new round when the mistake was in the last one); if that would put it right after a card of the same word, it goes one place earlier.
- So a word's cards never come one after another, except when it is the only word left with cards.

## M4. Counting (unchanged)
- Only the first answer to a word on a calendar day counts for FSRS and the stage (V5). The other cards are saved as reviews with `counted = false`.

## M5. Practice size
- One practice = **10 words**: due words first (the most overdue first), then new words up to today's limit (10 + "+10 new words" extra, F3, unchanged). That is about 15–35 cards.
- Header: card position and the current card total, "7 / 24"; the total grows when an extra card is added.
- End screen: "Готово: 8 из 10" / "Done: 8 of 10 correct" keeps its meaning: words whose **first card in this practice** was correct, out of the words practised. Moved up / Moved down unchanged.
- "Продолжить · ещё 20" / "Continue · 20 more" becomes "Продолжить · ещё 10 слов" / "Continue · 10 more words", shown when more words are available.
- "Today" link, Words page counts and "+10 new words" keep counting words (unchanged).

## M6. Testing
- **Vitest** (pure plan builder, in `src/core/words/`):
  - card counts: new 3, in progress 2, learned 1;
  - card types per M2, including the fallbacks (no gap, one Recall type, no translation);
  - rounds: order across rounds, no word twice in a row unless it is the only one;
  - extra card: added once per word, same type (anagram for a missed choice), placed at the end of the next round, max per category;
  - practice of 10 words: due first, then new within the limit.
- **E2E** (`tests/e2e/words.spec.ts`, preview states): a new word shows choice, anagram and gap cards in that order across rounds; a wrong answer adds one card and the header total grows; "Continue · 10 more words"; the end screen count. Cursor cases are unchanged (no new controls).
