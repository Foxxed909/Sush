# Round 3 plan: Sush soul, Mac structure (Nov 2026)

Owner feedback on round 2: "This looks so plain. What happened to the pinky /
slushy glow?" The Mac pass kept macOS *structure* (traffic lights, toolbar,
source list, System Settings) but also swapped Sush's *atmosphere* (deep
plum-black, pink light, the night-sky stage) for Apple's neutral greys.
That was the wrong trade. Round 3 keeps the structure and brings the soul
back, in both Sush (Stable) and Sush Nightly.

## Why it went plain (root causes)
1. The Mac palette was put on `:root`, so **Stable** lost its near-black plum
   canvas too, though it never got the Mac pass.
2. Nightly's surfaces moved from plum (`#0c0a12…`, violet-tinted borders) to
   neutral greys (`#1e1e20…`).
3. The sidebar's night-sky `StageBackdrop` (pink and violet glow behind the
   brand) was deleted along with the brand row.
4. Accent appears only as flat fills (selection, switches). Nothing glows:
   no light around the active row, the primary button, focus or the composer.

## P0: bring the glow back (do first)
- **Scope the Mac palette to `.sush-t3`**. Stable gets its original
  tokens back, untouched.
- **Plum-tinted Mac surfaces** for Nightly: the same luminance steps as macOS, but
  hue-shifted toward plum (e.g. window `#16131d`, sidebar `#1b1724`, toolbar
  `#14111b`), with separators tinted violet.
- **Stage glow behind the traffic lights**: bring back `StageBackdrop` (night
  sky, pink/violet nebula, sparkles) in the sidebar header, faded by mask
  into the list, as before.
- **Glow tokens** (`--glow-soft`, `--glow-strong`, `--glow-ring`), all from the accent:
  - Active sidebar row: a soft pink inner light plus a 1px accent edge instead of flat grey.
  - Primary buttons: an accent fill with a coloured drop glow.
  - Focus halo, composer focus and the segmented control's selected segment: a faint accent bloom.
  - Window: a slow ambient pink/violet radial wash in the content background
    (static gradients, no animation, so Windows stays smooth).
  - Menus: a plum-tinted vibrant material, so the pink reads through.
- **Settings and onboarding**: plum surfaces, a pink wash behind the hero, and a
  glow on the selected nav item and on switches.
- Every glow obeys lite/saver/reduced (static and cheaper, never removed outright).
- Harness check: assert the stage backdrop exists and the root canvas is not a neutral grey.

## Agent reviews (launched after this plan)
| Agent | Model | Brief | Output |
|---|---|---|---|
| Design critic A | Sonnet | In-depth design critique of Nightly: hierarchy, atmosphere, brand ("pink glow"), Mac fidelity. Fixes with exact values. | `reviews3/sonnet-design-a.md` |
| Design critic B | Sonnet | Same scope from a different angle: Stable shell, Settings, onboarding/lock, Office, consistency between the shells. | `reviews3/sonnet-design-b.md` |
| Ideas | Haiku | "10x" improvements: features, transitions, delight moments, with effort and impact for each. | `reviews3/haiku-10x.md` |
| Code inspector | Sonnet | Find what shouldn't be there: dead code, orphan CSS/keyframes, unused imports/IPC, leftover dev copy, duplicated provider lists, overridden rule stacks, risky patterns. | `reviews3/sonnet-code-audit.md` |

All four are read-only. They work from fresh screenshots of both shells.

## Backlog (my own pass; ordered)
**Bugs still open from the October/November hunts**
- OAuth link flow captures `userId` at start, so switching identity mid-flow links to the old one (`main/oauth/github.js`, `google.js`).
- `ProviderButtons` listener ignores `ev.mode`/`ev.userId`, so two mounted instances both react.
- `ThreadView` shows the Claude "waiting" hint for OpenCode/Grok/custom agents, and its auto-follow ignores growth inside the last streamed block.
- Diff panel: untracked files silently capped at 20, one giant hunk renders in full, and a gitStatus error reads as "not a git repository".
- Preload exposes a dead `accountsPoolStats` channel.
- The campus layout key and workspace key disagree on `sessionRootCwd`.
- PIN entry has no attempt throttling.

