# Codebase review — 2026-07-24

What I looked for, what I found, what I changed, and — since you asked to be
told — what I judged **not** worth removing and why.

---

## 1. The headline: there is almost no bloat to remove

You asked me to strip out bloatware and sloppyware. I went looking with intent,
and I want to be straight with you rather than manufacture deletions to look
busy.

What I checked, and what came back:

| Check | Result |
|---|---|
| Orphaned components (`src/renderer/src/components/*.jsx`) | **0 of 39** unreferenced |
| Orphaned renderer libs | **0** unreferenced |
| Orphaned main modules | **0** (every `commands/*.js` is wired through `shell/registry.js`) |
| Unused dependencies | **0** — all 9 runtime and 11 dev deps are imported somewhere |
| `TODO` / `FIXME` / `HACK` / `XXX` | **0** (the only `XXX` hits are literal placeholders in unlock-code examples) |
| Stray `console.log` in shipped code | **0** (the one hit is a string written into a scaffolded template file) |
| Commented-out code blocks | **0** |
| `debugger` statements | **0** |

That is an unusually tidy repository. GRAVEYARD.md is doing real work — the
"nothing gets deleted, only buried" discipline has kept dead code out of the
tree instead of letting it rot in place. I did not delete a single file, and I
think deleting one to satisfy the brief would have been the wrong call.

**The actual bloat is not files, it is two modules that never got split.**

- `src/renderer/src/App.jsx` — **2,513 lines**
- `src/main/ipc.js` — **2,206 lines**

Together that is 16% of the source tree in two files. Both are god modules:
`App.jsx` owns layout, ~30 palette action branches, every modal mount, the grid
math, and the keyboard map; `ipc.js` owns PTY lifecycle, the command registry
bridge, tray, file IO and abort tracking. This is where the weight is, and it is
also where the bug in §2.1 came from — that bug is *only* possible in a file
large enough that two features can reach the same Map without noticing each
other.

I did not decompose them in this pass. Splitting a 2,500-line component that
nothing type-checks and nothing renders in CI is a change I can make look right
and cannot prove is right, and I would rather hand you six verified fixes than
one large unverified refactor. It is the first thing I would do next.

## 2. Bugs found and fixed

Every one of these is a defect that existed before this session. Each is
described by its failure, not by its patch.

### 2.1 Cancelling a command cancelled the wrong one — `src/main/ipc.js`

`abortControllers` was a `Map` keyed by `tabId` holding **one** controller. But
two things can run a built-in on the same tab at once: the smart bar and the
terminal. The second `set(tabId, ac)` overwrote the first's handle, so the first
command became permanently uncancelable. Worse, whichever finished first ran a
`finally` that deleted the entry — *including when the entry belonged to the
other command*. After that, `cancel-command` found nothing and fell through to
writing `^C` into a PTY that wasn't running the command at all.

So: press cancel, watch nothing stop, and get a stray interrupt in your shell.

Now a `Map` of `Set`s, with `trackAbort` / `untrackAbort` / `abortTab`.
`abortTab` returns whether it aborted anything, so the `^C` fallback only fires
when there was genuinely no in-flight command to cancel.

### 2.2 `sush:read-file` could take down the main process

No size cap. `readFile(path, 'utf8')` on a multi-GB file either froze the main
process — which is the *whole app*, every terminal in it — or threw
`Invalid string length` once V8's string limit was hit. A user pointing the file
viewer at a large log was enough.

Capped at 8 MB, and the error reports the file's actual size so the message is
useful rather than just a refusal.

### 2.3 The session cap was a UI suggestion

`sush:pty-start` spawned whatever it was asked to. The tier-aware grid cap lives
in the renderer, which makes it an affordance, not a limit — a renderer bug or a
crew launch that looped could ask main for hundreds of shells and main would
spawn every one.

Now `MAX_LIVE_PTYS = 64`, enforced in main. Reusing an existing `tabId` is a
restart and doesn't count, so the cap can't be tripped by reconnects.

### 2.4 The tray icon outlived its window

`hideToTray()` created the tray lazily; nothing ever destroyed it. One
minimize-to-tray left a tray entry for the rest of the app's life, pointing at a
window that was plainly visible on screen. On Windows the stale icon outlived
the window entirely on some shells. `restoreFromTray()` now destroys it; the
next hide recreates it.

