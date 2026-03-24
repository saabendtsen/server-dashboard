import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RunEventTimeline } from './RunEventTimeline'
import type { RunEvent } from '../../types'

const events: RunEvent[] = [
  { id: 1, timestamp: '2026-03-20T10:00:00Z', event_type: 'session_started', detail: '{"session_id": "abc"}' },
  { id: 2, timestamp: '2026-03-20T10:05:00Z', event_type: 'label_added', detail: '{"label": "ai-implementing"}' },
  { id: 3, timestamp: '2026-03-20T10:15:00Z', event_type: 'pr_found', detail: '{"pr_number": 44}' },
  { id: 4, timestamp: '2026-03-20T10:20:00Z', event_type: 'validation_checked', detail: '{"passed": true, "reason": "checks ok"}' },
  { id: 5, timestamp: '2026-03-20T10:30:00Z', event_type: 'session_completed', detail: '{"outcome": "completed"}' },
]

describe('RunEventTimeline', () => {
  it('renders all events', () => {
    render(<RunEventTimeline events={events} />)
    const items = screen.getAllByTestId('timeline-event')
    expect(items).toHaveLength(5)
  })

  it('renders human-readable event descriptions', () => {
    render(<RunEventTimeline events={events} />)
    expect(screen.getByText('Session started')).toBeInTheDocument()
    expect(screen.getByText(/ai-implementing/)).toBeInTheDocument()
    expect(screen.getByText(/PR.*#44/)).toBeInTheDocument()
    expect(screen.getByText(/Validation passed/)).toBeInTheDocument()
    expect(screen.getByText(/Session completed/)).toBeInTheDocument()
  })

  it('renders empty state', () => {
    const { container } = render(<RunEventTimeline events={[]} />)
    expect(container.querySelector('[data-testid="timeline-event"]')).toBeNull()
  })

  it('handles unknown event types gracefully', () => {
    const unknown: RunEvent[] = [
      { id: 1, timestamp: '2026-03-20T10:00:00Z', event_type: 'new_future_event', detail: '{"key": "val"}' },
    ]
    render(<RunEventTimeline events={unknown} />)
    expect(screen.getByText(/new_future_event/)).toBeInTheDocument()
  })

  it('handles null detail', () => {
    const nullDetail: RunEvent[] = [
      { id: 1, timestamp: '2026-03-20T10:00:00Z', event_type: 'session_started', detail: null },
    ]
    render(<RunEventTimeline events={nullDetail} />)
    expect(screen.getByText('Session started')).toBeInTheDocument()
  })
})
