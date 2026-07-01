# Learnings

Things this codebase taught (or re-taught) us while building the last cycles.
Keep appending; newest first.

## Cycle: voice, guard, tiers

- **Electron has no Web Speech backend.** `window.SpeechRecognition` exists
  and then fails with `network` at runtime — the API needs Google's speech
  service, which only Chrome ships. If a feature depends on it, it was never
  working in production. Lesson: test the packaged app, not the dev browser.
- **Keep every percentage the upstream tool gives you.** We threw away
  Claude's utilization numbers in the passive snapshot and later needed
  exactly those for the Usage Guard — the fix was one line, but only because
  the parse helper already existed. Capture generously, display selectively.
- **Meter in the unit you're billed in.** Quiet Credits are audio-seconds
  because Whisper bills per minute of audio. "Credits" that map 1:1 to a real
  unit never need an exchange-rate table or an apology later.
- **Reuse the escape hatch you already built.** The cross-model limit handoff
  is 90% existing code (`buildHandoffCard`, `performHandoff`) — the feature
  was really just noticing those two functions compose.
- **Hysteresis for anything that flaps.** A guard that trips at exactly 80%
  will flicker on/off around 80%. Stand down at threshold−5, not threshold.
- **Never pkill a pattern that appears in your own argv.** `pkill -f
  "http.server 8321"` matched the shell that ran it (exit 144). Bracket a
  character (`http[.]server`) or match the binary, not the phrase.
- **ES modules don't load over `file://`.** A built SPA opened from disk
  renders white with zero errors in headless captures — serve it over
  localhost before concluding the app is broken.
- **`ol start` is the markdown bug everyone ships.** Any hand-rolled list
  renderer: check numbered lists that start at 3.
- **Grep for command-name collisions before writing "new" commands.** Half of
  a brainstormed toolkit (`uuid`, `hash`, `ip`, `json`, `snippet`) already
  existed in a 700-line extras file. Inventory first, invent second.
- **Trim-the-tier migrations need a courtesy plan.** Cutting Pro's numbers to
  make room for Ultra/Max is fine at design time, but existing Pro users feel
  it — have trial-code compensation ready before shipping the table.

## Cycle: first audit

- A codebase with heavy, honest comments ("why", not "what") is dramatically
  faster to audit — the Sush style (constraint-comments above every subtle
  block) paid for itself within one session.
- Focus-gated polling (`usePolling` checking `document.hasFocus()`) is the
  single biggest Electron battery lever; every dashboard should inherit it.
- The best first contribution to an unfamiliar repo is the renderer that
  three surfaces share (markdown), not the 2,500-line component nobody dares
  touch.