### 2.5 Two exports silently downloaded nothing

`exportSessionOutput` and `buildWorkspaceDigest` both did:

```js
a.click()
URL.revokeObjectURL(url)   // same tick
```

Chromium starts the download asynchronously, so a same-tick revoke races it and
frequently wins — the click succeeds, the file never appears, and nothing
errors. Centralized in `src/renderer/src/lib/download.js`: the anchor is
appended to the document (Firefox requires it), the revoke is deferred 60s, and
`safeFileName` strips the characters Windows rejects in a filename.

### 2.6 A drag that never ended

`startRightDrag` attached `mousemove`/`mouseup` to `window` and removed them
only in its own `mouseup` handler. Two ways to leak: unmount mid-drag (no
cleanup at all), or alt-tab mid-drag, in which case the `mouseup` is delivered to
another window and yours never fires — leaving a live `mousemove` handler
resizing the panel against a button you are no longer holding. Fixed with a
cleanup ref, an unmount effect, and a `blur` listener.

## 3. Bugs I introduced and caught before shipping

Air is new code, so it got the same treatment. I built it, then drove the
*built* app headless under xvfb and asserted on the real DOM. Four defects that
unit tests could not have caught:

- **`openTab` created two tabs and activated neither.** It built the new tab
  inside a `setTabs(prev => …)` updater and read the id back out through a
  closure. React may invoke an updater more than once — it computes eagerly to
  check for a bailout, then again while rendering — so `nextId()` ran twice and
  the id I captured was not the id that entered state. `setActiveId` then pointed
  at a tab that did not exist and the view silently fell back to `tabs[0]`.
  All tab writes now go through one `commitTabs` helper that decides everything
  *outside* the updater. The regression check is visible in the drive output:
  after `:new` then `:rename probed`, the tab strip reads `1 session 1 | 2 probed`
  — the rename landed on the new tab, not the first one.
- **`renamed` was checked but never set.** The OSC 7 handler carefully avoided
  clobbering a user-chosen tab name by testing `t.renamed` — a flag nothing
  assigned. So `:rename api` held until you `cd`'d, and then vanished.
- **`:zen` could not undo itself.** Zen hides the input row, which is where you
  would type `:zen` to leave. Escape always worked, but nothing said so. It now
  tells you on the way in.
- **The typo-suggester failed on the commonest typo.** `suggest()` used a
  one-edit Levenshtein check, which scores a transposition as *two* edits — so
  `:clera` never reached `:clear`. Fixed by handling adjacent transposition
  explicitly.

## 4. Documentation corrected against the code

- **DESIGN.md documented a five-rung tier ladder; the app ships seven.**
  `TIER_META`, `TIER_FEATURES`, `useEntitlements` and PUBLIC.md's comparison
  table all carry Free → Plus → **Dev** → Pro → Ultra → Max → **Enterprise**,
  but DESIGN.md's tier-color list named only five, omitting Dev and Enterprise.
  Meanwhile user-facing strings say things like *"available on Dev, Max, and
  Enterprise"* — naming tiers the design system did not acknowledge.
  `learning.md` asks that each status word have exactly one meaning; a ladder
  documented at the wrong length breaks that at the first rung it omits.

  I fixed the **document**, not the code. Removing `dev` and `enterprise` would
  have invalidated every unlock code already minted against them — offline HMAC
  codes cannot be re-issued, so that deletion is not reversible for anyone
  holding one.

- **GRAVEYARD.md still described Sush Air as buried.** It now has a `Risen`
  section recording what came back, in what form, and — more usefully — the
  conditions that would bury it again.

## 5. What I deliberately did **not** touch

Since "remove anything you don't like" invites me to be opinionated, here is
where I chose restraint and why:

- **The seven-tier ladder.** Two rungs are undocumented in DESIGN.md and the
  ladder is arguably one or two rungs too long, but see above — minted codes.
- **`useConptyDll`.** Never set, with a comment explaining that it errors 267 on
  stock Windows 11. It reads like a missing optimization; it is a scar. Left it,
  and left the comment, which is the only thing stopping someone from
  "fixing" it.
- **Tailwind.** Configured for the main renderer only and genuinely used there.
  Air doesn't use it — `air.css` is hand-written, and the build confirms nothing
  from Tailwind reaches Air's 12.9 kB stylesheet. Two systems, but each earns its
  keep in its own window.
