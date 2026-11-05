// The model catalog, shared by the desktop app (nightlyModels.js) and Sush
// Terminal (term/). Plain data only, as .mjs so Node imports it without a
// package "type".
//
// Refreshed 2026-11-05 from the CLIs themselves where possible:
// - Claude: Anthropic API ids (the owner's lineup, in this order).
// - Codex: ids built into @openai/codex 0.166.0. gpt-6.1-sol is the default
//   since 0.161; gpt-5.3-codex is deprecated for ChatGPT sign-in, so it's gone.
// - Gemini: ids/aliases built into @google/gemini-cli 0.67.0, plus
//   gemini-4-argon, which Google's API lists but this CLI doesn't yet.
// - OpenCode: Zen's free tier (`opencode models`) plus common connected ids.
// Any other id can still be typed into the picker.
export const MODEL_OPTIONS = {
  claude: [
    { value: '', label: 'Default', note: 'Whatever your Claude plan picks' },
    { value: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Deep reasoning and large refactors', badge: 'New' },
    { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Fast everyday coding', badge: 'New' },
    { value: 'claude-sonnet-5', label: 'Claude Sonnet 5', note: 'Previous Sonnet' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', note: 'Sonnet 4 family' },
    { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Quickest and cheapest', badge: 'Fast' },
    { value: 'claude-fable-5-1', label: 'Claude Fable 5.1', note: 'Most capable · long, hard work', badge: 'New' },
    { value: 'claude-fable-5', label: 'Claude Fable 5', note: 'Previous Fable' },
    { value: 'claude-opus-4-8', label: 'Claude Opus 4.8', note: 'Opus 4 family' },
    { value: 'claude-opus-4-7', label: 'Claude Opus 4.7', note: 'Opus 4 family' },
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6', note: 'Opus 4 family' },
    { value: 'claude-opus-4-5', label: 'Claude Opus 4.5', note: 'Opus 4 family' },
    { value: 'opus', label: 'Opus (latest)', note: 'Alias, follows the newest Opus' },
    { value: 'sonnet', label: 'Sonnet (latest)', note: 'Alias, follows the newest Sonnet' },
    { value: 'haiku', label: 'Haiku (latest)', note: 'Alias, follows the newest Haiku' }
  ],
  codex: [
    { value: '', label: 'Default', note: 'Codex picks (GPT-6.1 Sol on CLI 0.161+)' },
    { value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', note: 'Best overall for coding', badge: 'New' },
    { value: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', note: 'Balanced speed and depth · CLI 0.159+', badge: 'New' },
    { value: 'gpt-6-astra', label: 'GPT-6 Astra', note: 'The hardest problems, slowest' },
    { value: 'gpt-6-sol', label: 'GPT-6 Sol', note: 'Previous Sol' },
    { value: 'gpt-6-luna', label: 'GPT-6 Luna', note: 'Focused, high-volume tasks', badge: 'Fast' },
    { value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', note: 'GPT-5.6 family' },
    { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', note: 'GPT-5.6 family' },
    { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', note: 'GPT-5.6 family' }
  ],
  gemini: [
    { value: '', label: 'Default (Auto)', note: 'Gemini routes per request' },
    { value: 'auto-gemini-3', label: 'Auto · Gemini 3', note: 'Routes within the Gemini 3 family' },
    { value: 'gemini-4-argon', label: 'Gemini 4 Argon', note: 'Newest API model · newer than this CLI\'s list', badge: 'New' },
    { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'Fast and capable', badge: 'Fast' },
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)', note: 'Strongest reasoning in the CLI' },
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (preview)', note: 'Gemini 3 Pro' },
    { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', note: 'Previous Flash' },
    { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', note: 'Lightest and cheapest' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)', note: 'Gemini 3 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Gemini 2.5 family' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Gemini 2.5 family' },
    { value: 'pro', label: 'Pro (alias)', note: 'Follows the CLI\'s Pro default' },
    { value: 'flash', label: 'Flash (alias)', note: 'Follows the CLI\'s Flash default' },
    { value: 'flash-lite', label: 'Flash Lite (alias)', note: 'Follows the CLI\'s Flash Lite default' }
  ],
  opencode: [
    { value: '', label: 'Default / last used', note: 'Whatever OpenCode used last' },
    { value: 'opencode/big-pickle', label: 'Big Pickle', note: 'OpenCode Zen', badge: 'Free' },
    { value: 'opencode/deepseek-v4.1-flash-free', label: 'DeepSeek V4.1 Flash', note: 'OpenCode Zen', badge: 'Free' },
    { value: 'opencode/glm-5.3-flash-free', label: 'GLM 5.3 Flash', note: 'OpenCode Zen', badge: 'Free' },
    { value: 'opencode/mimo-v2.6-flash-free', label: 'MiMo V2.6 Flash', note: 'OpenCode Zen', badge: 'Free' },
    { value: 'opencode/nemotron-3-ultra-free', label: 'Nemotron 3 Ultra', note: 'OpenCode Zen', badge: 'Free' },
    { value: 'opencode/nemotron-3.5-super-vl-free', label: 'Nemotron 3.5 Super VL', note: 'OpenCode Zen · vision', badge: 'Free' },
    { value: 'opencode/nemotron-3.5-lightning-free', label: 'Nemotron 3.5 Lightning', note: 'OpenCode Zen', badge: 'Free' },
    { value: 'opencode/beam-free', label: 'Beam', note: 'OpenCode Zen', badge: 'Free' },
    { value: 'opencode/flint-40b-free', label: 'Flint 40B', note: 'OpenCode Zen', badge: 'Free' },
    { value: 'anthropic/claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Needs Anthropic connected in OpenCode' },
    { value: 'anthropic/claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Needs Anthropic connected in OpenCode' },
    { value: 'github-copilot/claude-sonnet-5.5', label: 'Claude Sonnet 5.5 · Copilot', note: 'Needs GitHub Copilot connected in OpenCode' },
    { value: 'github-copilot/gpt-6.1-sol', label: 'GPT-6.1 Sol · Copilot', note: 'Needs GitHub Copilot connected in OpenCode' },
    { value: 'github-copilot/gemini-3.8-flash', label: 'Gemini 3.8 Flash · Copilot', note: 'Needs GitHub Copilot connected in OpenCode' },
    { value: 'github-copilot/grok-4.7', label: 'Grok 4.7 · Copilot', note: 'Needs GitHub Copilot connected in OpenCode' },
    { value: 'github-copilot/kimi-k3', label: 'Kimi K3 · Copilot', note: 'Needs GitHub Copilot connected in OpenCode' }
  ]
}
