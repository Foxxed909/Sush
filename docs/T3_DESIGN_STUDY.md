# T3 Code design teardown and what Sush should adopt

Source: T3 Code main @ 67eebac (apps/web/src, repo at scratchpad/t3/repo), plus a locally running build (Claude Haiku 4.5 driven through it, so real threads, tool calls, diff panel, terminal). Screenshots live next to this file in scratchpad/t3-design/ (dark-* and light-*). Sush comparison shots: scratchpad/shots-r6/.

Paths below are relative to `repo/apps/web/src` unless noted. Sush paths are relative to `/home/user/Sush/src/renderer/src`.

Key screenshots: `dark-00-start` (wizard), `dark-s2-01-after-close` (empty state), `dark-s2-02-thread` (new thread), `dark-05-model-picker`, `dark-06-access-menu`, `dark-07-palette-ctrlk`, `dark-09-palette-ctrlp`, `dark-13-settings-appearance` / `light-13-...`, `dark-14-settings-chat`, `dark-16-settings-providers`, `dark-19-usage`, `dark-r01-working0` (working), `dark-r09-done`, `light-t03-working1`, `dark-y01-tools-expanded`, `dark-y00-diff-open`, `dark-u01-rightpanel`, `dark-u02-terminal`, `dark-u08-palette-thread-search`, `dark-u09-mobile`.

---

## 1. Design system (extracted)

### 1.1 Philosophy
- Neutral, near-monochrome chrome. One blue action color (`--primary`), semantic colors only for status. All the "personality" is delegated to themes (T3 Code, T3 Chat pink, Grove, Ocean, Ember, Iris), each a pair of light and dark palettes.
- Tailwind v4 + `@base-ui/react` primitives + lucide icons (default stroke thinned to 1.75). `components/ui/*` "own their look": you pick `variant`/`size`, you do not restyle with className (AGENTS.md "Taste": "`apps/web/src/components/ui` exports own their look").
- AGENTS.md performance rule that explains much of the craft: "Our users drive agents all day and notice a dropped frame, a lying spinner, and a stale label. No continuously repainting animations; they peg the GPU on high-refresh displays." Every looping animation is stepped (see 2.1).

### 1.2 Color tokens (index.css, `:root` ~L1113, `@variant dark` ~L1190)
Light:
```
--background: zinc-25 (oklch 99.2% 0 0)   --foreground: zinc-900
--card/--popover: #fff                    --sidebar: zinc-50
--muted/--secondary: zinc-50              --accent: zinc-100
--border: zinc-200   --input: zinc-300    --muted-foreground: zinc-500
--primary: oklch(0.488 0.217 264)  (blue)  --ring: var(--primary)
--message-surface: mix(zinc-200 55%, zinc-100)    (user bubble)
--sidebar-row-hover: zinc-25  --sidebar-row-active/selected: #fff
--success emerald-500/700  --warning amber-500/700  --error red-500/700  --info blue-500/700
--error-surface: error 8%  --warning-surface: warning 8%
```
Dark ("true black canvas, raised surfaces keep the tone they had over neutral-950"):
```
--background: #000
--card/--popover/--surface-raised: mix(neutral-950 97%, white)
--foreground: neutral-100     --muted-foreground: neutral-400
--primary: oklch(0.571 0.21 264)
--secondary/--muted: white/3%   --accent: white/4%
--border: white/8%   --input: white/11%
--message-surface: mix(neutral-950 92%, white)
--error-surface: error 16%   --warning-surface: warning 16%
--sidebar: var(--card)  --sidebar-row-hover: accent  --sidebar-row-selected: muted
--secondary-label: #8f8f8f (sidebar row metadata, "a step below read titles")
```
Rules worth stealing: surfaces are expressed as white-alpha steps (3%, 4%, 8%, 11%), not new greys; borders are always 8% white; tinted status surfaces are 8% (light) / 16% (dark) of the status color.

Diff colors: `--diff-addition: success`, `--diff-deletion: destructive`, fg `light-dark(emerald-700, emerald-400)` / `light-dark(red-700, red-400)`; a colour-blind scheme (`data-diff-color-scheme="blue-orange"`, blue-600/400 and orange-600/400). Modified-file icon is a muted blue (`--diff-modified-icon: mix(info-fg 65%, transparent)` dark).

Contrast slider: every foreground/border is routed through `--contrast-*` tokens:
`--contrast-foreground: color-mix(in oklab, color-mix(in oklab, var(--foreground) var(--appearance-contrast-base), var(--background)), var(--appearance-contrast-target) var(--appearance-contrast-boost))`. User-facing "Contrast 100%" slider in Appearance.

Theme engine: `themePalette.ts` (1731 lines) defines ~40 `--app-theme-*` roles (canvas, chrome, toolbar*, surface, surface-raised, surface-overlay, text, muted-foreground, secondary-label, placeholder, icon-muted, accent-surface, message-surface, message-action(+hover), error/warning/update(+foreground/surface), border, input, focus, sidebar-*(foreground, muted, control-surface, row-hover/active/selected, border), code-background, terminal-*, search-match-*). `html[data-theme-id]:not([data-theme-id=""])` maps them onto the semantic tokens. Custom themes are authored/imported (VS Code themes), exported as JSON, and edited with an "inspector spotlight" color picker (`#theme-inspector-spotlight`, dimmer `rgb(2 3 8 / 54%)`).

Per-theme "stage art" (`--stage-art-*`, `--stage-night-*` oklch gradients, index.css ~L660-880) paint the sidebar backdrop (`sidebar-stage-backdrop` utility: mask `black 0 → 55% → transparent 92%` + an 8-stop fade gradient to `--stage-fade`). Sush already ships `--stage-night-*` (index.css L1713) so the team has already adopted this.

### 1.3 Type
- `--font-sans: -apple-system, BlinkMacSystemFont, "Inter Variable", "Segoe UI", system-ui, sans-serif`; `--font-mono: ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace`. Both overridable at runtime in Settings > Appearance (`appearanceFonts.ts`).
- Base text is Tailwind `text-sm` (14px) for rows/menus/messages, `text-xs` (12px) for toolbars/buttons; custom extra-small tier: `--text-2xs: 0.6875rem (11px)`, `--text-3xs: 0.625rem (10px)`, `--text-4xs: 8px`, `--text-5xs: 7px` (badges on provider icons). Chat font size, code font size (`--font-size-code`), prompt size are user prefs. Prompt on phones is forced to `max(var(--font-size-prompt,1rem),16px)` (iOS zoom).
- Numbers: `tabular-nums` on every timer/stat (work-group header, diff stats, usage).
- Hero headline ("What should we work on?") is ~28px regular, not bold in the thread draft; bold only on the wizard/no-project page (screens dark-s2-01 vs dark-s2-02).

### 1.4 Spacing, geometry, density
- 4px base (`--spacing`); compact UI geometry tokens in `:root`:
  `--control-radius: .5rem; --sidebar-content-inset: .5rem; --sidebar-control-gap: .5rem; --sidebar-row-content-inset: .625rem; --command-shell-inset: .5rem; --command-content-inset: 1rem; --floating-content-inset: .75rem; --workspace-topbar-height: 52px; --chat-content-max-width: 46rem (wide 72rem, full 100%); --thread-details-panel-width: 17.5rem; --workspace-gutter: .75rem (1.25rem at sm)`.
