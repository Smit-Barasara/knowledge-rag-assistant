import { http, HttpResponse } from 'msw'

const API = 'http://localhost/api/v1'

export const handlers = [
  http.get(`${API}/health`, () => HttpResponse.json({ status: 'healthy', message: 'Running' })),
  http.get(`${API}/digimon/filters`, () =>
    HttpResponse.json({ levels: ['Champion', 'Rookie'], types: ['Reptile'], attributes: ['Vaccine'] }),
  ),
  http.get(`${API}/digimon`, () => {
    const response = HttpResponse.json([
      { id: 1, name: 'Agumon', level: 'Rookie', type: 'Reptile', attribute: 'Vaccine', image_url: null },
    ])
    response.headers.set('X-Total-Count', '1')
    return response
  }),
]
