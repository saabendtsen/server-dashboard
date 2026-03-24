import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SchedulerTab } from './SchedulerTab'
import type { SchedulerData } from '../../types'

const fixture: SchedulerData = {
  health: 'healthy',
  runs: [
    {
      id: 1,
      repo: 'saabendtsen/my-app',
      issue_number: 42,
      session_type: 'implement',
      started_at: '2026-03-20T10:00:00Z',
      ended_at: '2026-03-20T10:30:00Z',
      outcome: 'completed',
      pr_number: 15,
      notes: null,
      validation_reason: 'PR #15 open, checks passed',
      events: [],
    },
  ],
}

describe('SchedulerTab', () => {
  it('renders health badge', () => {
    render(<SchedulerTab scheduler={fixture} />)
    expect(screen.getByTestId('scheduler-health-badge')).toHaveAttribute('data-health', 'healthy')
  })

  it('renders runs', () => {
    render(<SchedulerTab scheduler={fixture} />)
    expect(screen.getByTestId('scheduler-run')).toBeInTheDocument()
  })

  it('renders repo short name', () => {
    render(<SchedulerTab scheduler={fixture} />)
    expect(screen.getByText('my-app')).toBeInTheDocument()
  })

  it('renders empty state', () => {
    render(<SchedulerTab scheduler={{ health: 'unknown', runs: [] }} />)
    expect(screen.getByText('No runs recorded')).toBeInTheDocument()
  })

  it('renders issue and PR links', () => {
    render(<SchedulerTab scheduler={fixture} />)
    expect(screen.getByText('#42')).toBeInTheDocument()
    expect(screen.getByText('#15')).toBeInTheDocument()
  })

  it('renders validation reason when present', () => {
    render(<SchedulerTab scheduler={fixture} />)
    expect(screen.getByText('PR #15 open, checks passed')).toBeInTheDocument()
  })

  it('does not render validation reason when null', () => {
    const noReason = {
      ...fixture,
      runs: [{ ...fixture.runs[0], validation_reason: null }],
    }
    render(<SchedulerTab scheduler={noReason} />)
    expect(screen.queryByTestId('validation-reason')).not.toBeInTheDocument()
  })
})
