# The Sush Guide

*Sush — the terminal your agents live in.*

---

## The master use case (copy-paste playbook)

Sush is at its best when you stop thinking "terminal with tabs" and start
thinking **crew manager**. Here is the canonical session, end to end:

1. **Land on Home**, hit **New workspace**, and point it at your repo.
2. Summon **Seducia** (`Ctrl+K`) and give her the master prompt:

   > *"Build a team here: one Claude as Builder, one Codex as Reviewer.
   > Brief them: we're fixing the flaky login test in `auth/session.test.ts` —
   > Builder investigates and patches, Reviewer only reviews diffs and looks
   > for regressions. Tell me when either of them stalls."*

   One sentence launched two agents into the workspace, each pre-briefed.
3. **Watch Mission Control** (`Ctrl+Shift+M`) — every session's live state
   (working / waiting / blocked) on one board. Answer a blocked agent's
   y/n prompt right from the board.
4. **Split view** (`Ctrl+\`) to keep Builder and Reviewer side by side while
   you poke around in a third shell.
5. Something scrolled past somewhere? `hunt TypeError` searches the output of
   **every** open session at once.
6. **Dictate instead of typing** — tap the mic or `Ctrl+Shift+S`, say
   *"run the full test suite with coverage"*, and Hush types it into the
   focused terminal. Quiet Credits meter the month.
7. Done? **Export as Markdown** from the palette (`Ctrl+P`) — a transcript
   with metadata, ready to paste into the PR.
8. Hit a Claude usage limit mid-flight? Sush rotates to your second account
   slot and resumes the conversation (`claude --continue`) — that's the
   multi-account superpower.

## Pros

- **Offline-first, no account, no telemetry.** The license, credits meter,
  snippets, and scrollback all live on your disk. Nothing phones home.
- **Agent orchestration is native**, not bolted on: swarms, workspaces,
  per-session activity states, briefing-on-boot, limit-hit account rotation.
- **Seducia rides your existing CLI logins** — no API key to paste; she
  drives `claude -p` / `codex exec` / `gemini` over stdin.
- **Multi-user isolation** done properly: per-user config dirs mean two
  people's `~/.claude` logins never bleed into each other.
- **Battery-honest**: focus-gated polling, idle sleep, auto power-saver,
  lite/reduce-motion modes. Rare discipline for an Electron app.
- **Working voice**: Whisper dictation that actually functions in Electron
  (the Web Speech API never did), with a transparent local meter.

## Cons (honest ones)

- **Electron footprint** — a native terminal (Ghostty, Alacritty) will always
  boot faster and idle lighter. Sush spends that overhead on the agent UI.
- **Dictation needs your own OpenAI key** (until a local Whisper engine
  lands). No key, no voice.
- **Windows-first heritage** — PowerShell integration is deepest; macOS/Linux
  work but see fewer shims (e.g. the `&&` rewriter is PS5-specific).
- **No plugin API yet** — custom agents cover CLIs, but you can't extend
  panels or commands without forking.
- **Seducia's judgement is the model's judgement** — she can misread output;
  the read-output review loop helps but isn't a substitute for looking.

## Tips & tricks

| Trick | How |
|---|---|
| Jump anywhere | `Ctrl+1..9` jumps to session *n*; `Ctrl+Tab` is MRU switch |
| Type into every session | `Ctrl+Shift+B` broadcast mode |
| Wall of terminals | `Ctrl+Shift+G` grid; click a tile to focus |
| Two-up focus | `Ctrl+\` split — active + previous session |
| One calm pane | `Ctrl+Shift+Z` zen mode |
| Search everything | `hunt <text>` across all sessions' output |
| Save keystrokes | `snippet set deploy npm run deploy:prod` → `snip deploy` |
| Let Sush suggest aliases | run a command 15×, the alias nudge appears |
| Name your panes | `title reviewer` renames the focused session |
| Voice without sending | Settings ▸ Voice ▸ "Type only" — review, then Enter |
| Cancel a dictation | `Esc` while listening (spends no credits) |
| Check your meter | `credits` (or `quiet`) in any session |
| Instant decisions | `pick tea coffee`, `pick flip`, `pick d20` |
| Quick lookups | `dns example.com`, `headers api.github.com`, `regex '\d+' "v2 v13"` |
| Case & slugs | `case kebab HelloWorld`, `slug "Héllo Wörld!"` |
| Ship the transcript | Palette → *Export Session as Markdown* |
| Oops, closed it | `Ctrl+Shift+T` reopens the last closed session |

## Which plan?

- **Free** — solo use, one account per CLI, 4-tile grid, 5 min dictation/mo.
  Right if agents are a curiosity, not your workflow.
- **Plus** (*recommended for anyone who hit a Claude limit twice*) — 4
  accounts per CLI with auto-rotation, 9-tile grid, custom agents, cloud
  voices, 60 min dictation/mo. The limit-rotation alone pays for itself the
  first time a deadline meets a rate limit.
- **Pro** — 8 accounts, 16-tile grid, 300 min dictation/mo. For the person
  running a standing swarm all day, every day.

*(Codes are offline unlocks — no payment rails, no account. See Settings ▸ Plan.)*

## The pitch in one line

> Warp gives you an AI terminal that needs their cloud. Sush gives you a crew
> of the AI CLIs you already pay for, on your machine, that shuts up and
> works offline.
