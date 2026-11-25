# Branch audit — 25 November 2026

Main was rebuilt on 28–29 September 2026 from two fresh root commits.
`543591a` is a snapshot of `claude/roadmap-development-continue-i32p2l` plus the T3 shell.
As a result, every branch cut before that date shares no history with main, and git reports it as hundreds of commits "ahead".
This audit checked each branch's content against main, not its commit graph.

Nothing listed here has been deleted. Delete remote branches yourself once you agree.

## Merged in this pass (branch `claude/workflows-review-optimize-9p99rn`)

| Branch | What it brought | Notes |
|---|---|---|
| `ccr-dcd13971-a77a01` | Office full 3D mode, smoother motion, backdrops and weather, click-to-walk, minimap, shortcuts | Clean merge |
| `claude/repo-review-improvements-52orp1` | Office exited counts, 15-desk overflow chip, desk hover card, immediate monitor paint, reduced-motion pose, chime re-baseline, `tests/office.test.mjs` | Four files conflicted. Main had already fixed the selectTab crash (as `leaveCoveringMode`) and had its own "N: next needs-you" walk, so the branch's duplicate jump was dropped. |
| `sush-nightly` | Separate Nightly packaging (`npm run package:nightly`, own userData and appId), `nightly-package.yml` | Clean merge |

## Salvaged from pre-rewrite branches

| From | Salvaged | Why it was still needed |
|---|---|---|
| `nightly/context-density-v3`, `nightly/context-model-controls-v2` | Configurable terminal line height (Settings ▸ Terminal) and a cross-platform monospace fallback stack (`lib/terminalPrefs.js`) | Main hard-coded line height to 1.4. Its default font was `'Cascadia Code'` alone, so macOS and Linux fell back to the browser's default font. |
| `claude/app-improvement-review-kpfpfd` | 33 unit tests: Seducia intent parsing, shell parser, alias suggestions, agent catalog | They exposed a live bug: "tell codex …", "focus codex" and voice equivalents resolved to Claude, and "grok" to Gemini (monogram prefix match). Fixed in `lib/seducia.js`. |

Everything else on those branches is either already in main (often reworked) or was retired on purpose (see `docs/archive/GRAVEYARD.md`). That covers Sush Air, MissionControl, SessionRail, SmartCommandBar, TitleBar and the old StatusBar, all replaced by the T3 shell. The other Nightly tail commits (branch/changes chip, Context chip, project Open action) were superseded by `ShellHeader`'s Git menu and the right panel.

## Safe to delete

| Branch | Reason |
|---|---|
| `ccr-40a9589c-0aetf4` | Identical to main |
| `ccr-77e59d72-njw4dy` | Fully merged (0 ahead) |
| `fix/custom-agent-limit` | Fully merged via PR #20 |
| `review/reliability-2026-10-01` | Fully merged (0 ahead) |
| `ccr-dcd13971-a77a01` | Merged in this pass (once the PR lands) |
| `claude/repo-review-improvements-52orp1` | Merged in this pass (once the PR lands) |
| `claude/roadmap-development-continue-i32p2l` | Main's root snapshot was cut from its tip |
| `nightly/quiet-nights-shell-v1` | Contained in roadmap and superseded by the T3 shell |
| `nightly/context-density-v3` | Unique work salvaged above; rest superseded |
| `nightly/context-model-controls-v2` | Unique work salvaged above; rest superseded |
| `agent/dev-tier-workflows` | The Dev tier is in main (`license.js`); the rest is Air |
| `claude/app-improvement-review-kpfpfd` | Tests salvaged; the rest is June 2026 UI that was later rebuilt |
| `claude/codebase-review-cleanup-ysy6cg` | June 2026 snapshot, superseded |
| `claude/codebase-review-redesign-8cmzzg` | Adds Sush Air, which was retired; its six bug fixes predate the rewrite and the code they touched has since been rewritten |

## Keep

| Branch | Reason |
|---|---|
| `main` | — |
| `sush-nightly` | Its push triggers `nightly-package.yml`. Keep it as the Nightly release channel, and fast-forward it from main to cut a Nightly. |