- Sidebar 16rem default, resizable (min 256px), icon rail 3rem, mobile `calc(100vw - 0.75rem)`.
- Button heights: default h-8 (h-9 on touch), sm h-7, xs h-6, compact h-7, micro h-5 (11px text), icon sizes 20/24/28/32/36/40px. Touch targets grow (`h-9 sm:h-8`) rather than the UI being one size.
- Radii: `--radius: .5rem` → sm 4, md 6, lg 8, xl 12, 2xl 16, 3xl 20px. Composer/dialog/popover-card = 2xl (16px); buttons/inputs = `--control-radius` 8px; chips/rows md-lg; media rounded-2xl; pills `rounded-full`.
- Z layers: `--z-sheet: 46`; terminal drawer 45; dialogs/popovers 50+; toasts `calc(9999 - index)`.
- Density: low-key "pro tool" density. Thread rows ~56px tall with two lines (project chip + status, title), 8px inset, `rounded-md`; menu rows 32px; command rows `py-1.5`; list text 14px. Chat column 46rem max (736px).

### 1.5 Elevation, glass, borders
- Glass utilities (index.css ~L330-390): `--glass-blur: 12px (16px dark)`, `--glass-opacity: 80%`, `--glass-saturation: 1.14 (1.08 dark)`. User-tunable "Glass opacity" slider (shown in Appearance, 80%).
  - `dialog-glass`: bg `color-mix(var(--background) var(--glass-opacity), transparent)` + blur + saturate; border 10% fg (8% white dark); shadow `0 24px 64px -24px rgb(0 0 0/65%)`, dark: `inset 0 1px rgb(255 255 255/4%), 0 24px 72px -20px rgb(0 0 0/90%)`.
  - `dialog-backdrop`: bg 60% (64% dark) + `blur(4px)`.
  - `dropdown-glass`: popover mixed 18% on top of glass; 1px border 10% fg.
  - `alert-glass`: 4% status tint over glass (used by toasts/banners).
- Composer elevation: `--shadow-composer: 0 1px 2px rgb(0 0 0/5%)` (light), dark `0 14px 32px -18px rgb(0 0 0/75%)`; dark adds a 1px inset top highlight `--chat-composer-highlight: rgb(255 255 255/3%)` and outline `white 5%` (ComposerSurface.tsx). Composer is `rounded-2xl`, p-px, outline drawn with an `after:` pseudo so the border never changes layout.
- Button elevation: default variant `inset-shadow-[0_1px_--theme(--color-white/16%)]`, `shadow-primary/24 shadow-xs`; pressed `inset 0 1px black/8%` (tactile 1px top highlight). Outline variants use `before:shadow-[0_1px_black/4%]` (light) and `0_-1px` white-ish (dark).
- Grain: SVG feTurbulence 256px tile baked into surfaces' `background-image` (`.surface-grain`, body) with opacity .035 inside the SVG; deliberately not a fixed overlay (perf). T3 Chat theme uses a 128px tile at 7/255 alpha.
- Scrollbars: 6px wide, thumb `rgb(255 255 255 / 8%)` dark, hover 12%. Scroll-edge fades (`topbar-scroll-fade`, `virtualized-scroll-fade`): 7-stop eased mask (0 / 10 / 30 / 58 / 82 / 96 / 100%) over 1.5rem under the title bar.
- Focus: `outline-ring/50`, 2px outline with `outline-offset: -2px` (inset, so clipped containers never cut it); menus/popups suppress their own outline.

### 1.6 Icons
lucide-react everywhere, stroke 1.75 (override for `svg.lucide[stroke-width="2"]`), sizes 12/14/16px (size-3/3.5/4). Provider logos are real brand marks (Codex, Claude sparkle, Cursor, etc.) with 12-14px badge overlays. File-type icons from Pierre (`PierreEntryIcon`). `MorphIcon` (the `morphicons` package) morphs between lucide glyphs.

---

## 2. Motion

Principle: motion is short, mostly `ease-out`, and everything that loops is duty-cycled/stepped.

