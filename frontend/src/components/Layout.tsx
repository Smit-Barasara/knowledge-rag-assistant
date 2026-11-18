import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BookOpen, MessageSquare, Moon, Plus, Settings, Sun, Waypoints } from 'lucide-react'
import { StatusIndicator } from './StatusIndicator'
import { useSettingsStore } from '../store/settings'
import { useConversationStore } from '../store/conversations'
import { useHealth } from '../features/status/useHealth'

export function Layout() {
  const navigate = useNavigate()
  const health = useHealth()
  const createConversation = useConversationStore((state) => state.createConversation)
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const reduceMotion = useSettingsStore((state) => state.reduceMotion)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const applyTheme = () => {
      const dark = theme === 'dark' || (theme === 'system' && prefersDark.matches)
      document.documentElement.classList.toggle('dark', dark)
      const reduce = reduceMotion ?? prefersReducedMotion.matches
      document.documentElement.classList.toggle('reduce-motion', reduce)
    }
    applyTheme()
    prefersDark.addEventListener('change', applyTheme)
    prefersReducedMotion.addEventListener('change', applyTheme)
    return () => {
      prefersDark.removeEventListener('change', applyTheme)
      prefersReducedMotion.removeEventListener('change', applyTheme)
    }
  }, [reduceMotion, theme])

  useEffect(() => {
    if (health.isSuccess) {
      document.dispatchEvent(new CustomEvent('api-online'))
    }
  }, [health.isSuccess])

  const startNewChat = () => {
    createConversation()
    navigate('/')
    setSidebarOpen(false)
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <button
          className="icon-button mobile-menu"
          aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <Waypoints size={20} />
        </button>
        <Link className="brand" to="/" aria-label="Digimon Archive home">
          <span className="brand-mark" aria-hidden="true"><Waypoints size={19} /></span>
          <span>Digimon<span className="brand-light"> Archive</span></span>
        </Link>
        <nav className={`primary-nav ${sidebarOpen ? 'nav-open' : ''}`} aria-label="Main navigation">
          <NavLink to="/" end onClick={() => setSidebarOpen(false)}><MessageSquare size={16} /> Chat</NavLink>
          <NavLink to="/explore" onClick={() => setSidebarOpen(false)}><BookOpen size={16} /> Explorer</NavLink>
          <NavLink to="/about" onClick={() => setSidebarOpen(false)}><Waypoints size={16} /> How it works</NavLink>
        </nav>
        <div className="topbar-actions">
          <StatusIndicator />
          <details className="settings-menu">
            <summary className="icon-button" aria-label="Open settings"><Settings size={18} /></summary>
            <div className="settings-popover" role="group" aria-label="Settings">
              <strong>Preferences</strong>
              <label>
                Theme
                <select value={theme} onChange={(event) => setTheme(event.target.value as 'system' | 'light' | 'dark')}>
                  <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
                </select>
              </label>
              <SettingsToggles />
            </div>
          </details>
          <button className="button button-primary new-chat-button" onClick={startNewChat}>
            <Plus size={16} /><span>New chat</span>
          </button>
        </div>
      </header>
      {health.isError && (
        <div className="offline-banner" role="alert">
          The API is unreachable. Check that the backend is running; chat and Digimon data are unavailable until it reconnects.
        </div>
      )}
      <main id="main-content" className="route-content">
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>Unofficial fan project · Conversations are stored in your browser</span>
        <span><Sun size={13} aria-hidden="true" /><Moon size={13} aria-hidden="true" /></span>
      </footer>
    </div>
  )
}

function SettingsToggles() {
  const streaming = useSettingsStore((state) => state.streaming)
  const setStreaming = useSettingsStore((state) => state.setStreaming)
  const showMetrics = useSettingsStore((state) => state.showMetrics)
  const setShowMetrics = useSettingsStore((state) => state.setShowMetrics)
  const reduceMotion = useSettingsStore((state) => state.reduceMotion)
  const setReduceMotion = useSettingsStore((state) => state.setReduceMotion)
  return (
    <>
      <label className="setting-check"><input type="checkbox" checked={streaming} onChange={(event) => setStreaming(event.target.checked)} /> Stream responses</label>
      <label className="setting-check"><input type="checkbox" checked={showMetrics} onChange={(event) => setShowMetrics(event.target.checked)} /> Show usage & latency</label>
      <label>
        Reduce motion
        <select value={reduceMotion === null ? 'system' : String(reduceMotion)} onChange={(event) => setReduceMotion(event.target.value === 'system' ? null : event.target.value === 'true')}>
          <option value="system">Follow system</option><option value="true">On</option><option value="false">Off</option>
        </select>
      </label>
    </>
  )
}
