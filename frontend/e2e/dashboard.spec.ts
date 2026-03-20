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
  scheduler: {
    health: 'healthy',
    runs: [
      {
        id: 89,
        repo: 'Wibholm-solutions/dilemma',
        issue_number: 13,
        session_type: 'planning',
        started_at: '2026-03-20T10:20:03Z',
        ended_at: '2026-03-20T10:22:31Z',
        outcome: 'completed',
        pr_number: null,
        notes: null,
      },
      {
        id: 88,
        repo: 'saabendtsen/ai-scheduler',
        issue_number: 5,
        session_type: 'implementation',
        started_at: '2026-03-19T09:48:06Z',
        ended_at: '2026-03-19T09:49:43Z',
        outcome: 'failed',
        pr_number: 12,
        notes: null,
      },
    ],
  },
  github_actions: [
    {
      repo: 'org/my-app',
      workflow_name: 'CI',
      status: 'completed',
      conclusion: 'success',
      created_at: '2026-03-20T11:00:00Z',
    },
    {
      repo: 'org/other-app',
      workflow_name: 'Deploy',
      status: 'in_progress',
      conclusion: '',
      created_at: '2026-03-20T10:30:00Z',
    },
    {
      repo: 'org/my-app',
      workflow_name: 'Lint',
      status: 'completed',
      conclusion: 'failure',
      created_at: '2026-03-20T09:00:00Z',
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

test('GitHub Actions tab renders workflow runs with status colors', async ({ page }) => {
  await page.goto('/server-dashboard/')

  await page.getByRole('tab', { name: 'GitHub Actions' }).click()

  // Should show 3 runs
  const runs = page.getByTestId('github-run')
  await expect(runs).toHaveCount(3)

  // First run: success (green)
  const firstRun = runs.nth(0)
  await expect(firstRun.getByText('my-app')).toBeVisible()
  await expect(firstRun.getByText('CI')).toBeVisible()
  await expect(firstRun.getByTestId('github-status')).toHaveAttribute('data-conclusion', 'success')

  // Second run: in_progress (yellow)
  const secondRun = runs.nth(1)
  await expect(secondRun.getByText('other-app')).toBeVisible()
  await expect(secondRun.getByText('Deploy')).toBeVisible()
  await expect(secondRun.getByTestId('github-status')).toHaveAttribute('data-status', 'in_progress')

  // Third run: failure (red)
  const thirdRun = runs.nth(2)
  await expect(thirdRun.getByText('Lint')).toBeVisible()
  await expect(thirdRun.getByTestId('github-status')).toHaveAttribute('data-conclusion', 'failure')
})

test('AI Scheduler tab renders health badge and run list', async ({ page }) => {
  await page.goto('/server-dashboard/')

  await page.getByRole('tab', { name: 'AI Scheduler' }).click()

  // Health badge
  const badge = page.getByTestId('scheduler-health-badge')
  await expect(badge).toBeVisible()
  await expect(badge).toHaveAttribute('data-health', 'healthy')

  // Run list
  const runs = page.getByTestId('scheduler-run')
  await expect(runs).toHaveCount(2)

  // First run (newest) - completed planning
  const firstRun = runs.nth(0)
  await expect(firstRun.getByText('completed')).toBeVisible()
  await expect(firstRun.getByText('planning')).toBeVisible()
  await expect(firstRun.getByText('dilemma')).toBeVisible()

  // Issue link
  const issueLink = firstRun.getByRole('link', { name: '#13' })
  await expect(issueLink).toHaveAttribute('href', 'https://github.com/Wibholm-solutions/dilemma/issues/13')

  // Second run - failed implementation with PR
  const secondRun = runs.nth(1)
  await expect(secondRun.getByText('failed')).toBeVisible()
  await expect(secondRun.getByText('implementation')).toBeVisible()

  // PR link
  const prLink = secondRun.getByRole('link', { name: '#12' })
  await expect(prLink).toHaveAttribute('href', 'https://github.com/saabendtsen/ai-scheduler/pull/12')
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

test('displays last updated timestamp', async ({ page }) => {
  await page.goto('/server-dashboard/')

  const lastUpdated = page.getByTestId('last-updated')
  await expect(lastUpdated).toBeVisible()
  // Should show relative time (the mock date is in the past)
  await expect(lastUpdated).toContainText('ago')
})

test('refresh button triggers POST /api/refresh and updates data', async ({ page }) => {
  const UPDATED_STATUS = {
    ...MOCK_STATUS,
    system: {
      ...MOCK_STATUS.system,
      cpu_percent: 99.9,
    },
    last_updated: new Date().toISOString(),
  }

  await page.route('**/api/refresh', (route) =>
    route.fulfill({ json: UPDATED_STATUS })
  )

  await page.goto('/server-dashboard/')

  // Verify initial CPU value
  await expect(page.getByTestId('cpu-value')).toHaveText('23.5%')

  // Click refresh button
  const refreshBtn = page.getByTestId('refresh-button')
  await expect(refreshBtn).toBeVisible()
  await refreshBtn.click()

  // After refresh, data should update
  await expect(page.getByTestId('cpu-value')).toHaveText('99.9%')
})

test('refresh button shows spinner while refreshing', async ({ page }) => {
  // Delay the refresh response to observe spinner
  await page.route('**/api/refresh', async (route) => {
    await new Promise(r => setTimeout(r, 500))
    await route.fulfill({ json: MOCK_STATUS })
  })

  await page.goto('/server-dashboard/')

  const refreshBtn = page.getByTestId('refresh-button')
  await refreshBtn.click()

  // Spinner should appear
  await expect(page.getByTestId('refresh-spinner')).toBeVisible()

  // Button should be disabled during refresh
  await expect(refreshBtn).toBeDisabled()

  // After response, spinner goes away
  await expect(page.getByTestId('refresh-spinner')).toBeHidden({ timeout: 5000 })
  await expect(refreshBtn).toBeEnabled()
})
