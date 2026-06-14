# Product

## Register

product

## Users

Developers and power users who run several AI coding-agent CLIs at once — Claude
Code, Codex, Gemini, OpenCode — and want them in one orchestrated home instead of
a dozen raw terminal windows. The primary user (Nifemi) often works on a weak
laptop with intermittent power, so CPU/GPU/battery cost is a first-class concern,
not an afterthought. Their context is high-attention multitasking: launching
agents, watching which one needs them, hopping between sessions and accounts, and
keeping limits/usage in view — calmly, on modest hardware.

## Product Purpose

Sush is "the terminal your agents live in": a single surface to run and
orchestrate AI agent CLIs, with per-identity multi-account logins, workspaces, a
Seducia orchestrator, usage/limit awareness, and aggressive power-saving. Success
is the user trusting Sush to run a small swarm of agents — and know at a glance
who needs attention — without the machine melting or the UI overwhelming them.

## Brand Personality

Calm, premium, alive. Confident but warm — a signature pink and the Seducia voice
give it personality without going loud. It should feel like a focused instrument
you reach for, not a noisy dashboard you tolerate. Dark, glassy, intentional.

## Anti-references

- Generic Electron/Bootstrap admin panels (flat grey, no point of view).
- Neon "gamer/RGB" UIs — glow for its own sake.
- Cluttered IDE chrome where every panel fights for attention.
- The current failure mode to fix: **every element outlined in accent pink, glow
  and shadow everywhere** — busy, not premium.

## Design Principles

1. **Calm under load.** A swarm of busy agents must still read as calm; state is
   legible at a glance, never a wall of competing signals.
2. **Accent earns its place.** Pink marks *state* — active, attention, selection —
   not decoration. Neutral by default, colour where it means something.
3. **Respect the machine.** Every visual choice has a battery/CPU budget.
   Restraint (fewer blurs, fewer animations) is a feature, not a compromise.
4. **One object.** The app moves and reads as a single coherent surface — one
   spacing grid, one type scale, one motion curve — not a bag of widgets.
5. **Honest surfaces.** Show real state (usage, limits, battery, who's signed in)
   plainly. Never fake polish or imply a capability that isn't there.

## Accessibility & Inclusion

- WCAG AA contrast: body text ≥4.5:1, large/bold text ≥3:1. Kill muddy grey-on-
  dark that fails this — bump toward the ink end of the ramp.
- Never rely on colour alone for state: pair the status dot with a label/shape.
- Respect `prefers-reduced-motion` (already wired via lite / power-saver modes).
- Keyboard-navigable throughout; visible focus states.
