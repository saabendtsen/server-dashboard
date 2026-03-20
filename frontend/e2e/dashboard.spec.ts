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

  await page.getByRole('tab', { name: 'Services' }).click()
  await expect(page.getByText('Coming soon')).toBeVisible()
})