- **`scrollback: 2000` in `useTerminal.js`.** Looks stingy until you read the
  comment: up to 25 terminals stay mounted. It is a RAM budget, not an oversight.
- **The 2,500-line files.** Explained in §1 — worth doing, not worth doing
  blind.

## 6. Verification

Nothing here is asserted from reading alone.

- `npm test` — **138 passing across 14 files**, 24 of them new, covering the
  pure command and theme layers (`isAirCommand`, `tokenize`, `parseAirCommand`,
  `suggest`, `resolveAction`, `completions`, `helpText`, `resolveTheme`, and a
  check that every theme carries a complete, well-formed xterm palette).
- `npm run build` — both renderers and both preloads build clean.
- **Both windows booted headless under xvfb**, with zero renderer console
  errors:
  - Air: React mounted, 14-method bridge present, xterm live with a real shell
    prompt.
  - Main: 120-method bridge intact after the `ipc.js` surgery, renderer mounted
    at the identity gate.
- **Isolation verified, not just claimed.** Opening Air from the main app's
  palette produces two windows, and evaluating in Air's window gives
  `{ air: 14, sushLeaked: "undefined" }` — the privileged bridge is genuinely
  not reachable from there.
- **Every `:` command driven through the real input element** against the built
  app: help toggles, both themes apply to the CSS variables, `:new` adds a
  session, `:rename` lands on the right one, `:split` toggles the grid, `:note`
  persists, `:font` persists, `:zen` hides chrome and Escape returns, unknown
  commands and out-of-range `:go` produce the right messages, and closing the
  last session leaves a fresh one rather than an empty window.

## 7. Correction: Air is a separate application (same day, second pass)

The section above, and everything I wrote in `GRAVEYARD.md` and the pull request
defending it, argued that Air should be a second **window** of this app — one
build, one dependency tree, one `spawnPty`. That was wrong, and it is worth
being precise about *why*, because the reasoning was not obviously bad.

The argument was: the first Sush Air died of an independent build and an
independent dependency tree, so do not build a second one. True premise, wrong
conclusion. What killed it was that it was separate **and written in a different
language on a different runtime**, so every feature had to be implemented twice.
Separateness was not the cost; Rust-vs-JavaScript was.

And sharing a process cost something I under-weighted. Air's entire claim is
what it refuses to carry, and in a shared process that claim is unfalsifiable:
"no licence gate" degrades to "this window does not currently call the licence
gate", enforced by nothing but the discipline of whoever edits it next. A
user cannot check it. A 14-method bridge sitting beside a 120-method one in the
same binary is a convention, not a boundary.

It is now `air/` — its own `package.json`, dependencies, build, settings
directory, installer and CI job. Sush's `--air` flag, its `sush:open-air` IPC
handler, its `openAir` bridge method and its palette entry are gone. The Sush
bridge went from 120 methods to 119; Air's went from 14 to 18, the four new ones
being the import flow.

Both halves are verified rather than asserted:

- Sush boots with `window.sush` at 119 methods, `window.sush.openAir`
  `undefined`, `window.air` `undefined`, one window, zero renderer errors.
- Air boots with `window.air` at 18 methods and `window.sush` **`undefined`** —
  not filtered, absent, because there is no such module in that application.
- `air/tools/verify.cjs` drives the built app headless: **44/44**, including the
  whole import flow end to end and an assertion that a credential-shaped env var
  is neither pre-ticked nor printed to the screen.

`vitest.config.mjs` now excludes `air/` from Sush's test run. Without it Vitest's
default glob walked into `air/tests/` and Sush's suite silently depended on Air
being installed — the exact coupling the split was meant to remove. Sush's suite
is 115 tests; Air's is 45; CI runs them as two jobs on three platforms each.

## 8. What I'd do next

1. **Split `App.jsx` and `ipc.js`.** In that order, and behind tests — §2.1 is
   evidence that file size is now producing bugs on its own.
2. **Render the main app in CI.** The xvfb harness used for this review is ~40
   lines and caught four defects that no unit test could reach. It should be a
   committed script, not a scratch file.
3. **Carry Air's design language back into the main app's chrome.** Air is where
   the new language is complete and coherent; the main app has ~60 components
   and a locked theme, so that migration needs to be a deliberate pass rather
   than a side effect of this one.
