export function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3)
  return `${gb.toFixed(1)} GB`
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return `${days}d ${hours}h`
}

export function formatContainerUptime(startedAt: string): string {
  const started = new Date(startedAt)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - started.getTime()) / 1000)
  return formatUptime(seconds)
}

export function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleString('da-DK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatRelativeTime(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

export function repoShortName(repo: string): string {
  const parts = repo.split('/')
  return parts.length > 1 ? parts[1] : repo
}
