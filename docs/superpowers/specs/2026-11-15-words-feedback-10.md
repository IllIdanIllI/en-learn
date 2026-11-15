# Design: words feedback round 10 (2026-11-15)

Agreed with the learner in chat on 2026-11-15 ("Option 1 now, yes store clips, every word"). Binding where it says something; otherwise round 9 holds.

## Evidence (measured in WebKitGTK and Chromium, one thread)
- Making a clip costs about 2.4 s per second of audio: a word 3.5 s, a short example 4.6 s, a long sentence 12.7 s. No warm-up effect.
- The full-precision model is no faster. Four threads gave 1.6× in Chromium only; WebKit did not enable them. Both dropped.
- Today the voice starts at the first press, clips are made only for the card on screen (word, then example), a clip being made cannot be interrupted, and nothing is kept between runs. The learner waits on every word: the earlier card's example is often still being made when the next word is pressed.

## Intent
A press on a word plays at once in the usual case. The model does not get faster; the work moves ahead of the press and is done once per text.

## U1. Start early
- Opening a training (`/words/practice`) starts the voice at once, with the usual notification (and the download when the files are missing). The first press no longer pays for the start.

## U2. Prepare ahead, words first
- The training gives the engine its plan: the words of the current and all later cards, in card order, then their examples in card order; no text twice. The plan is replaced whenever the card or the list changes and emptied when the training is left.
- The engine makes one planned clip at a time, in plan order, skipping texts it already has. A press goes first and is never queued behind planned clips; it waits at most for the one clip being made.
- The word card no longer asks for its own clips.

## U3. Clips kept on disk
- Every finished clip is saved in `<appData>/voice/clips/` and read from there before the model is asked, in this run and later ones. A text is made once.
- A clip's file name comes from the model revision, the voice and the text, so another voice or model never reuses it.
- Stored as 16-bit PCM (about 48 KB per second of audio). The folder is capped at **200 MB**; past it, the oldest files are removed.
- A file that cannot be read or has a wrong shape counts as missing. A failed save is logged and changes nothing else.

## Approaches
- Chosen: plan in the engine, one background clip in flight, disk store beside the model. No new permissions (the `voice` folder is already allowed).
- Dropped: a second worker for presses (twice the model memory); native synthesis in Rust (option 2, later if this is not enough); multi-threading (small, uncertain gain).

## Non-goals
The synthesis speed itself, the worker's model code, clips for texts outside a training.

## Limits to know
- The first press on a text not yet made still waits for it (with the loader), and at most for one planned clip before it.
- Opening a training now shows the start notification without a press.

## Tests
- Vitest: the clip store (round trip, wrong-shape file is missing, cap removes the oldest first, a failing write does not throw); the plan order helper; the engine (`warm` starts once; planned clips go one at a time in order and skip known texts; a new plan replaces the old; a press is posted at once; a disk hit plays without the worker; a finished clip is saved; a voice failure during a disk read rejects the press).
- E2E: the existing voice cases still pass.
- Mac checklist: second visit to a training plays words at once; the log shows `disk` lines.
