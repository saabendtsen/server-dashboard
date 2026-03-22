import { describe, it, expect } from 'vitest'
import { formatBytes, formatUptime, formatRelativeTime, repoShortName } from './formatters'

describe('formatBytes', () => {
  it('formats gigabytes', () => {
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB')
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2.5 GB')
  })

  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0.0 GB')
  })
})

describe('formatUptime', () => {
  it('formats days and hours', () => {
    expect(formatUptime(90000)).toBe('1d 1h')
  })

  it('formats zero', () => {
    expect(formatUptime(0)).toBe('0d 0h')
  })

  it('formats hours only', () => {
    expect(formatUptime(7200)).toBe('0d 2h')
  })
})

describe('formatRelativeTime', () => {
  it('formats seconds ago', () => {
    const now = new Date()
    now.setSeconds(now.getSeconds() - 30)
    expect(formatRelativeTime(now.toISOString())).toBe('30s ago')
  })

  it('formats minutes ago', () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - 5)
    expect(formatRelativeTime(now.toISOString())).toBe('5m ago')
  })

  it('formats hours ago', () => {
    const now = new Date()
    now.setHours(now.getHours() - 3)
    expect(formatRelativeTime(now.toISOString())).toBe('3h ago')
  })

  it('formats days ago', () => {
    const now = new Date()
    now.setDate(now.getDate() - 2)
    expect(formatRelativeTime(now.toISOString())).toBe('2d ago')
  })
})

describe('repoShortName', () => {
  it('extracts repo name from owner/repo', () => {
    expect(repoShortName('saabendtsen/server-dashboard')).toBe('server-dashboard')
  })

  it('returns name as-is without slash', () => {
    expect(repoShortName('my-repo')).toBe('my-repo')
  })
})
