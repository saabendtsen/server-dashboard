import type { RunEvent } from '../../types'
import { formatTimestamp } from '../../utils/formatters'

function formatEventDetail(event: RunEvent): string {
  const { event_type, detail } = event
  let parsed: Record<string, unknown> = {}
  if (detail) {
    try {
      parsed = JSON.parse(detail)
    } catch {
      return `${event_type}: ${detail}`
    }
  }

  switch (event_type) {
    case 'session_started':
      return 'Session started'
    case 'session_completed':
      return `Session completed${parsed.outcome ? `: ${parsed.outcome}` : ''}`
    case 'label_added':
      return `Label added: ${parsed.label ?? '?'}`
    case 'label_removed':
      return `Label removed: ${parsed.label ?? '?'}`
    case 'pr_found':
      return `PR found: #${parsed.pr_number ?? '?'}`
    case 'validation_checked':
      return parsed.passed ? 'Validation passed' : 'Validation failed'
    case 'recheck_resolved':
      return `Recheck resolved: ${parsed.resolution ?? '?'}`
    default:
      return detail ? `${event_type}: ${detail}` : event_type
  }
}

const EVENT_COLORS: Record<string, string> = {
  session_started: 'bg-blue-400',
  session_completed: 'bg-green-400',
  label_added: 'bg-purple-400',
  label_removed: 'bg-gray-400',
  pr_found: 'bg-blue-400',
  validation_checked: 'bg-yellow-400',
  recheck_resolved: 'bg-green-400',
}

export function RunEventTimeline({ events }: { events: RunEvent[] }) {
  if (events.length === 0) return null

  return (
    <div className="relative ml-2 border-l-2 border-gray-200 dark:border-gray-600 pl-4 space-y-3 mt-3">
      {events.map((event) => (
        <div key={event.id} data-testid="timeline-event" className="relative">
          <div className={`absolute -left-[1.35rem] top-1 w-2.5 h-2.5 rounded-full ${EVENT_COLORS[event.event_type] || 'bg-gray-400'}`} />
          <p className="text-xs text-gray-900 dark:text-gray-100">{formatEventDetail(event)}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{formatTimestamp(event.timestamp)}</p>
        </div>
      ))}
    </div>
  )
}
