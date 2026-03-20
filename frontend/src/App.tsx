import { useState, useEffect } from 'react'
import { FeedbackButton } from './components/FeedbackButton'

type TabId = 'overview' | 'scheduler' | 'github' | 'services'

interface SystemData {
  disks: Array<{
    mount: string
    total_bytes: number
    used_bytes: number
    percent: number
  }>
  cpu_percent: number
  temperature: number | null
  load_average: number[]
  memory: {
    total_bytes: number
    used_bytes: number
    percent: number
  }
  uptime_seconds: number
}

interface HealthcheckResult {
  status_code: number | null
  latency_ms: number | null
  error: string | null
}

interface ServiceData {
  name: string
  status: string
  image: string
  started_at: string
  healthcheck: HealthcheckResult | null
}

interface SchedulerRun {
  id: number
  repo: string
  issue_number: number
  session_type: string
  started_at: string
  ended_at: string
  outcome: string
  pr_number: number | null
  notes: string | null
}

interface SchedulerData {
  health: string
  runs: SchedulerRun[]
}

interface GitHubRun {
  repo: string
  workflow_name: string
  status: string
  conclusion: string
  created_at: string
}

interface StatusResponse {
  system: SystemData
  services: ServiceData[]
  scheduler: SchedulerData
  github_actions: GitHubRun[]
  last_updated: string
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Server Overview' },
  { id: 'scheduler', label: 'AI Scheduler' },
  { id: 'github', label: 'GitHub Actions' },
  { id: 'services', label: 'Services' },
]

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3)
  return `${gb.toFixed(1)} GB`
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return `${days}d ${hours}h`
}

