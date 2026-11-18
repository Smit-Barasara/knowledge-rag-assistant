import { beforeEach, describe, expect, it } from 'vitest'
import { useSettingsStore } from './settings'

describe('settings store', () => {
  beforeEach(() => {
    useSettingsStore.persist.clearStorage()
    useSettingsStore.setState({
      theme: 'system',
      mode: 'rag',
      streaming: true,
      showMetrics: true,
      reduceMotion: null,
      level: '',
      type: '',
    })
  })

  it('persists theme, mode, stream and filter settings', () => {
    const settings = useSettingsStore.getState()
    settings.setTheme('dark')
    settings.setMode('graph')
    settings.setStreaming(false)
    settings.setFilters('Rookie', 'Reptile')
    const persisted = window.localStorage.getItem('digimon-rag-settings')
    expect(persisted).toContain('"theme":"dark"')
    expect(persisted).toContain('"mode":"graph"')
    expect(persisted).toContain('"level":"Rookie"')
  })
})
