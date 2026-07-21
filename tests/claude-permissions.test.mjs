import { describe, expect, it } from 'vitest'
import { resolvePanelPermissionMode } from '../src/main/claude-permissions.js'

describe('Claude panel permission mode', () => {
  it('uses a valid active-slot default when the panel did not request a mode', () => {
    expect(resolvePanelPermissionMode(undefined, 'bypassPermissions')).toBe('bypassPermissions')
  })

  it('preserves an explicit valid request and rejects unknown modes', () => {
    expect(resolvePanelPermissionMode('plan', 'bypassPermissions')).toBe('plan')
    expect(resolvePanelPermissionMode('not-a-mode', 'not-a-mode')).toBe('acceptEdits')
  })
})
