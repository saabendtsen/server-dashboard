import type { ServiceData } from '../../types'
import { formatContainerUptime } from '../../utils/formatters'
import { StatusBadge } from '../shared/StatusBadge'
import { HealthIndicator } from '../shared/HealthIndicator'

export function ServicesTab({ services }: { services: ServiceData[] }) {
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
