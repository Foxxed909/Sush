import { describe, expect, it } from 'vitest'
import { githubCliLoginSpec } from '../src/main/oauth/github-cli-auth.js'
import { GITHUB_DEVICE_SCOPES } from '../src/main/oauth/github-scopes.js'

describe('GitHub CLI OAuth handoff', () => {
  it('sends the token through stdin, never as a gh argument', () => {
    const spec = githubCliLoginSpec('gho_test_token', 'C:/sush/identity/.gh')

    expect(spec).toMatchObject({ ok: true, env: { GH_CONFIG_DIR: 'C:/sush/identity/.gh' } })
    expect(spec.args).toEqual(['auth', 'login', '--hostname', 'github.com', '--with-token', '--git-protocol', 'https'])
    expect(spec.args.join(' ')).not.toContain('gho_test_token')
    expect(spec.input).toBe('gho_test_token\n')
  })

  it('refuses an empty token or identity config directory', () => {
    expect(githubCliLoginSpec('', 'C:/sush/.gh')).toMatchObject({ ok: false })
    expect(githubCliLoginSpec('token', '')).toMatchObject({ ok: false })
  })

  it('requests all scopes GitHub CLI requires for with-token authentication', () => {
    expect(GITHUB_DEVICE_SCOPES.split(' ')).toEqual(expect.arrayContaining(['repo', 'read:org', 'gist']))
  })
})
