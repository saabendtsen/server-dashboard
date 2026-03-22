export function SchedulerHealthBadge({ health }: { health: string }) {
  const config: Record<string, { color: string; label: string }> = {
    healthy: { color: 'bg-success', label: 'Healthy' },
    unhealthy: { color: 'bg-danger', label: 'Unhealthy' },
    warning: { color: 'bg-yellow-500', label: 'Warning' },
    unknown: { color: 'bg-gray-400', label: 'Unknown' },
  }
  const { color, label } = config[health] || config.unknown

  return (
    <div data-testid="scheduler-health-badge" data-health={health} className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${color}`} />
      <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
    </div>
  )
}
