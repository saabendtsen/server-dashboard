import type { SystemData } from '../../types'
import { formatBytes, formatUptime } from '../../utils/formatters'

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

export function OverviewTab({ data }: { data: SystemData }) {
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
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">1 / 5 / 15 min</div>
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
