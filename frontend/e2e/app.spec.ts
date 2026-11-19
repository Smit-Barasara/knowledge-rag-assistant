import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const guidance = [
  {
    id: 1,
    title: 'Cancelling an IRCTC e-ticket',
    category: 'Tickets',
    topic: 'Cancellation and refunds',
    summary: 'How to find the official cancellation and TDR guidance.',
    source_url: 'https://contents.irctc.co.in/en/eticketCancel.html',
    last_verified: '2026-11-18',
  },
  {
    id: 2,
    title: 'Understanding Tatkal bookings',
    category: 'Booking',
    topic: 'Tatkal',
    summary: 'What to verify before booking through the Tatkal quota.',
    source_url: 'https://contents.irctc.co.in/en/TatkalBooking.html',
    last_verified: '2026-11-18',
  },
]

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/health', (route) =>
    route.fulfill({ json: { status: 'healthy', message: 'Running' } }),
  )
  await page.route('**/api/v1/rail/guidance/filters', (route) =>
    route.fulfill({ json: { categories: ['Booking', 'Tickets'], topics: ['Tatkal', 'Cancellation and refunds'] } }),
  )
  await page.route('**/api/v1/rail/guidance?**', (route) => {
    const requestUrl = new URL(route.request().url())
    const q = requestUrl.searchParams.get('q')?.toLowerCase()
    const category = requestUrl.searchParams.get('category')
    const matches = guidance.filter((entry) =>
      (!q || entry.title.toLowerCase().includes(q))
      && (!category || entry.category === category),
    )
    return route.fulfill({
      status: 200,
      headers: { 'X-Total-Count': String(matches.length) },
      json: matches,
    })
  })
  await page.route('**/api/v1/rail/guidance/1', (route) =>
    route.fulfill({ json: { ...guidance[0], content: 'Check the current IRCTC cancellation page before acting.' } }),
  )
  await page.route('**/api/v1/chat/stream', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'data: {"sources":[{"document_id":1,"name":"Cancelling an IRCTC e-ticket","score":0.92}]}\n\n',
        'data: {"token":"Check the current IRCTC cancellation page before acting."}\n\n',
        'data: {"done":true,"conversation_id":"mock-conversation","latency_ms":250,"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}\n\n',
      ].join(''),
    })
  })
})

test('streams a rail guidance answer and renders a source citation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /good journeys begin with clear answers/i })).toBeVisible()
  await page.getByRole('button', { name: /how does the irctc guide say to cancel an e-ticket/i }).click()
  await expect(page.getByText('Check the current IRCTC cancellation page before acting.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /cancelling an irctc e-ticket/i })).toBeVisible()
})

test('defaults new visitors to light even when the system prefers dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('uses more of the desktop chat width for the conversation and composer', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/')
  const emptyState = await page.locator('.empty-state').boundingBox()
  const composer = await page.locator('.composer-wrap').boundingBox()
  expect(emptyState?.width).toBeGreaterThanOrEqual(880)
  expect(composer?.width).toBeGreaterThanOrEqual(880)
})

test('sends the server conversation id with a follow-up question', async ({ page }) => {
  const requests: { query: string; conversation_id?: string }[] = []
  await page.route('**/api/v1/chat/stream', async (route) => {
    requests.push(route.request().postDataJSON() as { query: string; conversation_id?: string })
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'data: {"sources":[]}\n\n',
        'data: {"token":"Check the official IRCTC source."}\n\n',
        'data: {"done":true,"conversation_id":"mock-conversation","latency_ms":250,"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}\n\n',
      ].join(''),
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /how does the irctc guide say to cancel an e-ticket/i }).click()
  await expect(page.getByText('Check the official IRCTC source.', { exact: true })).toBeVisible()
  const composer = page.getByRole('textbox', { name: 'Ask about Indian rail travel' })
  await composer.fill('What should I verify?')
  await composer.press('Enter')
  await expect(page.getByText('Check the official IRCTC source.', { exact: true }).last()).toBeVisible()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[0]?.conversation_id).toBeUndefined()
  expect(requests[1]).toMatchObject({ query: 'What should I verify?', conversation_id: 'mock-conversation' })
})

test('renders off-topic guardrail responses as friendly blocked messages', async ({ page }) => {
  await page.route('**/api/v1/chat/stream', (route) =>
    route.fulfill({ status: 400, json: { detail: 'I can help with general Indian rail guidance.' } }),
  )
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Ask about Indian rail travel' }).fill('What is the capital of France?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('I can help with general Indian rail guidance.', { exact: true })).toBeVisible()
  await expect(page.getByText('This request wasn’t added to your conversation memory.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ask about ticket cancellation' }).last()).toBeVisible()
})

test('searches and opens a rail guidance detail drawer', async ({ page }) => {
  await page.goto('/explore')
  await page.getByLabel('Search rail guidance').fill('cancel')
  await expect(page.getByRole('button', { name: 'View Cancelling an IRCTC e-ticket' })).toBeVisible()
  await page.getByRole('button', { name: 'View Cancelling an IRCTC e-ticket' }).click()
  await expect(page.getByRole('heading', { name: /^Cancelling an IRCTC e-ticket/ })).toBeVisible()
  await expect(page).toHaveURL(/\/explore\?.*id=1/)
  await expect(page.getByRole('button', { name: 'Ask about this topic' })).toBeVisible()
  await expect(page.getByRole('link', { name: /open official source/i })).toHaveAttribute('href', guidance[0]!.source_url)
})

async function expectAccessible(page: Page) {
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations
    .filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))
    .map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    }))
  expect(serious).toEqual([])
}

test('has no serious or critical accessibility violations on chat, explorer drawer, or about', async ({ page }) => {
  await page.goto('/')
  await expectAccessible(page)

  await page.goto('/explore')
  await page.getByRole('button', { name: 'View Cancelling an IRCTC e-ticket' }).click()
  await expect(page.getByRole('heading', { name: /^Cancelling an IRCTC e-ticket/ })).toBeVisible()
  await expectAccessible(page)

  await page.goto('/about')
  await expectAccessible(page)
})

test('keeps chat accessible in dark theme and shows offline status when health fails', async ({ page }) => {
  await page.goto('/')
  await page.locator('.settings-menu summary').click()
  await page.getByLabel('Theme').selectOption('dark')
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
  await expectAccessible(page)

  await page.route('**/api/v1/health', (route) => route.fulfill({ status: 503, json: { detail: 'Unavailable' } }))
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('alert')).toContainText('The API is unreachable')
  await expect(page.getByRole('textbox', { name: 'Ask about Indian rail travel' })).toBeDisabled()
  await expect(page.getByRole('status', { name: 'API offline' })).toBeVisible()
})

test('provides a responsive chat layout without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport)
  await page.getByRole('button', { name: 'Open conversations' }).click()
  await expect(page.getByRole('complementary', { name: 'Conversations' })).toHaveClass(/conversation-sidebar-open/)
})
