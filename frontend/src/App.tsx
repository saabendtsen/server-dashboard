import { useState, useEffect } from 'react'

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

interface StatusResponse {
  system: SystemData
  services: ServiceData[]
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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [data, setData] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/server-dashboard/api/status')
      .then(res => res.json())
      .then(setData)
      .catch(err => setError(err.message))
  }, [])

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Server Dashboard</h1>

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

        {(activeTab === 'scheduler' || activeTab === 'github') && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-gray-500 dark:text-gray-400">Coming soon</p>
          </div>
        )}
      </div>
    </div>
  )
}
