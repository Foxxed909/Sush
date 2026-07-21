// Sush needs its existing app scopes plus GitHub CLI's documented minimum
// token scopes. Keep this shared and tested so future OAuth changes cannot
// silently reconnect the app while leaving `gh` unusable.
export const GITHUB_DEVICE_SCOPES = 'repo read:user notifications read:org gist'
