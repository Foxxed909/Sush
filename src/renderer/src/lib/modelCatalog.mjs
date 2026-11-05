// The model catalog, shared by the desktop app (nightlyModels.js) and Sush
// Terminal (term/). Plain data only, as .mjs so Node imports it without a
// package "type". Refreshed Nov 2026.
export const MODEL_OPTIONS = {
  claude: [
    { value: '', label: 'Default', note: 'Whatever your Claude plan picks' },
    { value: 'claude-fable-5-1', label: 'Fable 5.1', note: 'Most capable · long, hard work', badge: 'New' },
    { value: 'claude-opus-5-5', label: 'Opus 5.5', note: 'Deep reasoning and large refactors', badge: 'New' },
    { value: 'claude-sonnet-5-5', label: 'Sonnet 5.5', note: 'Fast everyday coding', badge: 'New' },
    { value: 'claude-haiku-5-5', label: 'Haiku 5.5', note: 'Quickest and cheapest', badge: 'Fast' },
    { value: 'opus', label: 'Opus (latest)', note: 'Alias, follows the newest Opus' },
    { value: 'sonnet', label: 'Sonnet (latest)', note: 'Alias, follows the newest Sonnet' },
    { value: 'haiku', label: 'Haiku (latest)', note: 'Alias, follows the newest Haiku' }
  ],
  codex: [
    { value: '', label: 'Default', note: 'Codex picks from your ChatGPT plan' },
    { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', note: 'Agentic coding model' }
  ],
  gemini: [
    { value: '', label: 'Default (Auto)', note: 'Gemini routes per request' },
    { value: 'auto', label: 'Auto', note: 'Routes between Pro and Flash' },
    { value: 'pro', label: 'Pro', note: 'Strongest reasoning' },
    { value: 'flash', label: 'Flash', note: 'Fast and capable', badge: 'Fast' },
    { value: 'flash-lite', label: 'Flash Lite', note: 'Lightest and cheapest' }
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
    { value: 'anthropic/claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Needs Anthropic connected in OpenCode' },
    { value: 'github-copilot/claude-sonnet-5-5', label: 'Sonnet 5.5 via Copilot', note: 'Needs GitHub Copilot connected in OpenCode' }
  ]
}
