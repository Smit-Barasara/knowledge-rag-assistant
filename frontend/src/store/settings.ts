import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ChatMode } from './conversations'
import { safeStorage } from './storage'

export type Theme = 'system' | 'light' | 'dark'

interface SettingsState {
  theme: Theme
  mode: ChatMode
  streaming: boolean
  showMetrics: boolean
  reduceMotion: boolean | null
  category: string
  topic: string
  setTheme: (theme: Theme) => void
  setMode: (mode: ChatMode) => void
  setStreaming: (streaming: boolean) => void
  setShowMetrics: (show: boolean) => void
  setReduceMotion: (reduce: boolean | null) => void
  setFilters: (category: string, topic: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'light',
      mode: 'rag',
      streaming: true,
      showMetrics: true,
      reduceMotion: null,
      category: '',
      topic: '',
      setTheme: (theme) => set({ theme }),
      setMode: (mode) => set({ mode }),
      setStreaming: (streaming) => set({ streaming }),
      setShowMetrics: (showMetrics) => set({ showMetrics }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setFilters: (category, topic) => set({ category, topic }),
    }),
    {
      name: 'rail-guidance-settings',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        theme: state.theme,
        mode: state.mode,
        streaming: state.streaming,
        showMetrics: state.showMetrics,
        reduceMotion: state.reduceMotion,
        category: state.category,
        topic: state.topic,
      }),
    },
  ),
)
