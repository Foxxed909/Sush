import { useEffect, useState } from 'react'

export function useOnline() {
  const read = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)
  const [online, setOnline] = useState(read)

  useEffect(() => {
    const sync = () => setOnline(read())
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  return online
}
