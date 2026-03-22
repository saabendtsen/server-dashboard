import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OverviewTab } from './OverviewTab'
import type { SystemData } from '../../types'

const fixture: SystemData = {
  disks: [
    { mount: '/', total_bytes: 100 * 1024 ** 3, used_bytes: 45 * 1024 ** 3, percent: 45.0 },
  ],
  cpu_percent: 12.5,
  temperature: 52,
  load_average: [0.5, 1.2, 0.8],
  memory: { total_bytes: 16 * 1024 ** 3, used_bytes: 8 * 1024 ** 3, percent: 50.0 },
  uptime_seconds: 172800,
}

describe('OverviewTab', () => {
  it('renders CPU value', () => {
    render(<OverviewTab data={fixture} />)
    expect(screen.getByTestId('cpu-value')).toHaveTextContent('12.5%')
  })

  it('renders temperature', () => {
    render(<OverviewTab data={fixture} />)
    expect(screen.getByTestId('temp-value')).toHaveTextContent('52°C')
  })

  it('renders N/A when temperature is null', () => {
    render(<OverviewTab data={{ ...fixture, temperature: null }} />)
    expect(screen.getByTestId('temp-value')).toHaveTextContent('N/A')
  })

  it('renders memory percent', () => {
    render(<OverviewTab data={fixture} />)
    expect(screen.getByTestId('memory-value')).toHaveTextContent('50.0%')
  })

  it('renders disk gauge', () => {
    render(<OverviewTab data={fixture} />)
    expect(screen.getByTestId('disk-root')).toBeInTheDocument()
  })

  it('renders load average', () => {
    render(<OverviewTab data={fixture} />)
    expect(screen.getByTestId('load-value')).toHaveTextContent('0.50 / 1.20 / 0.80')
  })

  it('renders uptime', () => {
    render(<OverviewTab data={fixture} />)
    expect(screen.getByTestId('uptime-value')).toHaveTextContent('2d 0h')
  })
})
