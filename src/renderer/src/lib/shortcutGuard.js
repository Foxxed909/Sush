export function canHandleGlobalShortcut(identityReady, blockingSurface) {
  return identityReady === true && blockingSurface !== true
}
