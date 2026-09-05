import { useCallback, useEffect, useState } from 'react'

import type { ConfigurationLibrary } from '@shared/config-library'

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
    void window.pitrig
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

  useEffect(() => {
    refresh()
  }, [refresh])

  return { library, error, loading, refresh }
}
