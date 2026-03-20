import { test, expect } from '@playwright/test'

const MOCK_STATUS = {
  system: {
    disks: [
      { mount: '/', total_bytes: 120_000_000_000, used_bytes: 60_000_000_000, percent: 50.0 },
      { mount: '/data', total_bytes: 256_000_000_000, used_bytes: 100_000_000_000, percent: 39.1 },
    ],
    cpu_percent: 23.5,
    temperature: 45.0,
    load_average: [1.2, 0.8, 0.5],
    memory: { total_bytes: 16_000_000_000, used_bytes: 8_000_000_000, percent: 50.0 },
    uptime_seconds: 172800,
  },
  services: [
    {
      name: 'caddy',
      status: 'running',
      image: 'caddy:2.9',
      started_at: '2026-03-19T10:00:00Z',
      healthcheck: { status_code: 200, latency_ms: 30.0, error: null },
    },
    {
      name: 'ghost',
      status: 'running',
      image: 'ghost:5.118',
      started_at: '2026-03-18T08:00:00Z',
      healthcheck: null,
    },
    {
      name: 'old-app',
      status: 'exited',
      image: 'myapp:1.0',
      started_at: '2026-03-15T06:00:00Z',
      healthcheck: { status_code: null, latency_ms: null, error: 'connection_error' },
    },
  ],
  last_updated: '2026-03-20T12:00:00Z',
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/status', (route) =>
    route.fulfill({ json: MOCK_STATUS })
  )
})

test('renders four tabs with Server Overview active', async ({ page }) => {
  await page.goto('/server-dashboard/')

  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveCount(4)

  const overviewTab = page.getByRole('tab', { name: 'Server Overview' })
  await expect(overviewTab).toHaveAttribute('aria-selected', 'true')

  const schedulerTab = page.getByRole('tab', { name: 'AI Scheduler' })
  await expect(schedulerTab).toHaveAttribute('aria-selected', 'false')
})

test('Server Overview tab displays system metrics', async ({ page }) => {
  await page.goto('/server-dashboard/')

  await expect(page.getByTestId('disk-root')).toBeVisible()
  await expect(page.getByTestId('disk-data')).toBeVisible()

  await expect(page.getByTestId('cpu-value')).toHaveText('23.5%')
  await expect(page.getByTestId('temp-value')).toHaveText('45°C')
  await expect(page.getByTestId('memory-value')).toHaveText('50.0%')
  await expect(page.getByTestId('uptime-value')).toHaveText('2d 0h')
})

test('clicking another tab shows Coming soon', async ({ page }) => {
  await page.goto('/server-dashboard/')

  await page.getByRole('tab', { name: 'AI Scheduler' }).click()
  await expect(page.getByText('Coming soon')).toBeVisible()

  await page.getByRole('tab', { name: 'GitHub Actions' }).click()
  await expect(page.getByText('Coming soon')).toBeVisible()
})

test('Services tab renders container list with healthcheck indicators', async ({ page }) => {
  await page.goto('/server-dashboard/')

  await page.getByRole('tab', { name: 'Services' }).click()

  // Verify container names are shown
  await expect(page.getByTestId('service-caddy')).toBeVisible()
  await expect(page.getByTestId('service-ghost')).toBeVisible()
  await expect(page.getByTestId('service-old-app')).toBeVisible()

  // Verify status badges
  const caddyCard = page.getByTestId('service-caddy')
  await expect(caddyCard.getByText('running')).toBeVisible()
  await expect(caddyCard.getByText('caddy:2.9')).toBeVisible()

  // Verify healthcheck indicator - green for 200
  await expect(caddyCard.getByTestId('health-indicator')).toHaveAttribute('data-health', 'healthy')
  await expect(caddyCard.getByText('30ms')).toBeVisible()

  // Ghost has no healthcheck - grey indicator
  const ghostCard = page.getByTestId('service-ghost')
  await expect(ghostCard.getByTestId('health-indicator')).toHaveAttribute('data-health', 'none')

  // old-app has failed healthcheck - red indicator
  const oldAppCard = page.getByTestId('service-old-app')
  await expect(oldAppCard.getByTestId('health-indicator')).toHaveAttribute('data-health', 'unhealthy')
  await expect(oldAppCard.getByText('exited')).toBeVisible()
})
