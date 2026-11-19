import { http, HttpResponse } from 'msw'

const API = 'http://localhost/api/v1'

export const handlers = [
  http.get(`${API}/health`, () => HttpResponse.json({ status: 'healthy', message: 'Running' })),
  http.get(`${API}/rail/guidance/filters`, () =>
    HttpResponse.json({ categories: ['Booking', 'Tickets'], topics: ['Tatkal', 'Cancellation and refunds'] }),
  ),
  http.get(`${API}/rail/guidance`, () => {
    const response = HttpResponse.json([
      {
        id: 1,
        title: 'Cancelling an IRCTC e-ticket',
        category: 'Tickets',
        topic: 'Cancellation and refunds',
        summary: 'Online cancellation and TDR overview.',
        source_url: 'https://contents.irctc.co.in/en/eticketCancel.html',
        last_verified: '2026-11-18',
      },
    ])
    response.headers.set('X-Total-Count', '1')
    return response
  }),
]
