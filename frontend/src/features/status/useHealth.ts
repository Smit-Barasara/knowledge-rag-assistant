import { useQuery } from '@tanstack/react-query'
import { getHealth } from '../../api/digimon'

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => getHealth(signal),
    refetchInterval: (query) => {
      if (document.visibilityState !== 'visible') return false
      return query.state.status === 'error' ? 120_000 : 30_000
    },
    retry: false,
  })
}
