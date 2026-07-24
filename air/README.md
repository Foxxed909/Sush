# Sush Air

**A terminal, and nothing else.**

Air is its own application. Its own `package.json`, its own dependencies, its
own build, its own settings directory, its own installer. It is not a mode of
[Sush](../README.md), not a window inside it, and not a stripped build of it.
You can install Air without ever installing Sush, and uninstalling Sush does not
touch it.

That separation is the product. Air's whole claim is what it does not carry —
no identity system, no licence gate, no agent orchestration, no account
rotation, no metrics polling, no browser panel, no network code at all — and a
claim like that is only worth something if you can verify it. When Air was a
second window of Sush, everything it refused to carry was still one import away.
Now it is not in the binary.

Air's preload bridges **18 methods**, every one namespaced `air:`. Sush's
bridges about 120. There is no licence module in Air to expose.

## What it has

Twelve PTY sessions (capped in the main process, not just in the tab strip),
tabs that rename themselves from the shell's working directory via OSC 7, a
`Ctrl+K` palette, split view, find-in-output, four calm themes, notes, zen mode,
and a `:` command layer.

The rule for that layer is the whole design: **a line starting with `:` is
Air's, everything else is your shell's.** No guessing, no "did you mean" on your
shell's commands, no intercepting something that merely looks like one of ours.
Type `theme` and you get your shell's; type `:theme` and you get Air's.

```
:help          :new [path]     :split        :font 15 | + | -
:clear         :close          :find text    :zen
:note text     :rename name    :go 2         :export
:notes         :theme harbor   :cwd          :agent claude
:import        :forget
```

`:note` is the one thing Air has that Sush doesn't — you notice something
mid-run and the alternative is a scratch file you never open again. Notes stay
in `localStorage`; Air has no network code to send them anywhere.

## Import from Sush

Two separate applications, but one person. If you already have Sush, you have
already told it where you work and what you call things, and making you say it
twice is just rudeness with a justification.

So Air offers, **once**, on the first launch that finds a `~/.sushrc` — and
`:import` is there whenever you want it after that.

Everything found arrives **on**. You turn off what you do not want in Air, or
take the defaults. It is subtractive on purpose: looking at a list of things you
already have and removing a few is a smaller decision than a page of empty boxes
asking you to re-justify every preference you ever set.

Three kinds of entry arrive **off**, with the reason next to them:

| Arrives off | Why |
|---|---|
| An env var whose name looks like a credential | Carrying a token into a second application should be a decision, not a default. Its value is never rendered, either. |
| A startup command that could destroy something | A startup list is a convenience in Sush, where you chose it. Replaying one unattended in a different app is a surprise. |
| A start folder that no longer exists | Otherwise every new session silently opens somewhere else. |

What Air reads is **one file**, `~/.sushrc`, by allowlist — so a new secret file
appearing in Sush's settings directory is not-readable by default rather than
readable-until-someone-remembers. Air never reads Sush's licence, user
identities, connected accounts, OAuth tokens, saved secrets or scrollback. Not
"filters them out afterwards": never opens the directory they live in.

And the import is a **copy, not a link**. It is written into Air's own settings
and never re-read. Uninstall Sush tomorrow and Air is unchanged. `:forget` drops
all of it.

Imported aliases become **real shell aliases** — `alias gs='git status'` on
POSIX, `function global:gs { git status }` in PowerShell — written into each
session as it opens. Air does not parse your command line, so an alias has to be
the shell's or it would be a lie. `type gs` will tell you the truth.

## Getting started

```bash
npm install
npm run dev        # electron-vite dev
npm test           # vitest — the pure command, theme and import layers
npm run build      # electron-vite build → out/
npm run verify     # boot the built app headless and drive it (needs xvfb on Linux)
npm run package    # electron-builder → dist/ (NSIS / dmg / AppImage)
```

Requires Node 22.12+.

`npm run verify` is the harness that matters. It boots the *built* app, types
into the real input element, and asserts on the real DOM — including that
`window.sush` is `undefined` and that a suspected credential is neither ticked
nor printed. Four defects in Air's first version were findable only that way,
all of them React state handling that reads correctly and behaves otherwise.

## Design

Hand-written CSS, no framework, no utility layer. Every colour comes from an
`--air-*` custom property set from the active theme, which is why the light
theme works without a single override. The stylesheet is one file and you can
read it top to bottom.

## What would end Air

A second dependency it does not need. A feature that only makes sense with an
identity behind it. An import that becomes a live link. Air's value is entirely
in what it refuses to carry.

## License

Proprietary — all rights reserved.
