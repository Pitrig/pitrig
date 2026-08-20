import { useCallback, useEffect, useState } from 'react'

import type { ConfigurationLibrary } from '@shared/config-library'

/**
 * The saved-configuration folder and the recent-files list, read together
 * because they are shown together and because one listing answers both.
 *
 * There is no push channel: nothing changes this except the page that reads it,
 * so it refreshes on mount and after each of its own writes.
 */
export function useConfigurationLibrary(): {
  library?: ConfigurationLibrary
  error?: string
  loading: boolean
  refresh: () => void
} {
  const [library, setLibrary] = useState<ConfigurationLibrary>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    void window.simcore
      .listConfigurations()
      .then((result) => {
        if (result.ok) {
          setLibrary(result.value)
          setError(undefined)
        } else {
          setError(result.error.message)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  // The listing is read once when the page mounts and again after each write it
  // makes. `setLoading` starts true rather than being raised here, so the effect
  // only ever kicks off the request — nothing is set synchronously inside it.
  useEffect(() => {
    refresh()
  }, [refresh])

  return { library, error, loading, refresh }
}
