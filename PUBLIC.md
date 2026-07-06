# Sush — What's New

*The terminal your agents live in. Offline-first, no account, no telemetry.*

## Latest release highlights

### 🎙️ Voice that actually works
Dictation (Hush) and talking to Seducia now run on **Whisper** with your own
OpenAI key — the key is encrypted on your machine and never leaves the main
process. Tap the mic or press `Ctrl+Shift+S`, speak, and your words land in
the focused terminal. `Esc` cancels without spending anything.

### 🕊️ Quiet Credits
Dictation is metered by a transparent, **local** monthly allowance — no
server, no tracking. Check it any time with the `credits` command. Every plan
includes minutes; bigger plans include more.

### 🛡️ Usage Guard (Pro and up)
Stop Claude *before* the limit stops you. Pick a threshold (50–90%) and a
behavior — **Warn**, **Auto-handoff** (Ultra+), or **Block** — with a plain-
words preview of exactly what will happen. Reads the rate-limit info Claude
already sends; costs zero extra tokens.

### 🔁 Limit handoff — your work never gets cut off
When an agent hits its usage limit mid-task, Mission Control now offers
**Hand off →**: Sush summarizes the session and relaunches the task with your
next available model (Codex/Gemini), briefed and ready to continue. On Ultra
and Max, the Usage Guard can do this hands-free.

### 🪟 Split view, cross-session search, and more
- `Ctrl+\` — two sessions side by side, click to swap panes
- `hunt <text>` — search the output of *every* open session at once
- Export any session as a Markdown transcript, ready for an issue or PR
- New toolkit commands: `case`, `slug`, `lorem`, `regex`, `pick`, `dns`,
  `headers`, `title`, `jwt`, `color`, `base`
- Apple-style pricing page, smoother animations, and a reduce-motion toggle

### 🎧 Offline dictation (local whisper.cpp)
Dictation can now run **entirely on your machine**: point Sush at a
whisper.cpp binary and a downloaded model in Settings ▸ Voice & Dictation and
Hush transcribes with **no API key, no network, and no Quiet Credits spent**.
The cloud (OpenAI) engine stays available for the best accuracy.

### 🔗 Connect provider accounts (Plus and up)
Sign in to **Claude, ChatGPT, or Google** once from Settings ▸ Accounts and
Sush keeps the connection — encrypted on your machine, main-process only,
testable and disconnectable any time. Graduated from Experiments.

## Plans

| | Free | Plus | Pro | Ultra | Max |
|---|---|---|---|---|---|
| Price | $0 | $8/mo | $16/mo | $29/mo | $49/mo |
| Accounts per CLI | 1 | 4 | 6 | 10 | 16 |
| Grid sessions | 4 | 9 | 12 | 20 | 25 |
| Quiet Credits | 5m | 60m | 150m | 600m | 1500m |
| Custom agents | — | ✓ | ✓ | ✓ | ✓ |
| Cloud voices | — | ✓ | ✓ | ✓ | ✓ |
| Connect accounts (OAuth) | — | ✓ | ✓ | ✓ | ✓ |
| Usage Guard | — | — | ✓ | ✓ | ✓ |
| Auto-handoff | — | — | — | ✓ | ✓ |

Unlock codes are offline — no payment rails, no account. See **Settings ▸ Plan**.
