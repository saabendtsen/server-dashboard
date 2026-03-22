import type { HealthcheckResult } from '../../types'

export function HealthIndicator({ healthcheck }: { healthcheck: HealthcheckResult | null }) {
  if (!healthcheck) {
    return (
      <div data-testid="health-indicator" data-health="none" className="flex items-center gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
        <span className="text-xs text-gray-500 dark:text-gray-400">No check</span>
      </div>
    )
  }

  if (healthcheck.error || !healthcheck.status_code || healthcheck.status_code >= 400) {
    return (
      <div data-testid="health-indicator" data-health="unhealthy" className="flex items-center gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-danger" />
        <span className="text-xs text-red-600 dark:text-red-400">
          {healthcheck.error ? healthcheck.error : healthcheck.status_code}
        </span>
      </div>
    )
  }

  return (
    <div data-testid="health-indicator" data-health="healthy" className="flex items-center gap-1.5">
      <div className="w-2.5 h-2.5 rounded-full bg-success" />
      <span className="text-xs text-green-600 dark:text-green-400">{healthcheck.latency_ms}ms</span>
    </div>
  )
}
