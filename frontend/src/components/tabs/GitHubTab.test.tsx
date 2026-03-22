import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GitHubTab } from './GitHubTab'
import type { GitHubRun } from '../../types'

const fixture: GitHubRun[] = [
  {
    repo: 'saabendtsen/server-dashboard',
    workflow_name: 'CI',
    status: 'completed',
    conclusion: 'success',
    created_at: new Date(Date.now() - 600000).toISOString(),
  },
  {
    repo: 'saabendtsen/my-app',
    workflow_name: 'Deploy',
    status: 'completed',
    conclusion: 'failure',
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
]

describe('GitHubTab', () => {
  it('renders workflow runs', () => {
    render(<GitHubTab runs={fixture} />)
    const runs = screen.getAllByTestId('github-run')
    expect(runs).toHaveLength(2)
  })

  it('renders workflow names', () => {
    render(<GitHubTab runs={fixture} />)
    expect(screen.getByText('CI')).toBeInTheDocument()
    expect(screen.getByText('Deploy')).toBeInTheDocument()
  })

  it('renders status indicators', () => {
    render(<GitHubTab runs={fixture} />)
    const statuses = screen.getAllByTestId('github-status')
    expect(statuses[0]).toHaveAttribute('data-conclusion', 'success')
    expect(statuses[1]).toHaveAttribute('data-conclusion', 'failure')
  })

  it('renders empty state', () => {
    render(<GitHubTab runs={[]} />)
    expect(screen.getByText('No workflow runs found')).toBeInTheDocument()
  })

  it('renders repo short names', () => {
    render(<GitHubTab runs={fixture} />)
    expect(screen.getByText('server-dashboard')).toBeInTheDocument()
    expect(screen.getByText('my-app')).toBeInTheDocument()
  })
})
