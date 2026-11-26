# Design and motion critique — 26 November 2026

Method: two isolated passes run side by side. Pass A was a design review of 20 screens from `tools/shot.mjs` plus the source. Pass B ran the impeccable detector over `src/renderer/src`, did live CDP scans of Home, Session and Settings, computed contrast for every token pair, and audited motion and focus mechanically. The findings below are where the passes agree, plus what one caught and the other missed.

**Score: 23/40 (Nielsen, before fixes).** The core workspace is strong: the terminal, pane headers, Hunt, the account menu and diff turns were all built for this product. Most of the lost points sit at the edges.

## Fixed in this branch

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| P0 | The orb's approval card focused **Approve**, so a stray Enter ran model-originated commands (e.g. `rm -rf ~/projects`). The card was accent pink, though DESIGN.md says amber. | A: 02l screen, `SeduciaOrb.jsx` `autoFocus` | Skip holds focus. Approving takes a click or Ctrl/⌘+Enter. Both approval surfaces are amber. |
| P1 | Overview said "5 agents" above pills that summed to 3, and a running external agent counted as Idle. | A: 04 and n5 screens | One tally feeds the ring and the pills; running counts as working. |
| P1 | White on the selected Settings row measured 3.7:1. White on `--mac-accent-strong` measured 4.4:1. White on pink primary buttons measured 2.7:1. | B: CDP Settings scan; A: estimated 3.9 and 4.4 | Accent mix set to 68% (5.0:1). Selection is a solid fill with no glow. Pink buttons use near-black ink (7.3:1). |
| P1 | `--text-4` was 4.42:1 on `--surface-1` and 3.77:1 on `--surface-3`. `--text-5` (1.8:1) carried words: the composer hint, placeholders, the palette footer and Hunt's "SAVED" tag. | B: contrast table, 135 + 60 usages | `--text-4` lifted just enough to pass on every surface in all three ramps. Word-carrying `--text-5` uses moved to `--text-4` or `--text-3`. |
| P1 | OS reduced motion didn't stop infinite loops (blink, pulse, mic pulse, the Seducia bar). Only the in-app toggle did, though a code comment claimed otherwise. | A and B agree, with file:line lists | Any reduced-motion source stops every loop after one cycle. Spinners are exempt. The terminal caret stops blinking. |

## Proposed, not done (needs your call)

1. **Two shells (P1).** The classic Stable chrome (Windows controls, "STABLE" pill) and the Nightly/T3 chrome (traffic lights, nebula) ship side by side. Every rule gets documented twice and enforced half as often. In 05, Overview stays selected after you open a session. *Recommendation:* make T3 the only shell and retire `Nightly*` Stable chrome over a release.
2. **SaaS patterns inside a tool (P2).** These are the anti-references PRODUCT.md names:
   - Home has a greeting hero plus a wall of identical quick-action cards (01).
   - Overview's hero ring is a hero metric.
   - Plans is a fanned, rotated deck with a 900-weight headline; "CLICK TO COMPARE" is clipped and the rotated text can't be compared (07).

   *Recommendation:* turn Home into a command row, make Overview a plain count row, and make Plans a flat, keyboard-navigable comparison table.
3. **Launcher overload (P2).** About 20 visible options. Launch looks disabled with no reason given while the footer says "2 sessions will open" (08). *Recommendation:* use one Crew dropdown, put missing CLIs behind a "3 not installed" row, and show a reason when Launch is disabled.
4. **Battery cost of ornaments (P2).** The orb (aurora, sparks), blur-heavy backdrops, the 3D Office, and `box-shadow` / `background-position` loops all repaint every frame. Eco mode doesn't add `.sush-saver`. *Recommendation:* make eco imply saver, and offer "Switch to saver" next to the battery chip. The merged Office 3D mode defaults to HD: a high-performance GPU, DPR 2, a 2048 soft shadow map, and particle effects on every theme. It also redraws at 30 fps while idle, and only reduced motion or eco slow it, not power saver or quiet hours. Default it to the cheaper mode, or tie HD to saver, and drop to the idle frame rate when nothing changes. Separately, in pixel mode the camera can orbit behind a wall, because wall fading runs only in HD.
5. **Motion system drift (P3).** There are five easing curves for "one spring", plus legacy `--dur-fast` and `--dur-med`. About 15 durations sit off the 80–320 ms ladder: 360, 400 and 500 ms sheets and pops, inline 0.1–0.2 s values in components, and fallbacks of 220 vs 240. Layout properties are animated: `.ag-quick` animates `max-height`/`margin`, and two rules animate `grid-template-rows`. *Recommendation:* run a token-only pass (`/impeccable animate`) that touches no visuals.
6. **Rail state labels clip mid-word (P2).** Labels show as "Needs inp" and "Worki" at narrow rail widths (n4, n6), so colour alone carries the state. *Recommendation:* drop the word before the icon at narrow widths, or use the tooltip.
7. **Focus (P3).** 35 inline `outline: 'none'` styles in JSX can't be overridden by stylesheet focus rules. The worst are in CommandPalette, Hunt, SearchBar, UserManager and NewSessionModal. Some inputs have no `:focus-within` on their wrapper (`.ts-search input`, `.mp-search input`, the rename fields).
8. **Small items.**
   - The topbar shows "Needs you" next to the bell badge, so the signal appears twice.
   - "Opus (latest)" and "Claude Opus 5.5" are both used for the same model.
   - The only action under "Your plan" is "Revert to Free".
   - The orb shows while Seducia is only thinking; DESIGN.md says it appears only while listening or speaking.

## Detector false positives

- `side-tab` (`.sd-row.is-add` / `.is-del`): diff gutters, a standard convention.
- `blinking-cursor`: the xterm caret. It now honours reduced motion.
- `bounce-easing` (`--ease-pop`): a mild, scoped overshoot.
- `dark-glow`: the Sush signature. It's a brand call, not a defect, though the Settings nav glow was removed for contrast.
