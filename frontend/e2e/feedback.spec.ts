import { test, expect } from '@playwright/test'

const MOCK_STATUS = {
  system: {
    disks: [{ mount: '/', total_bytes: 120e9, used_bytes: 60e9, percent: 50 }],
    cpu_percent: 20,
    temperature: 40,
    load_average: [1, 0.5, 0.3],
    memory: { total_bytes: 16e9, used_bytes: 8e9, percent: 50 },
    uptime_seconds: 86400,
  },
  services: [],
  scheduler: { health: 'healthy', runs: [] },
  github_actions: [],
  last_updated: new Date().toISOString(),
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/status', (route) =>
    route.fulfill({ json: MOCK_STATUS })
  )
})

test('feedback button renders in bottom-right corner', async ({ page }) => {
  await page.goto('/server-dashboard/')

  const btn = page.getByLabel('Send feedback')
  await expect(btn).toBeVisible()

  // Verify it's positioned fixed bottom-right
  const box = await btn.boundingBox()
  const viewport = page.viewportSize()!
  expect(box).toBeTruthy()
  expect(box!.x + box!.width).toBeGreaterThan(viewport.width - 100)
  expect(box!.y + box!.height).toBeGreaterThan(viewport.height - 100)
})

test('clicking feedback button opens modal with form', async ({ page }) => {
  await page.goto('/server-dashboard/')

  const btn = page.getByLabel('Send feedback')
  await btn.click()

  // Modal should show form elements
  await expect(page.getByText('Send feedback')).toBeVisible()
  await expect(page.getByPlaceholder('Kort beskrivelse')).toBeVisible()
  await expect(page.getByPlaceholder('Uddyb gerne...')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible()

  // Type selector buttons should be visible
  await expect(page.getByRole('button', { name: /Bug/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Feature/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Feedback/ })).toBeVisible()
})

test('submitting feedback form shows success message', async ({ page }) => {
  // Mock the feedback API
  await page.route('**/api/feedback', (route) =>
    route.fulfill({ status: 200, json: { ok: true } })
  )

  await page.goto('/server-dashboard/')

  // Open modal
  await page.getByLabel('Send feedback').click()

  // Select "Bug" type
  await page.getByRole('button', { name: /Bug/ }).click()

  // Fill form
  await page.getByPlaceholder('Kort beskrivelse').fill('Test bug report')
  await page.getByPlaceholder('Uddyb gerne...').fill('This is a test description')

  // Submit
  await page.getByRole('button', { name: 'Send', exact: true }).click()

  // Should show success message
  await expect(page.getByText('Tak for din feedback!')).toBeVisible()
  await expect(page.getByText('Vi har oprettet et issue.')).toBeVisible()
})

test('closing feedback modal toggles it off', async ({ page }) => {
  await page.goto('/server-dashboard/')

  const btn = page.getByLabel('Send feedback')

  // Open
  await btn.click()
  await expect(page.getByPlaceholder('Kort beskrivelse')).toBeVisible()

  // Close by clicking button again
  await btn.click()
  await expect(page.getByPlaceholder('Kort beskrivelse')).not.toBeVisible()
})
