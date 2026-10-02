import { useCallback, useState } from 'react'
import { usePolling } from './usePolling'

// Branch + dirty state for one working tree, focus-gated. The branch changes
// from inside terminals (`git switch`), which no React state sees.
export function useGitBranch(cwd, intervalMs = 8000) {
  const [branch, setBranch] = useState(null)
  const read = useCallback(() => {
    if (!cwd) { setBranch(null); return }
    window.sush?.gitStatus?.({ cwd })
      .then(g => setBranch(g?.repo ? { name: g.branch, dirty: (g.files?.length || 0) > 0, changes: g.files?.length || 0 } : null))
      .catch(() => setBranch(null))
  }, [cwd])
  usePolling(read, intervalMs, !!cwd)
  return branch
}
