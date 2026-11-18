import { useHealth } from '../features/status/useHealth'

export function StatusIndicator() {
  const health = useHealth()
  const state = health.isPending ? 'checking' : health.isError ? 'offline' : 'online'
  const label = state === 'checking' ? 'Checking…' : state === 'offline' ? 'API offline' : 'API online'
  return (
    <span className={`status-pill status-${state}`} role="status" aria-label={label}>
      <span className="status-dot" aria-hidden="true" />
      {label}
    </span>
  )
}