### 2.1 Tokens and patterns (with source)
| Pattern | Spec | Source |
|---|---|---|
| Drawer curve | `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` (same as Sush's `--ease-sheet`) | index.css L193 |
| Height reveal | `AnimatedHeight`: ResizeObserver on content, rounds `Math.ceil(scrollHeight)`, `transition-[height] duration-200 ease-out`, clips only while animating (`overflow: clip`, `overflow-clip-margin: 2px`), 250ms fallback timer, re-measures over 2 rAF frames; nested collapsibles forced `transition:none` so the parent drives it | components/AnimatedHeight.tsx; index.css `[data-slot="animated-height"]` |
| Width morph | `AnimatedWidth`: inline-block overflow-hidden `transition-[width] duration-150 ease-out`, measured from an inner `w-max whitespace-nowrap` span. Used for the composer's model/effort label, so "Haiku 4.5 Thinking On" grows rather than jumps | components/AnimatedWidth.tsx |
| Icon morph | `MorphIcon` swaps glyphs (PanelLeft ⇄ PanelLeftClose, Copy ⇄ Check, ChevronRight ⇄ ChevronDown, Volume ⇄ VolumeOff) with `reducedMotion="user"`. Used on sidebar toggle, every copy button, tree/collapsible chevrons, toasts | components/MorphIcon.tsx (grep: ~20 call sites) |
| Panel animations | User setting `panelAnimationDurationMs` 0-400ms, **default 0** (instant). Sidebar, right panel, terminal drawer use `[[data-panel-animations=true]_&]:motion-safe:transition-[padding-left] duration-(--panel-animation-duration) ease-out`. `usePanelNavigationSuppression` waits 2 rAF after a route change so switching threads never replays panel transitions. `usePanelPresence` keeps a closing panel mounted for `durationMs` then unmounts. Settings page has a live preview (`PanelAnimationsPreview.tsx`) | panelAnimations.ts; docs/user/appearance.md "Motion" |
| Sidebar list FLIP | Web Animations API, 150ms `ease-out`: moved rows animate `translateY(offset → 0)`; removed rows are cloned, made `inert`/`aria-hidden`, absolutely positioned and faded `opacity 1→0` + translateY ≤40px; entering rows the same in reverse; capped at 40 faded rows per update; disabled by reduced-motion; interrupted animations keep remaining offset (`remainingOffset`) so rapid pin/settle never jumps | components/Sidebar.motion.ts |
| Drag reorder | rows slide aside to show the insertion gap, section label takes accent, drop badge says Pin/Unpin/Settle/Un-settle/Wake | Sidebar.drag.ts, docs/user/thread-sidebar.md |
| Dialog | popup `transition-[scale,opacity,translate] duration-200 ease-in-out`, nested dialogs scale `1 - 0.1*n`, translate `-1.25rem*n`, opacity `1 - 0.1*n` (stacked-card feel); backdrop `transition-all duration-200`, mobile sheet slides 4 (16px) | ui/dialog-styles.ts |
| Popover/menu | `data-starting-style:opacity-0 scale-98`-style (Base UI), 100-150ms | ui/popover.tsx, menu.tsx (duration-100/150 dominate: 31x `duration-150`, 23x `duration-200`, 7x `duration-100`) |
| Toast | stack transform `.5s cubic-bezier(.22,1,.36,1)`, opacity `.5s`, height `.15s`; collapsed stack with `data-expanded` reveal (opacity `duration-250`); tooltip `scale-98`; icon morphs (spinner → check) | ui/toast.tsx L602 |
| Skeleton | `--animate-skeleton: skeleton 2.4s infinite`, **stepped**: opacity 1 → .55 with `steps(4)`, one pulse per container | index.css L~270 |
| Status pulse | `status-pulse 2s infinite`: opacity 1↔.5 with `steps(6)`; `status-ping 2s`: scale .75→2, opacity .9→0 `steps(8)` then 60% hold | index.css |
| Live tool shine | text-clip gradient sweep, `live-tool-shine 2.2s steps(30) infinite`, paused when off-screen via `animation-play-state: var(--visible-animation-state, paused)` (IntersectionObserver sets it) | index.css `@utility live-tool-shine` |
| Live activity focus | masked highlight traveling across a running row `2.2s steps(30)`, counter-translated inner text | `live-activity-focus*` utilities |
| Mobile composer transition | View Transitions API: composer group morph at `--mobile-composer-transition-duration`, `cubic-bezier(.4,0,.2,1)`, old/new cross-fade 35%-65%, headline exits `translateY(-6px)` | index.css top |
| Settings search jump | target section gets `settings-search-target-pulse 650ms ease-in-out 2` (inset 2px ring at 70% primary), disabled under reduced motion | index.css |
| Stash pulse | row text flashes to foreground for 1.2s, `step-start` count in primary | index.css |
| Theme switch | `.no-transitions` class zeroes all durations during a theme change; also a "token probe" suppresses transitions | index.css |
| Reduced motion | `motion-reduce:transition-none`, `useMediaQuery`, all loops → opacity-only or none | everywhere |

What Sush has already: one spring (`--ease-sheet` identical curve), durations 80-320ms, `--travel` multiplier, reduced-motion + saver mode. Sush is actually ahead on the token system. What Sush lacks: height/width auto-animation, the list FLIP, icon morph, stepped loops, panel-animation setting and route-change suppression.

---

## 3. Component teardown

### 3.1 Welcome wizard (`dark-00-start`, `dark-02-wizard1`)
- Centered dialog (~766px wide, rounded-2xl, dialog-glass) over the *real app* blurred behind it (so users see what they are about to get). Header "**T3** Code" with T3 bold and "Code" in muted regular weight.
- A 3-step segmented stepper (Connect, Agents, Projects) in one tinted bar: current step is a raised pill with a number badge (blue-tinted circle), completed step shows a filled blue circle with check. Steps are not tabs you must pass, the bar is status.
- Each step: 24px semibold title ("Connect your computers"), 14px muted subtitle, a bordered list of rows (checkbox, device icon, name, URL, status text "Connected"), a "Add a computer >" row, and one primary CTA ("Continue →", blue, with an arrow) bottom-right. Privacy footnote sits left of the CTA, same baseline.
- Agents step: each provider is a row with logo, name, one-line status ("Downloading 131.2 of 199.7 MB."), inline Cancel + a primary "Setting up..." button with the provider logo, then a green "✓ Ready". Long operations are visible and cancellable inside the row.
- Escape/X closes it any time except during import; `/welcome` re-runs it; existing workspaces skip it (docs/user/welcome-wizard.md).
- Feels good because: it never traps you, state is shown in-row, a single CTA, and copy is plain ("We'll set up agents and projects on each.").
- Components: `components/ui/wizard.tsx`, `onboarding/`.

### 3.2 Empty states (`dark-s2-01`, `dark-s2-02`, `dark-q00`)
- No projects: centered bold "What should we work on?" + muted "Add a project, or start without one." + primary "Add project" and outline "Start without a project" (dashed-square icon). Sidebar mirrors with "No projects yet" + tiny pill "Add project". Right-aligned top-bar is empty rather than disabled-looking.
- Project draft: headline becomes "What should we build in **run** ?" with the project name as an inline menu; below the composer "or start without a project" as a quiet link. In a no-project draft the headline is "What should we work on?" with subhead "No project".
- Composer placeholder teaches syntax: "Ask anything. @ files, $ skills, / commands".
- On drafts the composer sits vertically ~45% down (hero), then docks to the bottom after the first send (animated; mobile uses view transitions).
- Settings Providers shows errors as a *status banner* toast top-center (amber `alert-glass`): "Codex provider status - Sign in with ChatGPT to use Codex. [Open provider setup] [Refresh]".

### 3.3 App shell
- Layout: 256px sidebar | thread (top bar 52px) | optional right panel (resizable, tabs) | optional bottom terminal drawer. The three layout toggles (thread details, terminal, right panel) are 28px ghost icon buttons top-right of the title bar. The title bar has a breadcrumb: project chip (2-letter monogram or favicon) / thread title (truncated), and only the sidebar toggle at left. No heavy chrome; the content column carries the page.
- Window Controls Overlay variable support (`.wco`) for native title bars; `drag-region` on top bar.
- Responsive: ≤767px collapses sidebar to a sheet, uses 16px prompt, grows touch targets (`dark-u09-mobile`).

### 3.4 Sidebar / thread list (`dark-r01-working0`, `dark-r09-done`)
- Top: wordmark + toggle; a Search field (opens the palette) with filter, add-project, new-thread icon buttons right-aligned (28px). Bottom: Settings, Source control/PRs, Usage icons.
- Threads are not grouped by project by default: they are organized by *work state*: **Pinned**, active list, **Working (n)**, **Settled (n)** collapsible shelves (and a Snoozed shelf). "Working" rises to the bottom dock in the screenshot with a live blue "Working 2s" label and a spinner; when done the thread moves up (animated FLIP) and the Working shelf collapses to "Settled 0".
- Row (two lines): top line = project monogram chip + project name (muted, 12px) + right-aligned status/relative time ("now", "1m"); second line = thread title, 14px medium; trailing = provider logo (Claude sparkle). Selected row: raised `sidebar-row-selected` fill (dark: foreground at 7%; light: white with 1px border), `rounded-md`; hover `sidebar-row-hover` (foreground 8%). Metadata color `--secondary-label #8f8f8f`.
- Hover reveals row actions (any-hover media-gated, so touch never shows ghost buttons). Hover card (`ThreadHoverCard`) previews thread. Right-click and drag give pin/settle/snooze/archive; each shows a toast with Undo for 5s (`mod+z` undoes last).
- Status dot vocabulary (ThreadStatusIndicators.tsx): `size-[9px] rounded-full` + `motion-safe:animate-status-pulse` for working; PR badge states; terminal-running teal `text-teal-600 dark:text-teal-300/90` pulsing; label text 10px (`text-3xs`).
- Why it feels good: sections by *what needs you*, undo for every destructive action, no layout jumps (FLIP), stable 256px width, the working label ticks with tabular numerals.

### 3.5 Thread timeline / messages (`dark-r09-done`, `light-t03-working1`)
- Single 736px lane, no avatars, no bubbles for the assistant (plain document flow with markdown), user messages are right-aligned `rounded-2xl` bubbles on `--message-surface` (dark `neutral-950 92% + white`; light zinc-200/100 mix), max ~80% width, text 14px, no timestamp until hover. Assistant footer: copy / fork icons + time at 12px muted, appears on hover.
- Turn header: "**Working for 4s**" (tabular nums, ticking) with a thin bottom rule; when done collapses to "Worked for 8.3s ›" (chevron morphs) that expands the activity log; a final answer follows below the rule. The summary uses plain-language counts: "Ran 1 command", "Changed 1 file and ran 1 command".
- Activity log rows (`dark-y01-tools-expanded`): 24px (`min-h-6`) rows, `text-sm text-muted-foreground`, icon at left (brain for thinking, pencil-square for edit, `>_` for command), one-line truncated label, trailing chevron; hover reveals; expanding a row shows output with only the latest chunk of long output. Live running row uses the shine sweep (2.2s stepped) not a spinner. The right edge shows time "7:14 AM" on the header row only.
- "Changed files" card at the end of a turn: bordered rounded-lg surface, "7 changed files **+930 -3**  [expand-all] [Open diff]", a folder tree with per-file +/- (green/red monospace, tabular), file-type icons.
- Floating timeline minimap left of the lane (tiny dashes visible at x≈270, `TimelineMinimap.tsx`) and a "Scroll to end" pill.
- Markdown: tables with 1px row rules and no outer border, code blocks with language label top-left and copy + wrap buttons top-right at 12px, inline code with subtle 10% bg chip, math (KaTeX), mermaid, citations that highlight source ranges (`::highlight(t3-assistant-citation)` in primary 45%).
- Find in thread (`ThreadFindBar`) uses CSS custom highlight API (`::highlight(t3-thread-find)`), no DOM mutation.

### 3.6 Composer (`dark-s2-02-thread`, `dark-03-composer-slash`, `dark-r01-working0`)
- Card: 736px, `rounded-2xl`, glass surface (`--surface-raised` at `--glass-opacity`), 1px outline 5% white + 1px inset top highlight in dark, shadow `0 1px 2px` (light). Padding p-px outer, 16px inner. Min height = `2lh + 8px` (two lines) so it looks inviting when empty; max-h 52 (13rem) then scrolls.
- Editor is Tiptap rich text rendering Markdown live ("what you typed is what the agent receives"); `/` shows slash menu (anchored *above* the composer as an attached strip, `dark-03`: command name in mono-ish bold + description, selected row foreground 9%), `@` files, `$` skills, `#1234` PRs. Escape dismisses mentions.
- Footer row (single line, 28px controls): left: attach (paperclip, icon-only). Right: model+effort pill ("✳ Haiku 4.5 **Thinking On**" with `AnimatedWidth`, provider icon, model in medium weight, trait in muted), then a round 32px send button (grey arrow when empty, blue when has text, **red stop square** while running). Permission mode is *outside and below the card*: "⊘ Full access" at 12px muted, right aligned, i.e. a status line, not a toolbar button.
- States: empty / typing (send turns blue) / slash menu / working (stop button, composer stays editable: follow-up behavior Queue or Steer, Cmd+Enter inverts) / queued messages strip (`QueuedRunsControl`) / pending approval replaces the footer (`ComposerPendingApprovalActions`) / pending user input panel / banners attached to the composer top (`ComposerBanner` slots, "attached" banners remove the card shadow and merge surfaces with a 10px seam shade `rgb(0 0 0/18%)`) / drafts auto-saved per thread (`composerDraftStore`), large pastes (≥32KiB) become attachments, 120k char limit with validation message.
- Context row (branch, worktree, environment) sits below the card on drafts and retreats on first send (opt-in "Composer context" keeps it).
- Keyboard: Enter send, Shift+Enter newline (continues lists), Tab nests list items, Cmd+Shift+M model, Shift+E effort, Shift+A permissions, Shift+X workspace, Shift+G branch, Cmd+Enter opposite follow-up, Cmd+Alt+Enter send and open new draft in the background, Cmd+Shift+Enter send first queued as steer.
- Why it feels good: it is one calm card; every control is a quiet text button except send; the stop button is the same slot as send (no layout shift); everything has a keyboard shortcut and the doc lists them.

### 3.7 Model picker (`dark-05-model-picker`, `dark-q01-picker-claude`)
- Popover 552px × ~390px, glass, three columns: provider rail (36px, icon-only: star = Favorites, one logo per provider with a 2px blue indicator bar for the active one), model list (search at top with an animated blue underline on focus, rows with provider icon + name, "Show more" collapsing long catalogs), and an "Effort" side pane (`Effort · gpt-6-astra`, lists levels or "No effort levels"). Footer inside the popover repeats Permissions ("⊘ Full access ⌃") so one popover configures everything.
- Keyboard: Left from empty search jumps to the provider rail, Up/Down within, Enter picks, Right goes to effort levels, Cmd+Shift+Up/Down switch providers; Shift-click multi-selects models to fan out one prompt to several models/worktrees. Picking a model keeps the popover open on its effort (progressive disclosure).
- Unauthenticated provider shows an inline notice in the list ("Sign in with ChatGPT to use Codex. Open provider setup") rather than hiding the provider.
- After pick, a "Thinking On/Off" 2-option menu opens from the traits button (`TraitsPicker`).

### 3.8 Permission mode control (`dark-06-access-menu`)
- Four modes in a segmented 4-icon control (lock = Supervised/"Ask before commands and file changes", pencil = Auto-edit, sparkle-hand = Auto, shield-off = Full access) inside a 288px popover titled "Permissions". The selected segment is lit; below it the selected mode's **name + one-line consequence** ("Full access: Allow commands and edits without prompts."). Hovering a segment previews its description. The trigger line shows icon + name at 12px muted below the composer. Danger level is communicated by icon, not red.

### 3.9 Command palette (`dark-07`, `dark-08`, `dark-09`, `dark-u08`)
- Cmd/Ctrl+K: 575px wide, `rounded-2xl` dialog-glass, positioned ~90px from top (not centered), single input row with search icon (no visible border, 14px), results below, **footer bar** with `↑ ↓ Navigate · Enter Select · Esc Close` rendered as real `kbd` chips (`CommandFooter`: `border-t foreground/7%`, bg `foreground/2.5%`, `py-2.5`, text-sm muted).
- Content: Actions group (New thread in <project>, New thread in..., New thread without a project, Triage an issue (with description), Go to file, Search project contents, New project, Add project, Change theme (submenu chevron)). Each row: 16px icon, label, trailing shortcut in `text-secondary-label text-xs tracking-widest`. Active row `bg-foreground/[0.09]`, selected-but-not-highlighted `/[0.06]`.
- Typing searches across **Actions, Projects, Threads** (`Threads` group shows title, project chip, "Local", provider icon, "1m ago"); `>` filters to actions only; Cmd+1..9 choose results directly on iPad.
- Ctrl+P switches to file-search mode ("Search files...", footer "Enter Open file, Esc Back"). Sub-flows (Add project: sources list, then a path browser "Directories / .. / run" with Backspace=Back) reuse the same shell, so the palette is an app-wide wizard host. Theme list previews live.
- Never scrolls the page; list has `scroll-py-2 p-2`; the first row is preselected so Enter always does something.

### 3.10 Settings (`dark-13`, `dark-14`, `dark-16`)
- A large modal (~1280×820, rounded-2xl) over the app (route-based, `AppRouteModal`), two panes: left nav 240px with its own search field (hotkey `/` shown as a kbd) and grouped sections (General, Appearance, Chat, Diffs & pull requests, Keybindings, SnapShots / **Agents**: Providers, Threads, Browser, Devices, Scheduled tasks / **Code**: Projects, Source control, Worktrees / **Connections**: Environments, Sharing & access / Maintenance, Labs, About). Icons 16px lucide, labels 14px; section headers 12px muted.
- Right pane header is a breadcrumb "Settings / Appearance" + X. Content: 14-15px semibold section titles ("Composer", "Follow-ups"), then ONE rounded-xl bordered card per section with rows: title 14px, description 12px muted, control right-aligned, `divide-y` hairlines, "Advanced" disclosure row at the bottom of a card.
- Controls: custom `Switch`, native-feeling `Select` (outline button with chevron), custom range slider (6px pill track filled with primary, 1px inset border, 24px hit area), mono value chip "100%".
- Appearance: Color scheme as three **miniature app previews** (System shows a diagonal light/dark split) with selected = 2px blue ring; Themes as 2-orb tiles (light orb, dark orb, each a gradient sphere, selected orb ringed with a sun/moon badge), with copy-as-new and "Create theme" / "Add theme" buttons; "Interface" card has Contrast and Glass opacity sliders and more below (fonts, chat width, panel animation duration with live preview).
- Providers: master/detail with a provider list (logo, name, version in mono, status dot + one-line status, enable switch) and a detail pane (Status, Display name, Setup with primary "Continue with ChatGPT" and ghost "Use existing CLI", Runtime, Environment vars, Models with "Add custom model"); "Applying settings for [All projects] on [vm]" scope selectors above. Search in settings jumps to a setting and pulses it.
- Same card/row pattern in Chat, Keybindings (command IDs searchable), Threads, Worktrees.

### 3.11 Usage page (`dark-19-usage`)
- Same modal chrome as settings. Header is a breadcrumb with two scope dropdowns ("Usage / All environments ⌄ / All providers ⌄") and a segmented tab group on the right (Cost, Tokens, Limits) plus refresh + close. With no data it shows a single honest sentence rather than empty charts. With data: cost split by token type and speed, per-model breakdown, trend, cache hit rate, $/Mtok; copy always says estimates are "API-equivalent, not your subscription bill".

### 3.12 Right panel and terminal (`dark-u01`, `dark-u02`, `dark-y00`)
- Right panel is a tabbed surface host: empty tab shows "Open a surface" menu with single-key hints (Browser B, Terminal T, Files F, Diff D, Pull request P, Linked pull requests L, Device M, Side chat S); unavailable surfaces are dimmed (Diff dimmed until the project is a git repo). Tabs are 28px pills with a + at the end; panel can be maximized (expand icon) and the thread column shrinks.
- Diff panel: toolbar: scope dropdown ("Latest turn", "Changes"), `+930 -3` stats in green/red mono, collapse-all, stacked/split toggle, word-wrap, whitespace, tree view. Files are collapsible with a blue "modified" dot, `-2 +6` counts at right; unchanged runs collapse to "3 unmodified lines" bars with line numbers; added lines are green-tinted with a 3px left bar and intra-line word highlights; loading state is a skeleton of file headers + stepped bars (light screenshot `light-x02`). Powered by `@pierre/diffs` in shadow DOM themed through `--diffs-*` vars and the same `--font-mono`.
- Terminal drawer slides up from the bottom with a 1px top rule, no chrome, toolbar icons right (split, columns, +, trash) at 14px, inherits `--terminal-*` theme colors.
- Thread details card (top-right dropdown): env + folder, "Open in editor", "Add project script", git branch/Commit/Changes `+64,756 -2`, Servers (detected localhost ports as clickable rows with "Agent · claude" attribution).

### 3.13 Toasts and banners
- Top-center stack, `dropdown-glass`, `rounded-lg`, `shadow-xl shadow-black/25`; status tint via `alert-glass` (4% tint) with 1px border in the status color 32%; title 14px medium in status color, body 14px, actions as ghost + compact outline buttons; X at top-right (24px round). Success/loading icons MorphIcon between states. Undo toasts live 5s. Anchored copy toasts appear next to the clicked button (`anchoredCopyToast`). Slow-RPC, host-freeze, update, provider-status each have their own coordinator, so they never stack duplicates.

---

## 4. Design work in flight (2,766 branch names)

Grouped (inferred from names only; not read):
1. **Full redesign train**: `maria/redesign/1-primitives-shell`, `2-composer-timeline`, `3-panels-pages`, `4-settings-setup`, `5-voice`, `6-workspace-panes` (a 6-step stacked redesign: primitives and shell first, composer and timeline, panels, settings and setup, voice, workspace panes). Also `t3/ui-redesign-toggle`, `ui-refresh-over-pr-4268`, `t3/redesign-new-surfaces`, `revert-6275-agent/ui-workspace-refresh` (a refresh that was reverted), `t3code/cool-black-redesign` + `t3code/black-dark-mode` (already visible in main: true `#000` canvas).
2. **Polish passes**: `t3/ui-polish-overhaul`, `t3/ui-polish-clarity`, `t3/ui-color-pass`, `agent/pr-4055-draft-hero-polish`, `restyle/sidebar-buttons`, `restyle/sidebar-parts`, `t3/composer-footer-padding`, `grok-bot/...-composer-banner-shadow`, `fix/snapshot-overlay-light-mode`.
3. **Tool call and activity UI**: `t3/redesign-tool-call-ui`, `ui-refresh/tool-activity-turns`, `pr-assets/cua-tool-title-icon-ov2`, `t3code/fix-codex-style-tool-icons`, `pr-assets/subagent-diffbar-redesign`, `t3/fix-subagent-ui-split`, `t3code/subagent-workflow-sidebar`, `t3/workflow-ui-mockups`.
4. **Sidebar evolution**: `agent/sidebar-v2-only`, `codex/sidebar-v2-grouped-filter`, `t3code/sidebar-v2-mobile`, `t3code/sidebar-familiar-beta` (a familiar project-grouped variant), `t3code/sidebar-work-overview`, `t3code/sidebar-waiting-state`, `feat/sidebar-thread-reordering`, `t3code/project-grouping-ux`, `t3code/resizable-chat-sidebar`, `codex/issue-3962-sidebar-collapse-performance`, `sidebar-threads/*`.
5. **Theming**: `cursor/t3-code-custom-themes`, `cursor/user-theme-palette`, `t3code/vscode-theme-plan`, `settings-theme-04/tools-*`, `t3code/revert-core-ui-palette`, `cursor/activity-sort-and-theme-redraw`, plus main already has the theme editor + stage art.
6. **Composer**: `t3code/composable-chat-layout`, `t3code/preserve-wrapped-composer`, `t3code/cap-composer-max-size`, `t3code/audit-composer-indicators`, `t3code/composer-escape-dismiss-mentions`, `t3code/inline-context-review/02-composer`, `ui/traits-picker`, `ui/selected-checkmarks`, `pr-assets/composer-model-picker-hit-area`, `t3bot/restore-composer-stage-artwork` (brand artwork behind the composer).
7. **Mobile / tablet**: `t3/mobile-ui-overhaul`, `t3code/redesign-mobile-ui`, `t3code/ipad-responsive-mobile-layout`, `t3/mobile-ds-native-toast`, `t3bot/mobile-pending-card-glass`, `agent/mobile-audit-animation-lifecycle`, `t3/evals-mobile-design`, `t3/improve-foldable-android-layout`.
8. **Other surfaces**: `t3code/visual-replies-beta` (HTML/visual replies), `feat/plugin-management-ui`, `t3code/keybinding-settings-redesign`, `t3bot/onboarding-menu-ui`, `t3code/peer/handoff-ui`, `t3code/plan-ux-review`, `ui-refresh/context-menu-lucide-icons`, `ui-refresh/terminal`, `grok-bot/...-favorites-picker-design`.

Takeaways: T3 is converging on (a) true-black dark with raised glass, (b) work-state-organized sidebar, (c) quieter, grouped tool activity, (d) themeability as a product feature, (e) mobile parity. These are the same directions Sush is on.

---

## 5. Side-by-side critique

### Where Sush is better
- **Identity and warmth.** Plum surfaces, pink glow ramps (`--glow-soft/strong/ring/text` index.css L2702-2706), orb, wash gradients. T3 is deliberately neutral and can feel generic. Keep it.
- **Mac structure.** Real traffic-light placement, `--mac-*` tokens, 0.5px hairline menu shadows. T3's chrome is web-first.
- **Motion tokens are more rigorous**: one spring, duration ladder (80/120/180/240/320/150), `--travel` multiplier, `sush-motion-reduced` and a battery saver. T3 has ad-hoc Tailwind durations.
- **Agent-fleet UI.** "Needs input" rows, attention bell, status strip, handoff lineage, split/grid layouts, 3D office, usage in the rail. T3 is single-thread-centric.
- **Composer extras.** Context meter ("187K / 1M"), mic, per-thread effort flyout, Seducia voice orb. T3 has no voice in main yet (`maria/redesign/5-voice` only).
- **Diff pane density** is on par; Sush shows file-level send-to-agent action.

### Where T3 is better
- **Craft in the details that compound**: auto-height/width animation, icon morphing, FLIP list motion, undo toasts, stepped loops, skeletons, scroll-edge fades, inset focus rings.
- **Systemization**: semantic token roles (`--app-theme-*` ~40 roles), contrast slider, glass opacity slider, user theme editor. Sush has hard-coded hex in many components (Seducia `#0b0e11 #171c22 #20272e #11151a`, CommandPalette `#1a2128 #2a333c #141a20`) that do not follow the plum/accent theme and ignore themes.
- **Primitives**: Button with 14 variants/12 sizes and tactile 1px highlight; `Kbd`; Switch; Select; Empty; Wizard. Sush uses inline `style={{}}` heavily (hundreds of instances) with no shared Button/Kbd/Switch.
- **Command palette** as the universal entry (threads + actions + files + sub-flows, `>` action filter, footer hints, live theme preview).
- **Thread state taxonomy** (Pinned / Working / Settled / Snoozed) plus drag-to-change-state and Undo.
- **Settings**: modal with global search + hotkey `/`, jump-and-pulse to the matched setting, previews instead of descriptions.
- **Activity log language**: "Ran 1 command", "Changed 1 file" collapsed under a ticking "Worked for 8.3s", then expandable. Quieter than a tool-card stack.
- **Keyboard coverage and discoverability** (every composer control has a chord, shown in menus; Settings > Keybindings lists IDs).
- **Mobile/touch**: sizes grow on coarse pointers, `any-hover` gating, 16px prompt.

### 5.1 The 20 adoptions (ranked by value / effort)

Each: what, why, spec, where.

1. **Shared `Kbd` + footer hint bar for palettes and menus.**
   Why: Sush's CommandPalette hand-rolls `kbd` with `#1a2128` (cool blue-grey that clashes with plum) and has no consistent footer. Spec: `kbd { font: 500 var(--fs-sm)/1 var(--font-ui); min-width:20px; height:20px; padding:0 5px; border-radius:var(--r-xs); background: rgba(226,206,255,.07) (= --mac-fill); border:1px solid var(--border-2); color:var(--text-3) }`; footer `border-top:1px solid var(--border-1); background: rgba(255,255,255,.025); padding:10px 16px; gap:12px; font-size:var(--fs-md); color:var(--text-3)` containing `↑↓ Navigate · ↵ Select · Esc Close`. Files: `components/CommandPalette.jsx` (L105, L149-150), `QuickSwitcher.jsx`, `ShortcutsHelp.jsx`, new `components/ui/Kbd.jsx`.

2. **Palette: unified search (actions + threads + files), `>` actions-only, first row preselected, row spec.**
   Spec: width 575px, top offset 90px (not centered), radius `var(--r-xl)` 15px (T3 16px), input row 44px with no border, row `padding:6px 8px; border-radius:var(--r-sm)`, active bg `color-mix(in srgb, var(--accent) 12%, rgba(255,255,255,.05))` (Sush pink instead of T3's foreground 9%), trailing shortcut `font-size:12px; letter-spacing:.1em; color:var(--text-4)`; thread results show project chip, provider icon, relative time. Groups: Actions, Projects, Threads with 12px muted labels. Files: `CommandPalette.jsx`, `QuickSwitcher.jsx` (merge), `lib/commandFrequency.js` (rank).

3. **Undo toast system (the missing toast layer).**
   Why: Sush has no toast infra (only `AliasNudge.jsx`). Closing, archiving, handing off, discarding a draft are all irreversible. Spec: top-center stack, `width:min(420px,92vw)`, `border-radius:var(--r-lg)`, bg `var(--mac-menu)` + `backdrop-filter: blur(14px) saturate(170%)`, border `0.5px solid rgba(255,255,255,.1)`, shadow `var(--mac-shadow-menu)`; status tint = 4% of status color over the glass with a 1px border at 32%; enter `transform: translateY(-8px)*var(--travel) scale(var(--scale-enter))` to none over `--dur-enter` `--ease-out`; exit `--dur-exit` `--ease-in`; Undo toasts live 5s with a 2px accent progress hairline along the bottom; max 3 visible, collapsed deeper ones at scale .96 offset 8px; `mod+z` triggers the latest Undo; announce via `aria-live="polite"`. Files: new `components/ui/Toast.jsx` + `lib/toast.js`; wire into `ShellSidebar.jsx` (archive/close), `NightlyContextMenu.jsx`, `i` close-project confirm (shot `02i`).

4. **Auto-height disclosure (`AnimatedHeight`).**
   Why: Sush uses grid-template-rows in 3 places only; "Worked >", tool groups, diff file collapse, settings "Advanced", model effort flyout all hard-cut. Spec: wrapper `transition: height 200ms var(--ease-sheet)`, ResizeObserver measuring `Math.ceil(scrollHeight)`, clip only during transition, `overflow-clip-margin:2px` (keeps focus ring/glow visible), 250ms fallback timer, disabled when `.sush-motion-reduced` / `--travel:0`. Port TSX → JSX near verbatim (components/AnimatedHeight.tsx is 100 lines). Files: new `components/ui/AnimatedHeight.jsx`; use in `shell/ThreadView.jsx` work group, `shell/ShellDiffPanel.jsx` file sections, `settings/*`, `Seducia.jsx` launch card.

5. **Collapsed "Worked for 3m 43s >" activity group with plain-language summary and live row shine.**
   Sush already has "Worked for" (shot n2-thread). Adopt T3's *expanded* grammar: summary line `Changed 1 file and ran 2 commands` (counts, plural-aware, edits and commands first, max two categories + "and N more"), 24px rows (`min-height:24px; font-size:var(--fs-lg); color:var(--text-3)`), leading 14px icon (brain/edit/terminal) + one-line truncated label + hover chevron, expand → output with only latest chunk. Running row: stepped text-shine `background:linear-gradient(90deg,transparent,var(--text-1),transparent) 0/4.5rem 100% no-repeat, var(--text-4); -webkit-background-clip:text; color:transparent; animation: shine 2.2s steps(30) infinite; animation-play-state: var(--visible-state,paused)` (set to running by IntersectionObserver). Files: `shell/ThreadView.jsx`, `lib/agentActivity.js`, `index.css` (add `@keyframes sush-live-shine`).

6. **Stepped loop animations for all status indicators.**
   Why: `sush-pulse-dot`, `seducia-breathe`, `ag-pulse-orbit`, orb layers repaint every frame; Sush already has a `sush-saver` mode precisely because of this. Spec: working dot `animation: sush-status-pulse 2s infinite` with `0-40% opacity 1 steps(6); 50-90% opacity .5 steps(6)`; skeleton `2.4s` `steps(4)` 1→.55; ping `scale .75→2, opacity .9→0, steps(8)`. Pause offscreen with `animation-play-state: var(--visible-animation-state, paused)`. Files: `index.css` L304-460 (`sush-orb-pulse`, `sush-pulse-dot`), `.ts-row[data-tone="working"]` (L3250), `.ag-dot`.

7. **Sidebar thread rows by work-state with FLIP movement.**
   Spec: sections Pinned, Needs input, Working (n), Settled (n, collapsible); row 2-line (project chip 12px muted + status on right; title `--fs-lg` 500); selected `background: var(--mac-select)`, hover `rgba(255,255,255,.06)`, radius `var(--r-md)`; FLIP list motion `150ms ease-out`, translateY ≤40px, cap 40 faded rows, clones `inert aria-hidden`, honors reduced-motion (port `components/Sidebar.motion.ts` ~190 lines, framework-free). Section header counts use tabular-nums. Files: `shell/ShellSidebar.jsx`, `NightlyWorkspaceRail.jsx`, new `lib/listMotion.js`.

8. **MorphIcon for toggles.**
   Why: instant micro-delight on sidebar toggle, copy→check, chevrons, mic→stop. Spec: use `morphicons` (npm, same lib) or a 120ms SVG path crossfade + `rotate(±90deg) scale(.8)`; `reducedMotion="user"`. Files: `components/Icons.jsx` (add `MorphIcon`), `shell/ShellHeader.jsx` (sidebar toggle), `shell/ThreadView.jsx` (copy), `ShellDiffPanel.jsx` (copy path).

9. **`AnimatedWidth` for composer pill (model · effort).**
   Spec: `inline-block; overflow:hidden; transition: width 150ms ease-out`, measured by inner `w-max whitespace-nowrap`; used on the "Sonnet (latest) · High" pill so changing effort doesn't pop. Files: `NightlyComposer.jsx`, `shell/ShellModelPicker.jsx`.

10. **Composer permission line below the card + 4-icon segmented control with live description.**
    Why: Sush hides mode/effort inside "..." and the picker. T3: 12px muted status line right-aligned under the card ("⊘ Full access"), click opens a 288px popover with 4 icon segments (lock / pencil / sparkles / shield-off) and the selected mode's name + consequence line (14px/12px). Spec: segment 40×28px, `border-radius:var(--r-sm)`, selected `background: var(--accent-a16); box-shadow: inset 0 0 0 1px var(--accent-a35)`; hover on a segment previews its description. Files: `NightlyComposer.jsx` (the `...` menu at shot n2c), `NightlyPaneMenu.jsx`, new `NightlyPermissionPopover.jsx`. Dark mode danger uses an icon change, not a red button.

11. **Model picker: 3-column keyboard model (provider rail, list, effort pane), footer permissions.**
    Sush picker is a 2-col list (shot n1c) with long "OpenCode · new thread · Whatever..." subtitles. Spec: 552×390px, rail 36px with 2px accent bar (`var(--accent)` + glow-soft) on active, search with animated underline (`transform:scaleX` 180ms), model rows 32px single-line (no subtitle; put provider in the rail), effort pane 168px; Left in empty search → rail, Right at end → effort, Cmd+Shift+Up/Down switch provider; keep popover open after choosing a model to pick effort; Shift-click to fan-out. Files: `shell/ShellModelPicker.jsx` (621 lines), `NightlyModelMenu.jsx`, `NightlyModelLaunchSettings.jsx`.

12. **Dark glass surfaces: add the inset top highlight and white-alpha border system to cards/composer.**
    Spec: card `border: 1px solid rgba(255,255,255,.05–.08)` drawn with `::after` (no layout shift) + `box-shadow: inset 0 1px 0 rgba(255,255,255,.03)`; elevation `0 14px 32px -18px rgba(0,0,0,.75)` (composer) and `0 24px 72px -20px rgba(0,0,0,.9)` (dialogs). Add accent glow only on focus: `--glow-ring`. Replace per-component hex (`#0f1318`, `#171c22`, `#20272e`) with `--surface-*`/`--border-*`. Files: `Seducia.jsx` (many), `CommandPalette.jsx`, `QuickSwitcher.jsx`, `NightlyComposer.jsx`, `index.css`.

13. **Primary button tactile highlight + sizes.**
    Spec (accent version): `background: var(--accent); color:#1a0610; border:1px solid var(--accent); box-shadow: inset 0 1px 0 rgba(255,255,255,.16), 0 1px 2px color-mix(in srgb, var(--accent) 24%, transparent)`; `:active` `box-shadow: inset 0 1px rgba(0,0,0,.08); transform:scale(.985)`; sizes 20/24/28/32px (radius `var(--r-sm)`→`var(--r-btn)`); icon button 24/28/32. Ghost: transparent → `var(--mac-fill)` on hover. Touch (pointer:coarse) +4px. Files: new `components/ui/Button.jsx`, then migrate `Onboarding.jsx`, `NewSessionModal.jsx`, `HandoffModal.jsx`.

14. **Settings: modal with left-nav search, setting jump-and-pulse, card/row pattern, preview tiles.**
    Sush settings (06a) is already clean; add: search that scrolls to the matched row and runs `pulse 650ms ease-in-out 2` (inset 2px ring in `var(--accent-a55)`), row anatomy (title 14px / description 12px muted / right control, `divide-y 1px var(--border-1)`), "Advanced" disclosure row using AnimatedHeight, and Appearance previews: replace the 4 colored dots with miniature app thumbnails (rail + thread + composer drawn in the theme's colors, selected = 2px accent ring + `--glow-soft`). Also add *Glass opacity* and *Contrast* sliders (`.settings-slider` spec: 6px pill track, primary fill, 1px inset border, 24px hit height). Files: `Settings.jsx`, `settings/*`, `themes/*.js`.

15. **Panel animation duration setting + route-change suppression.**
    Spec: slider 0–400ms (Sush default 240 sheet / 0 under saver); `usePanelNavigationSuppression`: skip panel transitions until 2 rAFs after a thread switch so switching threads never replays right-panel/terminal animation. Files: `App.jsx` layout state, `lib/motionPolicy.js`, `settings/` Performance page (shot 06d).

16. **Scroll-edge fade under translucent headers.**
    Spec: 1.5rem mask on the scroll container: `mask-image: linear-gradient(to bottom, transparent 0, rgba(0,0,0,.1) 10%, rgba(0,0,0,.3) 24%, rgba(0,0,0,.58) 42%, rgba(0,0,0,.82) 62%, rgba(0,0,0,.96) 82%, #000 100%)` over the top 24px (+1px) and solid elsewhere (keep scrollbar lane opaque). Files: `shell/ThreadView.jsx` scroller, `RightPanel.jsx`, `Seducia.jsx` transcript.

17. **Inset focus ring + `outline-offset:-2px` and hover-actions gating.**
    Spec: `:focus-visible { outline: 2px solid color-mix(in srgb, var(--accent) 50%, transparent); outline-offset:-2px }`; row action buttons shown with `@media (any-hover:hover)` only; `focus-within` also reveals. Fixes clipped rings in the sidebar and diff panel. Files: `index.css` global, `shell/ShellSidebar.jsx`.

18. **Empty/draft hero that teaches syntax, composer docks on first send.**
    Spec: headline 28px/400 (`text-wrap:balance`), project name as an inline menu, composer placeholder "Ask anything. @ files, $ skills, / commands" (Sush: add `!` for shell, `#` for PR), hero composer ~45% from top; on first send animate dock to bottom with `--dur-sheet` `--ease-sheet` (FLIP the composer rect). Files: `HomeDashboard.jsx`, `NightlyComposer.jsx`, `shell/ThreadView.jsx`.

19. **Skeleton states instead of blank panels.**
    Diff, files, history, and usage tabs: header + 4 bars, stepped `steps(4)` 2.4s pulse, `border-radius:var(--r-sm)`, bars `rgba(255,255,255,.06)`, widths 38/62/54/72%. Files: `panel/ChangesTab.jsx`, `FilesTab.jsx`, `HistoryTab.jsx`, `UsageBar.jsx`, `shell/ShellDiffPanel.jsx`.

20. **Grain on chrome (opt-in) + semantic theme roles.**
    Add `--surface-grain` (SVG feTurbulence 256px, .035 opacity baked in the tile) to rail/toolbar backgrounds only, never a fixed overlay (T3's perf note). And formalize theme roles: map Sush themes (`themes/*.js`) to ~24 roles (`canvas, chrome, surface, surface-raised, overlay, text, text-muted, label, border, input, focus, accent-surface, message-surface, action, row-hover, row-selected, code, terminal*`) so Seducia/CommandPalette/QuickSwitcher can stop hard-coding hex, and add import/export JSON (pairs with the existing "Create a custom theme"). Files: `index.css`, `themes/index.js`.

### 5.2 Things NOT to copy
Blue primary, neutral grays, bold white wizard, flat dark `#000` canvas (Sush plum-black carries the brand), the 6px scrollbar thumb at 8% (Sush's 14% is fine), bland provider-first icon-only rail.

---

## 6. Seducia chat (Seducia.jsx, SushOrb.jsx)

Current state (shots n4-chat, code L337-578): docked pane, orb hero with "Hi, I'm Seducia", recent-work cards, 6 quick cards, bubbles (`border-radius:12`, 4px "tail" corner, accent-tinted user bubble, `whiteSpace:'pre-wrap'`, no markdown), avatar chip at 24px, "via claude CLI" footer, blinking caret, voice controls.

What T3 does for chat that Seducia should take:

1. **Drop bubbles for the assistant, keep a bubble for the user only.** T3: assistant = plain document flow on the canvas at 14px/1.6, user = right-aligned `rounded-2xl` on a `--message-surface` (one step above the canvas, no border). For Seducia: assistant text in `var(--text-2)` 13px/1.6 with a 24px orb-chip only on the *first* message of a run (not each message), user bubble `background: color-mix(in srgb, var(--accent) 10%, var(--surface-2)); border:0; border-radius:16px` with no 4px tail corner (T3 uses uniform 16px). Replaces the hard-coded `#0f1318`/`#1b2127` with tokens (also removes the cool blue-grey that fights the plum).
2. **Render markdown** (`lib/markdown.jsx` exists but bubbles are `pre-wrap`): code blocks with language label + copy, tables with hairline row rules, inline code chip. This is the biggest functional gap versus T3 for a chat surface.
3. **Turn grammar: "Working for 4s" → "Worked for 8.3s >"** wrapping Seducia's tool/intent actions (start agents, brief, status). Today `LaunchCard` and `applyIntent` results appear as bubbles; render them as activity rows ("Started 3 Claude agents in sush", "Asked Codex Review for status") in a collapsed, plain-language group with a ticking timer and live shine on the running row, then the answer below the rule. Seducia's own actions already come from `lib/seducia.js`/`seduciaActions.js`, so group by action type with counts.
4. **Composer parity.** Replace the single-line omnibar ("Launch, prompt, or ask anything...") with the T3 card: `rounded-2xl`, 2-line min height, placeholder teaching `@ agent`, `/ command`, Shift+Enter newline, Enter send; send button morphs to a **stop** square (red `#ff5470`-ish) while streaming, same slot; mic becomes the left icon, hands-free toggle moves to a status line under the card ("Hands-free: off") in 12px muted like T3's permission line. Show engine ("Claude CLI") as the pill with `AnimatedWidth`, replacing the per-message "via claude CLI" tag.
5. **Approval as composer-attached banner.** `shots 02l-seducia-approval`: render Seducia safety prompts (`seduciaSafety.js`) as T3's attached banner: sits flush on top of the composer, composer card loses its own shadow, 10px seam shade `rgba(0,0,0,.18)`, with explicit Allow / Deny buttons and the consequence in one sentence, `mod+Enter` to approve. Use the same trick for the launch countdown (`LaunchCard`'s 5s timer): an attached strip with a draining 2px accent bar rather than a standalone card.
6. **Hero → docked transition.** Keep the orb hero but animate: on first send, orb shrinks 92 → 30px and moves to the header over `--dur-sheet` with `--ease-sheet` (FLIP), the welcome block fades `translateY(-6px)` over `--dur-exit`, composer docks to the bottom. T3 does the same with the draft hero (view transition, 35%-65% crossfade).
7. **Typing/streaming states with stepped cues** instead of a blinking caret: streaming text caret = 2px accent bar, `steps(2)` 1s blink; thinking = the orb in `thinking` state plus a "Thinking" row using the shine sweep. Orb: keep `transform/opacity` only; add `animation-play-state` pause when the window is hidden or the pane is off-screen (T3 `--visible-animation-state`); the orb's 3 ripples + 2 auras + sparks are the largest continuous GPU cost in the app, so run ripples only in `listening` (already) and cap sparks to 3 in `idle`.
8. **Threads and history.** T3's lesson: every conversation is a *thread with a status* in the sidebar. Seducia has "2 sessions" but one log. Give Seducia conversations rows in the sidebar ("Seducia · Plan the migration", status Working/Settled), Cmd+K threads search, and `mod+z`/Undo on "Clear chat". `recentWork` cards ("Claude Code asked you something... Answer →") already do this well; make Answer deep-link and mark the card Settled when resolved.
9. **Keyboard**: Esc closes (exists), add `mod+shift+m` engine picker, `mod+.` toggle voice, `↑` recalls last prompt (composer recall), `/` command menu inline above the composer with `name + description` rows (same strip as T3's `/model`).
10. **Theme discipline**: move every inline color in `Seducia.jsx` (L337-578) to tokens: surface `var(--surface-1)`, border `var(--border-1)`, control bg `var(--mac-fill)`, accent washes via `--accent-a10/a16/a35`. With `themes/*` in play (Pinkther, Sophisticated Purple...), today Seducia stays navy-grey in every theme.
11. **Empty cards**: the 6 quick cards (`sz-card`) read as a launcher; keep 3 (Build team, Status, Gather thoughts) plus "More" disclosure (AnimatedHeight), and show the keyboard hint on each ("1", "2", "3") so Seducia is keyboard-first like the T3 palette.
12. **Voice affordances stay Sush's edge**: keep orb; add the T3 "queue vs steer" idea: speaking while Seducia is working should *steer* (interrupt and append) by default with a visible "Steering" chip; `Cmd+Enter` flips to queue.

---

### Appendix: T3 run notes
Server: `npx t3@latest serve` on 127.0.0.1:7799, paired via `t3 pair`, driven with Playwright; Codex was unauthenticated, Claude was authenticated so real threads ran (Haiku 4.5). Server killed at the end (`pkill -f "t3@latest serve"`). The run folder `scratchpad/t3/run` was `git init`'d to light up the diff panel (nothing under /home/user/Sush was touched).
