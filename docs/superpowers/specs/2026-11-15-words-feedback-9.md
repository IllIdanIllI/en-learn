# Design: words feedback round 9 (2026-11-15)

Agreed with the learner in chat on 2026-11-15. Binding where it says something; otherwise rounds 6–8 hold. It supersedes round 8 R2 (system voice while starting; a press after a failed download), R3 (the system voice line) and R4 in the app.

## Evidence
- The start hang of round 8 was WebKit's wasm compiler never finishing the JSEP build of onnxruntime-web (CPU at full, memory to 8 GB). Reproduced in WebKitGTK; fixed in `69b293a` by loading the plain wasm build. The start now takes 2–4 s. Still to confirm on the Mac.

## Intent
On the first use the learner hears no system voice. A notification shows that the voice is downloading and starting; the pressed text plays with Kokoro once it is ready.

## S1. No system voice in the app
- The Kokoro engine never uses the system voice: not before it is ready, not after a failure, not when one text fails.
- The system voice stays only where there is no Kokoro engine (browser preview without `?voice=`).
- Settings: the "System voice: …" line shows only without the Kokoro engine. The failed text loses its second sentence: "Не работает: <reason>." / "Not working: <reason>."

## S2. A press before the voice is ready
- The press is held and plays with Kokoro when the voice becomes ready. No sound until then.
- Only the latest press is held. Leaving the card (`stop()`) or a failure drops it.
- An idle voice starts loading at the first press, as now.

## S3. One notification for the whole start
One toast (id `voice-download`), updated in place:
- downloading: "Загрузка голоса: N%" / "Downloading the voice: N%" (as now);
- starting (files on disk, also when nothing was downloaded): "Голос запускается…" / "Starting the voice…", a spinner, no percent (the start has no measurable progress);
- ready: "Голос готов" / "Voice ready", 4 s;
- failed: "Голос не работает: <reason>" / "The voice is not working: <reason>", 8 s, with the button "Повторить" / "Retry".
"Voice downloaded" is no longer shown.

## S4. Failure
- Any failure (download or start): silence, the failure toast, status `failed`.
- Only Retry (toast or Settings) starts the voice again. A press while failed is silent and shows the failure toast again.
- When one text fails to synthesise (the voice stays ready): silence and a toast "Не удалось озвучить: <reason>" / "Could not voice this text: <reason>".
- The 20 s start limit stays.

## Approaches
- Chosen: extend the existing toast and engine statuses. No new UI element.
- Dropped: a progress bar inside the word card. It would repeat the toast and the Settings row.

## Non-goals
The worker, the download code, the Words double reload, the main-thread stalls of round 8.

## Tests
- Vitest: the engine (a held press plays at ready; only the latest; dropped by stop and by failure; no system voice anywhere; a press while failed starts nothing and notifies; Retry restarts after a failed download too; a failed text sets the text error); the toast decision function for every row of S3.
- E2E (preview): the starting toast (`?voice=starting`), the ready toast, the failure toast with Retry (and its pointer cursor), Settings texts.
- Mac checklist: first press with the files on disk shows "Голос запускается…", then "Голос готов", and the word plays; no system voice at any point.
