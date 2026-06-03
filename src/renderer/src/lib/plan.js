// Plan tier definitions and feature-gate helpers.
// planId is stored in localStorage under 'sush-plan'.

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    color: '#8a939c',
    desc: 'Get started',
    features: {
      maxTabs: 2,
      allThemes: false,
      seduciaAI: false,
      voiceMode: false,
      browserPanel: false,
      filesPanel: false,
      memoryNotes: false,
      secrets: false,
      maxAgents: 0,
      tools: false,
      teamWorkspaces: false,
      customBranding: false,
      auditLogs: false,
      prioritySupport: false
    }
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 18,
    color: '#4fc3f7',
    desc: 'Full terminal power',
    features: {
      maxTabs: 10,
      allThemes: true,
      seduciaAI: false,
      voiceMode: false,
      browserPanel: true,
      filesPanel: true,
      memoryNotes: true,
      secrets: false,
      maxAgents: 0,
      tools: false,
      teamWorkspaces: false,
      customBranding: false,
      auditLogs: false,
      prioritySupport: false
    }
  },
  quiet: {
    id: 'quiet',
    name: 'Quiet',
    price: 33,
    color: '#81c784',
    desc: 'AI-assisted flow',
    features: {
      maxTabs: Infinity,
      allThemes: true,
      seduciaAI: true,
      voiceMode: true,
      browserPanel: true,
      filesPanel: true,
      memoryNotes: true,
      secrets: true,
      maxAgents: 3,
      tools: false,
      teamWorkspaces: false,
      customBranding: false,
      auditLogs: false,
      prioritySupport: false
    }
  },
  max: {
    id: 'max',
    name: 'Max',
    price: 180,
    color: '#ffb74d',
    desc: 'Unlimited agents + tools',
    features: {
      maxTabs: Infinity,
      allThemes: true,
      seduciaAI: true,
      voiceMode: true,
      browserPanel: true,
      filesPanel: true,
      memoryNotes: true,
      secrets: true,
      maxAgents: Infinity,
      tools: true,
      teamWorkspaces: false,
      customBranding: false,
      auditLogs: false,
      prioritySupport: true
    }
  },
  queen: {
    id: 'queen',
    name: 'Queen',
    price: 220,
    color: '#ce93d8',
    desc: 'Teams + orchestration',
    features: {
      maxTabs: Infinity,
      allThemes: true,
      seduciaAI: true,
      voiceMode: true,
      browserPanel: true,
      filesPanel: true,
      memoryNotes: true,
      secrets: true,
      maxAgents: Infinity,
      tools: true,
      teamWorkspaces: true,
      customBranding: false,
      auditLogs: false,
      prioritySupport: true
    }
  },
  king: {
    id: 'king',
    name: 'King',
    price: 250,
    color: '#ffd54f',
    desc: 'Enterprise — everything',
    features: {
      maxTabs: Infinity,
      allThemes: true,
      seduciaAI: true,
      voiceMode: true,
      browserPanel: true,
      filesPanel: true,
      memoryNotes: true,
      secrets: true,
      maxAgents: Infinity,
      tools: true,
      teamWorkspaces: true,
      customBranding: true,
      auditLogs: true,
      prioritySupport: true
    }
  }
}

export const PLAN_ORDER = ['free', 'pro', 'quiet', 'max', 'queen', 'king']

export function getPlan(id) {
  return PLANS[id] ?? PLANS.free
}

export function can(id, feature) {
  return !!getPlan(id).features[feature]
}

export function getMaxTabs(id) {
  const v = getPlan(id).features.maxTabs
  return v === Infinity ? Infinity : (v ?? 2)
}

export function getMaxAgents(id) {
  const v = getPlan(id).features.maxAgents
  return v === Infinity ? Infinity : (v ?? 0)
}

export function loadPlan() {
  try { return localStorage.getItem('sush-plan') ?? 'free' } catch { return 'free' }
}

export function savePlan(id) {
  try { localStorage.setItem('sush-plan', id) } catch {}
}

// Feature row definitions for the plans modal display.
export const FEATURE_ROWS = [
  { key: 'maxTabs',        label: 'Terminal tabs',       fmt: v => v === Infinity ? 'Unlimited' : String(v) },
  { key: 'allThemes',      label: 'All themes'           },
  { key: 'browserPanel',   label: 'Browser panel'        },
  { key: 'filesPanel',     label: 'Files + Changes panel'},
  { key: 'memoryNotes',    label: 'Memory notes'         },
  { key: 'secrets',        label: 'Secrets manager'      },
  { key: 'seduciaAI',      label: 'Seducia AI (API key)' },
  { key: 'voiceMode',      label: 'Voice / Jarvis mode'  },
  { key: 'maxAgents',      label: 'Agent sessions',      fmt: v => v === Infinity ? 'Unlimited' : v === 0 ? '—' : `Up to ${v}` },
  { key: 'tools',          label: 'Bundled TOOLS'        },
  { key: 'teamWorkspaces', label: 'Team workspaces'      },
  { key: 'prioritySupport',label: 'Priority support'     },
  { key: 'customBranding', label: 'Custom branding'      },
  { key: 'auditLogs',      label: 'Audit logs'           }
]