function DiskGauge({ mount, percent, used_bytes, total_bytes }: {
  mount: string; percent: number; used_bytes: number; total_bytes: number
}) {
  const color = percent > 90 ? 'text-danger' : percent > 75 ? 'text-yellow-500' : 'text-success'
  return (
    <div data-testid={`disk-${mount === '/' ? 'root' : mount.slice(1)}`} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-900 dark:text-white">{mount}</span>
        <span className={`text-sm font-bold ${color}`}>{percent.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full ${percent > 90 ? 'bg-danger' : percent > 75 ? 'bg-yellow-500' : 'bg-success'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        {formatBytes(used_bytes)} / {formatBytes(total_bytes)}
      </div>
    </div>
  )
}

function ServerOverview({ data }: { data: SystemData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.disks.map((disk) => (
          <DiskGauge key={disk.mount} mount={disk.mount} percent={disk.percent} used_bytes={disk.used_bytes} total_bytes={disk.total_bytes} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">CPU</div>
          <div className="text-lg font-bold text-gray-900 dark:text-white" data-testid="cpu-value">{data.cpu_percent}%</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Temperature</div>
          <div className="text-lg font-bold text-gray-900 dark:text-white" data-testid="temp-value">
            {data.temperature !== null ? `${data.temperature}°C` : 'N/A'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Load Average</div>
          <div className="text-sm font-bold text-gray-900 dark:text-white" data-testid="load-value">
            {data.load_average.map(v => v.toFixed(2)).join(' / ')}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Uptime</div>
          <div className="text-lg font-bold text-gray-900 dark:text-white" data-testid="uptime-value">{formatUptime(data.uptime_seconds)}</div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Memory</span>
          <span className="text-sm font-bold text-gray-900 dark:text-white" data-testid="memory-value">{data.memory.percent.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
          <div
            className="h-2.5 rounded-full bg-primary"
            style={{ width: `${data.memory.percent}%` }}
          />
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {formatBytes(data.memory.used_bytes)} / {formatBytes(data.memory.total_bytes)}
        </div>
      </div>
    </div>
  )
}

function formatContainerUptime(startedAt: string): string {
  const started = new Date(startedAt)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - started.getTime()) / 1000)
  return formatUptime(seconds)
}

function HealthIndicator({ healthcheck }: { healthcheck: HealthcheckResult | null }) {
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

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    running: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    exited: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    restarting: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  }
  const color = colorMap[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {status}
    </span>
  )
}

function ServicesTab({ services }: { services: ServiceData[] }) {
  if (services.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center shadow-sm border border-gray-100 dark:border-gray-700">
        <p className="text-gray-500 dark:text-gray-400">No containers found</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {services.map((service) => (
        <div
          key={service.name}
          data-testid={`service-${service.name}`}
          className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700"
        >
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{service.name}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{service.image}</p>
            </div>
            <StatusBadge status={service.status} />
          </div>
          <div className="flex justify-between items-center mt-3">
            <HealthIndicator healthcheck={service.healthcheck} />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatContainerUptime(service.started_at)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const colorMap: Record<string, string> = {
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    clarification: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    timeout: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  }
  const color = colorMap[outcome] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {outcome}
    </span>
  )
}

function SchedulerHealthBadge({ health }: { health: string }) {
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

function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleString('da-DK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function repoShortName(repo: string): string {
  const parts = repo.split('/')
  return parts.length > 1 ? parts[1] : repo
}

function SchedulerTab({ scheduler }: { scheduler: SchedulerData }) {
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <SchedulerHealthBadge health={scheduler.health} />
      </div>

      {scheduler.runs.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400">No runs recorded</p>
        </div>
      ) : (
        <div className="space-y-2">
          {scheduler.runs.map((run) => (
            <div
              key={run.id}
              data-testid="scheduler-run"
              className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{repoShortName(run.repo)}</span>
                  <a
                    href={`https://github.com/${run.repo}/issues/${run.issue_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    #{run.issue_number}
                  </a>
                  {run.pr_number && (
                    <a
                      href={`https://github.com/${run.repo}/pull/${run.pr_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      #{run.pr_number}
                    </a>
                  )}
                </div>
                <OutcomeBadge outcome={run.outcome} />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">{run.session_type}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatTimestamp(run.started_at)}
                  {run.ended_at && ` - ${formatTimestamp(run.ended_at)}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatRelativeTime(isoString: string): string {
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

function getStatusColor(run: GitHubRun): { dot: string; text: string; conclusion: string; status: string } {
  if (run.conclusion === 'success') return { dot: 'bg-success', text: 'text-green-600 dark:text-green-400', conclusion: 'success', status: run.status }
  if (run.conclusion === 'failure') return { dot: 'bg-danger', text: 'text-red-600 dark:text-red-400', conclusion: 'failure', status: run.status }
  if (run.status === 'in_progress') return { dot: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400', conclusion: run.conclusion, status: 'in_progress' }
  return { dot: 'bg-gray-400', text: 'text-gray-500 dark:text-gray-400', conclusion: run.conclusion, status: run.status }
}

function GitHubActionsTab({ runs }: { runs: GitHubRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center shadow-sm border border-gray-100 dark:border-gray-700">
        <p className="text-gray-500 dark:text-gray-400">No workflow runs found</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {runs.map((run, i) => {
        const color = getStatusColor(run)
        const repoShort = run.repo.includes('/') ? run.repo.split('/')[1] : run.repo
        const label = run.conclusion || run.status
        return (
          <div
            key={`${run.repo}-${run.created_at}-${i}`}
            data-testid="github-run"
            className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  {repoShort}
                </span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{run.workflow_name}</span>
              </div>
              <div
                data-testid="github-status"
                data-conclusion={color.conclusion}
                data-status={color.status}
                className="flex items-center gap-1.5"
              >
                <div className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
                <span className={`text-xs font-medium ${color.text}`}>{label}</span>
              </div>
            </div>
            <div className="flex justify-end">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatRelativeTime(run.created_at)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [data, setData] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetch('/server-dashboard/api/status')
      .then(res => res.json())
      .then(setData)
      .catch(err => setError(err.message))
  }, [])

  const handleRefresh = async () => {
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

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Server Dashboard</h1>
          <div className="flex items-center gap-3">
            {data?.last_updated && (
              <span data-testid="last-updated" className="text-xs text-gray-500 dark:text-gray-400">
                {formatRelativeTime(data.last_updated)}
              </span>
            )}
            <button
              data-testid="refresh-button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {refreshing ? (
                <>
                  <svg data-testid="refresh-spinner" className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Refreshing...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  Refresh
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex gap-1 mb-6 overflow-x-auto" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl text-center text-sm mb-4">
            {error}
          </div>
        )}

        {activeTab === 'overview' && data?.system && (
          <ServerOverview data={data.system} />
        )}

        {activeTab === 'services' && data?.services && (
          <ServicesTab services={data.services} />
        )}

        {activeTab === 'scheduler' && data?.scheduler && (
          <SchedulerTab scheduler={data.scheduler} />
        )}

        {activeTab === 'github' && data?.github_actions && (
          <GitHubActionsTab runs={data.github_actions} />
        )}
      </div>
      <FeedbackButton
        repo="saabendtsen/server-dashboard"
        apiUrl="https://wibholmsolutions.com/api/feedback"
      />
    </div>
  )
}
