import type { StateStorage } from 'zustand/middleware'

export const safeStorage: StateStorage = {
  getItem(name) {
    try {
      return window.localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem(name, value) {
    try {
      window.localStorage.setItem(name, value)
    } catch {
      // Private browsing and storage quota failures must not break chat.
    }
  },
  removeItem(name) {
    try {
      window.localStorage.removeItem(name)
    } catch {
      // Storage may be unavailable.
    }
  },
}
