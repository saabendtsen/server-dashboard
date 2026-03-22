import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ServicesTab } from './ServicesTab'
import type { ServiceData } from '../../types'

const fixture: ServiceData[] = [
  {
    name: 'web-app',
    status: 'running',
    image: 'nginx:latest',
    started_at: new Date(Date.now() - 3600000).toISOString(),
    healthcheck: { status_code: 200, latency_ms: 42, error: null },
  },
  {
    name: 'db',
    status: 'running',
    image: 'postgres:16',
    started_at: new Date(Date.now() - 86400000).toISOString(),
    healthcheck: null,
  },
]

describe('ServicesTab', () => {
  it('renders service names', () => {
    render(<ServicesTab services={fixture} />)
    expect(screen.getByTestId('service-web-app')).toBeInTheDocument()
    expect(screen.getByTestId('service-db')).toBeInTheDocument()
  })

  it('renders empty state', () => {
    render(<ServicesTab services={[]} />)
    expect(screen.getByText('No containers found')).toBeInTheDocument()
  })

  it('renders healthy indicator', () => {
    render(<ServicesTab services={fixture} />)
    const indicators = screen.getAllByTestId('health-indicator')
    expect(indicators[0]).toHaveAttribute('data-health', 'healthy')
  })

  it('renders no-check indicator when healthcheck is null', () => {
    render(<ServicesTab services={fixture} />)
    const indicators = screen.getAllByTestId('health-indicator')
    expect(indicators[1]).toHaveAttribute('data-health', 'none')
  })
})
