// The in-app changelog. One ordered list, newest first. Each entry is a
// version with a date and grouped changes; the ChangelogPage renders it and
// App uses the top version's `v` to show a "what's new" dot after an update.
//
// Keep this in the shush motif for codenames (ember → murmur → …) and write
// changes in the user's language, not commit-speak — this is release notes,
// not a git log.

export const CHANGELOG = [
  {
    v: '4.9.0',
    codename: 'undertow',
    date: '2026-07-09',
    summary: 'Reusable crews, isolated worktree swarms, a theme you make yourself — and a bug sweep.',
    changes: {
      new: [
        'Saved crews: save an agent mix (with its directory and brief) from the launcher and relaunch the whole workspace in one click — or straight from the command palette (Ctrl+P).',
        'Worktree swarms: tick “isolate each session in its own git worktree” and every agent gets a private checkout on its own sush/… branch, so parallel agents never trample each other’s files.',
        'Custom theme: build your own from a base preset, an accent colour and a terminal background in Settings ▸ Appearance — it shows up in the switcher, palette and title-bar picker like any preset.',
        'Project-level .sushrc: drop a .sushrc in a repo and its aliases, env and startup commands layer over your home profile for sessions opened there.'
      ],
      improved: [
        '`hunt` now searches the saved output of sessions you’ve already closed, not just the live ones.'
      ],
      fixed: [
        'Smart-bar output no longer shows an empty box for non-JSON results (help, sysinfo, and friends).',
        'Ctrl+F opens find-in-terminal without also leaking ^F into the shell; Ctrl+L / Ctrl+R stay with the shell when a terminal is focused.',
        'Zoom shortcuts (Cmd +/–/0) work on macOS.',
        'Fixed a shell-quoting hole in tool-path resolution on macOS/Linux.',
        'The grid’s “showing X of N” note no longer appears in split view, and `plan` no longer calls Pro the top tier.'
      ]
    }
  },
  {
    v: '4.8.0',
    codename: 'lull',
    date: '2026-07-09',
    summary: 'Small, deliberate polish so Sush feels native and calm — especially on Windows.',
    changes: {
      new: [
        'Window material (Windows 11): let the desktop tint show behind Sush like macOS vibrancy — pick Mica or Acrylic in Settings ▸ Appearance.',
        'Window controls can move to the left, macOS-style, or stay on the right where Windows expects them.'
      ],
      improved: [
        'Crisper text everywhere (grayscale font smoothing) so Sush reads like a native Mac app on Windows too.',
        'Buttons and window controls have a subtle press spring; scroll areas no longer chain-scroll the whole app.'
      ],
      fixed: []
    }
  },
  {
    v: '4.7.0',
    codename: 'murmur',
    date: '2026-07-09',
    summary: 'A calmer sidebar, offline dictation, and a Settings you can actually find things in.',
    changes: {
      new: [
        'Offline dictation: point Hush at a local whisper.cpp binary + model and transcribe with no key, no network, and no Quiet Credits spent.',
        'Command palette now holds your saved Snippets and recent History — run either straight from Ctrl+P.',
        'This changelog. Press Ctrl+P → “What’s New”, or open it from Settings ▸ Plan.',
        'Connect provider accounts (Claude / ChatGPT / Google over OAuth) graduated from Experiments to a Plus feature.'
      ],
      improved: [
        'The right sidebar’s tools are grouped — AI · Project · Web · Ops — with a hairline between clusters instead of one long scroll. Hide the tabs you don’t use in Settings ▸ Terminal.',
        'Settings was rebuilt: nine sections in a stable order, a Power ladder (Full → Reduced → Saver → Eco) in place of scattered battery toggles, and search that matches individual rows, not just section names.',
        'Snippets are one store now — the panel and the `snippet` command finally share the same list.',
        'The lock screen’s PIN entry got real feedback: each digit lands, a wrong PIN shakes in red, and unlocking eases out instead of hard-cutting.',
        'The plan ladder is honest again: Ultra and Max can actually reach the 20 / 25 grid sessions they advertise.'
      ],
      fixed: [
        'The Usage Guard stops re-notifying every 45 seconds after you dismiss it.',
        'Quiet hours no longer forces the app to sleep while you’re actively typing.',
        'Toggling wallpaper-through-terminals (or Eco mode) no longer wipes your terminal scrollback.',
        'Built-in commands like `fetch` and `ping` can be cancelled again.',
        'On macOS, reopening the window from the dock no longer silently drops output from running sessions.'
      ]
    }
  },
  {
    v: '4.6.0',
    codename: 'ember',
    date: '2026-07-05',
    summary: 'Voice that works, honest metering, and never getting stranded by a limit.',
    changes: {
      new: [
        'Dictation (Hush) and talking to Seducia run on Whisper with your own OpenAI key — the key never leaves the main process.',
        'Quiet Credits: a transparent, local monthly dictation allowance, denominated in real audio-seconds.',
        'Usage Guard (Pro+): stop Claude before the limit stops you — warn, auto-handoff, or block at a threshold you choose.',
        'Limit handoff: when an agent hits its cap mid-task, Sush summarizes the session and relaunches it on your next model.',
        'Split view (Ctrl+\\), cross-session search (`hunt`), and Markdown transcript export.'
      ],
      improved: [
        'An Apple-style pricing page with the five-tier ladder.',
        'Smoother animations and a reduce-motion toggle.',
        'New toolkit commands: case, slug, lorem, regex, pick, dns, headers, title, jwt, color, base.'
      ],
      fixed: [
        'Numbered lists that start at 3 now render correctly in the markdown renderer.',
        'Closing a large swarm no longer briefly freezes the whole app on Windows.'
      ]
    }
  }
]

// The version the app currently reports (mirrors package.json — kept here so
// the renderer can compare without an IPC round-trip on every mount).
export const LATEST_VERSION = CHANGELOG[0].v
