import { useState, useEffect } from 'react'
import type { StatusResponse } from '../types'

export function useDashboardData() {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetch('/server-dashboard/api/status')
      .then(res => res.json())
      .then(setData)
      .catch(err => setError(err.message))
  }, [])

  const refresh = async () => {
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/server-dashboard/api/refresh', { method: 'POST' })
      const freshData = await res.json()
      setData(freshData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  return { data, error, refreshing, refresh }
}
