import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const digimon = [
  { id: 1, name: 'Agumon', level: 'Rookie', type: 'Reptile', attribute: 'Vaccine', image_url: null },
  { id: 2, name: 'Gabumon', level: 'Rookie', type: 'Beast', attribute: 'Data', image_url: null },
]

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/health', (route) =>
    route.fulfill({ json: { status: 'healthy', message: 'Running' } }),
  )
  await page.route('**/api/v1/digimon/filters', (route) =>
    route.fulfill({ json: { levels: ['Rookie'], types: ['Reptile', 'Beast'], attributes: ['Data', 'Vaccine'] } }),
  )
  await page.route('**/api/v1/digimon?**', (route) => {
    const requestUrl = new URL(route.request().url())
    const q = requestUrl.searchParams.get('q')?.toLowerCase()
    const level = requestUrl.searchParams.get('level')
    const matches = digimon.filter((entry) => (!q || entry.name.toLowerCase().includes(q)) && (!level || entry.level === level))
    return route.fulfill({
      status: 200,
      headers: { 'X-Total-Count': String(matches.length) },
      json: matches,
    })
  })
  await page.route('**/api/v1/digimon/1', (route) =>
    route.fulfill({
      json: {
        id: 1,
        name: 'Agumon',
        level: 'Rookie',
        type: 'Reptile',
        attribute: 'Vaccine',
        description: 'A small reptile Digimon.',
        image_url: null,
      },
    }),
  )
  await page.route('**/api/v1/chat/stream', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'data: {"sources":[{"digimon_id":1,"name":"Agumon","score":0.92}]}\n\n',
        'data: {"token":"Agumon is a Rookie Digimon."}\n\n',
        'data: {"done":true,"conversation_id":"mock-conversation","latency_ms":250,"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}\n\n',
      ].join(''),
    })
  })
})

test('streams a chat answer and renders a source citation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /every evolution starts/i })).toBeVisible()
  await page.getByRole('button', { name: /tell me about agumon/i }).click()
  await expect(page.getByText('Agumon is a Rookie Digimon.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /agumon.*84%/i })).toBeVisible()
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
        'data: {"token":"Agumon is a Rookie Digimon."}\n\n',
        'data: {"done":true,"conversation_id":"mock-conversation","latency_ms":250,"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}\n\n',
      ].join(''),
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /tell me about agumon/i }).click()
  await expect(page.getByText('Agumon is a Rookie Digimon.', { exact: true })).toBeVisible()
  const composer = page.getByRole('textbox', { name: 'Ask about Digimon' })
  await composer.fill('What are its skills?')
  await composer.press('Enter')
  await expect(page.getByText('Agumon is a Rookie Digimon.', { exact: true }).last()).toBeVisible()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[0]?.conversation_id).toBeUndefined()
  expect(requests[1]).toMatchObject({ query: 'What are its skills?', conversation_id: 'mock-conversation' })
})

test('renders off-topic guardrail responses as friendly blocked messages', async ({ page }) => {
  await page.route('**/api/v1/chat/stream', (route) =>
    route.fulfill({ status: 400, json: { detail: 'I can only answer questions about Digimon.' } }),
  )
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Ask about Digimon' }).fill('What is the capital of France?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('I can only answer questions about Digimon.', { exact: true })).toBeVisible()
  await expect(page.getByText('This request wasn’t added to your conversation memory.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tell me about Agumon' }).last()).toBeVisible()
})

test('searches and opens a Digimon explorer detail drawer', async ({ page }) => {
  await page.goto('/explore')
  await page.getByLabel('Search Digimon').fill('agu')
  await expect(page.getByRole('button', { name: 'View Agumon details' })).toBeVisible()
  await page.getByRole('button', { name: 'View Agumon details' }).click()
  await expect(page.getByRole('heading', { name: /^Agumon/ })).toBeVisible()
  await expect(page).toHaveURL(/\/explore\?.*id=1/)
  await expect(page.getByRole('button', { name: 'Ask about Agumon' })).toBeVisible()
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
  await page.getByRole('button', { name: 'View Agumon details' }).click()
  await expect(page.getByRole('heading', { name: /^Agumon/ })).toBeVisible()
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
  await expect(page.getByRole('alert')).toContainText('The API is unreachable')
  await expect(page.getByRole('textbox', { name: 'Ask about Digimon' })).toBeDisabled()
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