**Features**
- Composer **Stop** button while an agent works; per-tab drafts kept across reloads.
- Sidebar: arrow-key navigation, drag to reorder projects, resizable width.
- Command palette as a Spotlight-style sheet with recent threads and actions.
- Toasts for agent events (needs you, finished, limit hit), with a pink-glow chip that opens the thread.
- OpenCode Thread mode (bridge), then one provider registry replacing eight lists.
- Discord and Email sign-in (blocked on a Discord OAuth app and an email magic-link service).

**Transitions**
- Shared-element move when a session opens from the Agents board.
- Mode switch: the segmented indicator slides (transform), and content cross-fades.
- Sidebar row insert/remove: height + fade; project collapse already animates.

## Order of work
1. P0 glow restoration (Stable first, then Nightly, Settings, onboarding), verified by screenshots.
2. Read the four reports and merge them with this backlog into one ranked list.
3. Ship in small commits: bugs, then the highest-impact design fixes, then features.

---

## Status after the reviews (Nov 5)

**Shipped this round**
- P0 glow restoration on both shells (see the "Sush glow" block at the end of `index.css`).
- Audit quick fixes: `build.files` allowlist, two unguarded timers, overlay layering above Settings, dev copy, 92 dead CSS rules.

**Reports** (scratchpad `reviews3/`): `sonnet-design-a.md` (Nightly, 25 items), `sonnet-design-b.md`
(Stable, Settings, onboarding, lock; 19 items + consistency map), `haiku-10x.md` (12 design, 10 features,
10 transitions, 5 signature moments), `sonnet-code-audit.md` (7 categories, safe-delete and decision lists).

## Ranked next list (impact ÷ effort; merged from the reports and my backlog)
1. **One sheet recipe for every overlay** (palette, Hunt, launcher, user manager, fresh start): plum vibrancy,
   0.5px edge, accent halo, scrim with a bloom. The overlays still wear the old 1px pink rim on navy. *(B4)*
2. **Disabled primaries go neutral**, and only an enabled primary glows (Continue, Unlock read as muddy ~2.2:1). *(B6)*
3. **Pilot-light status bar** on each sidebar row (2px leading bar, opacity-only breath while working). *(10x #1)*
4. **Usage runway** in the toolbar: guard tick at 80% plus "reaches 80% in ~38 min". *(10x #2)*
5. **Tabular numerals** on every live number. *(10x #4)*
6. **Terminal background into the plum family** (`#100d18`) so the code surface matches the chrome. *(A)*
7. **Glow budget rule in DESIGN.md**: ambient washes ≤ 12% alpha; at most 3 lit elements at rest; one hero glow per surface. *(A, B)*
8. **Composer Stop button** while an agent works, and drafts that survive reloads. *(backlog)*
9. **Limit Relay**: propose the hand-off at the guard threshold, not after the limit hits. *(10x #7)*
10. **"Last one home" moment**: when a crew finishes, the sidebar blooms once with a "+214 −38" summary. *(10x #9)*
11. **Seducia orb as a state instrument** (rings = listening, arc = thinking, with labels). *(10x #6)*
12. **Z-index scale** as tokens (base, chrome, popover, sheet, page, lock, splash) instead of 22 literals. *(audit)*
13. **Provider registry**: derive every provider list, label and colour from `AGENTS` + capability flags (about 18 lists today). *(audit)*
14. **IPC hygiene**: wire or remove `accountsPoolStats`; remove about 14 caller-less channels, especially the mutating ones. *(audit)*
15. **Office night tint** after 20 min idle, and per-provider lamp colours for working agents. *(10x #10)*

## Decisions for the owner
- **Unlock codes** use an HMAC key that is compiled into the app, so anyone can extract it. Switching to signed codes
  (Ed25519, public key in the app, private key off-repo) closes that. Do you want it?
- **Two copies of the impeccable skill** (`.claude/skills` from this session, `.github/skills` from before). Keep one, and
  should either live in the product repo?
- **Root handoff docs** (continue.md, about 140 KB of notes): archive under `docs/archive/`?
- **`air/`** is a separate app in this repo. It no longer ships in the package, but should it move out of the repo?
