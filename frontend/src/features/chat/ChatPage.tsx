import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Check, Clock3, Copy, Download, Menu, Plus, RotateCcw, Square, Trash2, X } from 'lucide-react'
import { getFilters } from '../../api/digimon'
import { useConversationStore } from '../../store/conversations'
import type { ChatMode, Message } from '../../store/conversations'
import { useSettingsStore } from '../../store/settings'
import { useHealth } from '../status/useHealth'
import { useChatController } from './useChatController'

const Markdown = lazy(() => import('../../components/Markdown').then((module) => ({ default: module.Markdown })))
const fallbackLevels = ['Fresh', 'In-Training', 'Rookie', 'Champion', 'Ultimate', 'Mega']
const suggestedPrompts = [
  'Tell me about Agumon',
  "What are Agumon's digivolutions?",
  'Which Rookie Digimon are Reptile type?',
  'Compare Greymon and Garurumon',
]
const modeLabels: Record<ChatMode, string> = { rag: 'Standard RAG', agent: 'Agent', graph: 'Corrective RAG' }

export function ChatPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const conversations = useConversationStore((state) => state.conversations)
  const activeId = useConversationStore((state) => state.activeId)
  const createConversation = useConversationStore((state) => state.createConversation)
  const setActive = useConversationStore((state) => state.setActive)
  const mode = useSettingsStore((state) => state.mode)
  const setMode = useSettingsStore((state) => state.setMode)
  const streaming = useSettingsStore((state) => state.streaming)
  const level = useSettingsStore((state) => state.level)
  const type = useSettingsStore((state) => state.type)
  const setFilters = useSettingsStore((state) => state.setFilters)
  const health = useHealth()
  const filters = useQuery({ queryKey: ['digimon-filters'], queryFn: ({ signal }) => getFilters(signal), staleTime: 3_600_000, retry: false })
  const controller = useChatController()
  const [query, setQuery] = useState('')
  const [showChats, setShowChats] = useState(false)
  const [modeNotice, setModeNotice] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const previousMode = useRef(mode)
  const conversation = conversations.find((item) => item.id === activeId)
  const messages = conversation?.messages ?? []
  const lastMessage = messages.at(-1)
  const busy = controller.busy
  const sendMessage = controller.send
  const online = health.isSuccess
  const filteredLevels = filters.data?.levels ?? (filters.isError ? fallbackLevels : [])
  const filteredTypes = filters.data?.types ?? []

  useEffect(() => {
    if (previousMode.current !== mode && mode !== 'rag' && messages.length > 0) setModeNotice(true)
    previousMode.current = mode
  }, [mode, messages.length])

  useEffect(() => {
    const state = location.state as { ask?: string } | null
    if (state?.ask) {
      navigate('/', { replace: true, state: null })
      window.setTimeout(() => {
        setMode('rag')
        setQuery('')
        setActive(createConversation())
      }, 0)
      window.setTimeout(() => {
        void sendMessage(state.ask!)
      }, 0)
    }
  }, [createConversation, location.state, navigate, sendMessage, setActive, setMode])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => {
      const target = event.target
      const typing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (event.key === '/' && !typing) {
        event.preventDefault()
        composerRef.current?.focus()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        createConversation()
        setQuery('')
      }
      if (event.key === 'Escape' && busy) controller.stop()
    }
    window.addEventListener('keydown', keyHandler)
    return () => window.removeEventListener('keydown', keyHandler)
  }, [busy, controller, createConversation])

  const send = (text = query) => {
    const trimmed = text.trim()
    if (!trimmed || trimmed.length > 2000 || busy || !online) return
    setQuery('')
    void controller.send(trimmed)
  }

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  )

  return (
    <div className="chat-layout">
      <aside className={`conversation-sidebar ${showChats ? 'conversation-sidebar-open' : ''}`} aria-label="Conversations">
        <div className="sidebar-heading">
          <div><span className="eyebrow">YOUR SPACE</span><h2>Conversations</h2></div>
          <button className="icon-button mobile-only" aria-label="Close conversations" onClick={() => setShowChats(false)}><X size={18} /></button>
        </div>
        <button className="button button-outline sidebar-new" onClick={() => { createConversation(); setQuery(''); setShowChats(false) }}>
          <Plus size={16} /> New conversation
        </button>
        <div className="conversation-list">
          {sortedConversations.map((item) => (
            <ConversationItem
              key={item.id}
              id={item.id}
              title={item.title}
              active={item.id === activeId}
              onSelect={() => { setActive(item.id); setShowChats(false) }}
            />
          ))}
        </div>
        <div className="sidebar-bottom">
          <button className="text-button" onClick={() => {
            if (window.confirm('Clear every saved conversation from this browser?')) useConversationStore.getState().clearConversations()
          }}>Clear all</button>
          <span>Stored only in this browser</span>
        </div>
      </aside>
      {showChats && <button className="sidebar-scrim" aria-label="Close conversations" onClick={() => setShowChats(false)} />}
      <section className="chat-main" aria-label="Chat">
        <div className="chat-toolbar">
          <button className="icon-button mobile-only" aria-label="Open conversations" onClick={() => setShowChats(true)}><Menu size={18} /></button>
          <div className="active-title">{conversation?.title ?? 'New conversation'}<span>{modeLabels[mode]}</span></div>
          {conversation && now - conversation.updatedAt > 60 * 60 * 1000 && mode === 'rag' && (
            <span className="memory-note"><Clock3 size={14} /> Earlier context may no longer be remembered</span>
          )}
        </div>
        {modeNotice && (
          <div className="inline-notice" role="status">
            This mode doesn’t remember earlier messages.
            <button className="icon-button" aria-label="Dismiss notice" onClick={() => setModeNotice(false)}><X size={15} /></button>
          </div>
        )}
        <div className="message-scroll" role="log" aria-live="off" aria-label="Conversation messages">
          {messages.length === 0 ? (
            <EmptyState onPrompt={(prompt) => send(prompt)} />
          ) : (
            <div className="message-list">
              {messages.map((message, index) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  busy={busy && message.status === 'pending'}
                  elapsed={controller.elapsedSeconds}
                  showMetrics={useSettingsStore.getState().showMetrics}
                  onRetry={() => controller.retry(message.id)}
                  onSource={(id) => navigate(`/explore?id=${id}`)}
                  onPrompt={(prompt) => send(prompt)}
                  {...(messages[index - 1] ? { previousMessage: messages[index - 1] } : {})}
                />
              ))}
              {busy && controller.elapsedSeconds >= 6 && messages.at(-1)?.status === 'pending' && (
                <p className="searching-hint" role="status">Still searching the knowledge base…</p>
              )}
            </div>
          )}
        </div>
        <div className="composer-wrap">
          {mode === 'rag' && (
            <FilterBar
              levels={filteredLevels}
              types={filteredTypes}
              level={level}
              type={type}
              onChange={setFilters}
              available={!filters.isError}
              disabled={busy}
            />
          )}
          {mode !== 'rag' && (
            <div className="filter-disabled" title="Not available in this mode">
              Filters are available in Standard RAG mode
            </div>
          )}
          <ModeSwitch mode={mode} disabled={busy} onChange={(next) => setMode(next)} />
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault()
              send()
            }}
          >
            <label className="sr-only" htmlFor="chat-prompt">Ask about Digimon</label>
            <textarea
              id="chat-prompt"
              ref={composerRef}
              value={query}
              maxLength={2000}
              rows={1}
              placeholder={online ? 'Ask anything about Digimon…' : 'Waiting for the API to reconnect…'}
              disabled={!online || busy}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              }}
            />
            {query.length >= 1800 && <span className="character-count" aria-live="polite">{query.length}/2000</span>}
            {busy ? (
              <button type="button" className="send-button stop-button" aria-label="Stop response" onClick={controller.stop}><Square size={16} fill="currentColor" /></button>
            ) : (
              <button type="submit" className="send-button" aria-label="Send message" disabled={!online || !query.trim() || query.length > 2000}>
                <ArrowUp size={18} />
              </button>
            )}
          </form>
          <p className="composer-hint">{streaming && mode === 'rag' ? 'Enter to send · Shift + Enter for a new line · Esc to stop' : 'Enter to send · Shift + Enter for a new line'} · Max 2,000 characters</p>
        </div>
      </section>
      <div className="visually-hidden" role="status" aria-live="polite">
        {lastMessage?.status === 'done' && lastMessage.role === 'assistant'
          ? `Assistant response complete. ${lastMessage.content}`
          : lastMessage?.status === 'blocked'
            ? `Request blocked. ${lastMessage.content}`
            : busy
              ? 'Assistant is responding'
              : ''}
      </div>
    </div>
  )
}

function ConversationItem({ id, title, active, onSelect }: { id: string; title: string; active: boolean; onSelect: () => void }) {
  const rename = useConversationStore((state) => state.renameConversation)
  const remove = useConversationStore((state) => state.deleteConversation)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  const messages = useConversationStore((state) => state.conversations.find((item) => item.id === id)?.messages ?? [])

  const exportConversation = () => {
    const content = messages.map((message) => `## ${message.role === 'user' ? 'You' : 'Assistant'}\n\n${message.content}`).join('\n\n')
    const url = URL.createObjectURL(new Blob([`# ${title}\n\n${content}`], { type: 'text/markdown' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${title.slice(0, 40) || 'conversation'}.md`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={`conversation-item ${active ? 'conversation-active' : ''}`}>
      {editing ? (
        <form onSubmit={(event) => { event.preventDefault(); rename(id, value); setEditing(false) }}>
          <input aria-label="Conversation title" value={value} onChange={(event) => setValue(event.target.value)} />
        </form>
      ) : (
        <button className="conversation-select" onClick={onSelect}>{title}</button>
      )}
      <div className="conversation-actions">
        {editing ? (
          <button className="icon-button small-icon" aria-label="Save title" onClick={() => { rename(id, value); setEditing(false) }}><Check size={14} /></button>
        ) : (
          <>
            <button className="icon-button small-icon" aria-label={`Export ${title}`} onClick={exportConversation}><Download size={14} /></button>
            <button className="icon-button small-icon" aria-label={`Rename ${title}`} onClick={() => setEditing(true)}><span aria-hidden="true">Aa</span></button>
            <button className="icon-button small-icon" aria-label={`Delete ${title}`} onClick={() => remove(id)}><Trash2 size={14} /></button>
          </>
        )}
      </div>
    </div>
  )
}

function EmptyState({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  return (
    <div className="empty-state">
      <div className="hero-orbit" aria-hidden="true"><span>デジモン</span></div>
      <span className="eyebrow">YOUR DIGIMON KNOWLEDGE DESK</span>
      <h1>Every evolution starts<br />with a question.</h1>
      <p>Ask about Digimon, compare evolutions, or explore the knowledge base.</p>
      <div className="prompt-grid">
        {suggestedPrompts.map((prompt, index) => (
          <button key={prompt} className="suggestion-card" onClick={() => onPrompt(prompt)}>
            <span>0{index + 1}</span>{prompt}<ArrowDown size={15} aria-hidden="true" />
          </button>
        ))}
      </div>
      <a className="browse-link" href="/explore">Browse the Digimon archive <ArrowUp size={14} /></a>
    </div>
  )
}

function MessageRow({
  message,
  busy,
  elapsed,
  showMetrics,
  onRetry,
  onSource,
  onPrompt,
  previousMessage,
}: {
  message: Message
  busy: boolean
  elapsed: number
  showMetrics: boolean
  onRetry: () => void
  onSource: (id: number) => void
  onPrompt: (prompt: string) => void
  previousMessage?: Message
}) {
  const [copied, setCopied] = useState(false)
  const suggestions = ['Tell me about Agumon', 'Show me Rookie Digimon', 'Compare two Digimon']
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article className={`message-row message-${message.role}`} aria-label={`${message.role === 'user' ? 'You' : 'Assistant'} message`}>
      <div className={`avatar avatar-${message.role}`} aria-hidden="true">{message.role === 'user' ? 'S' : 'D'}</div>
      <div className="message-content">
        <div className="message-meta">
          <strong>{message.role === 'user' ? 'You' : 'Archive assistant'}</strong>
          {message.role === 'assistant' && <span className="mode-badge">{modeLabels[message.mode]}</span>}
        </div>
        {message.status === 'pending' && !message.content ? (
          <div className="typing-indicator" aria-label={busy ? `Working, ${elapsed} seconds` : 'Thinking'}>
            <span /><span /><span />{message.mode !== 'rag' && <small>Working… {elapsed} s</small>}
          </div>
        ) : (
          <Suspense fallback={<p className="plain-answer">{message.content}</p>}>
            <Markdown>{message.content}</Markdown>
          </Suspense>
        )}
        {message.status === 'blocked' && (
          <div className="blocked-notice">
            <p>This request wasn’t added to your conversation memory. Try one of these:</p>
            {suggestions.map((prompt) => <button key={prompt} className="text-button" onClick={() => onPrompt(prompt)}>{prompt}</button>)}
          </div>
        )}
        {message.sources && message.sources.length > 0 && (
          <div className="sources-list" aria-label="Supporting sources">
            <span className="sources-label">SOURCES</span>
            {message.sources.map((source, index) => {
              const score = source.score === null ? null : Math.max(0, Math.min(100, Math.round(((source.score - 0.5) / 0.5) * 100)))
              return source.digimonId === null ? (
                <span key={`${source.name}-${index}`} className="source-chip">{source.name}</span>
              ) : (
                <button key={source.digimonId} className="source-chip" onClick={() => onSource(source.digimonId!)}>
                  {source.name}
                  {score !== null && <span className="relevance-meter" aria-label={`Relevance ${score}%`}><i style={{ width: `${score}%` }} /></span>}
                  {score !== null && <small>{score}%</small>}
                </button>
              )
            })}
          </div>
        )}
        {message.role === 'assistant' && message.mode === 'rag' && message.status === 'done' && message.sources?.length === 0 && (
          <p className="source-warning">No supporting sources were retrieved — this answer may be incomplete.</p>
        )}
        {message.meta?.rewrittenQuery && (
          <p className="rewritten-note">Your question was refined to: “{message.meta.rewrittenQuery}”</p>
        )}
        {message.meta?.iterations !== undefined && (
          <p className="message-detail">Refined {message.meta.iterations} time{message.meta.iterations === 1 ? '' : 's'} · {message.meta.documentsUsed ?? 0} documents used</p>
        )}
        {message.meta?.toolCalls && Object.keys(message.meta.toolCalls).length > 0 && (
          <div className="tool-list" aria-label="Tools used">
            {Object.entries(message.meta.toolCalls).map(([name, count]) => <span key={name}>{name} ×{count}</span>)}
          </div>
        )}
        {message.meta?.notRemembered && <p className="message-detail">Stopped — this turn was not saved to server memory.</p>}
        {message.error && (
          <div className="message-error" role="alert">
            <span>{message.error.message}</span>
            <button className="button button-small" onClick={onRetry}><RotateCcw size={14} /> Retry</button>
          </div>
        )}
        {message.role === 'assistant' && message.status === 'done' && (
          <div className="answer-actions">
            <button className="text-button" onClick={() => void copy()} aria-label="Copy answer"><Copy size={14} /> {copied ? 'Copied' : 'Copy'}</button>
            {showMetrics && message.meta && (
              <span>{message.meta.latencyMs !== undefined ? `${(message.meta.latencyMs / 1000).toFixed(1)} s` : ''}
                {message.meta.usage?.totalTokens !== undefined ? ` · ${message.meta.usage.totalTokens} tokens` : ''}</span>
            )}
          </div>
        )}
      </div>
      {message.role === 'assistant' && message.status === 'stopped' && previousMessage?.role === 'user' && (
        <button className="button button-small retry-stopped" onClick={onRetry}><RotateCcw size={14} /> Retry</button>
      )}
    </article>
  )
}

function FilterBar({
  levels,
  types,
  level,
  type,
  onChange,
  available,
  disabled,
}: {
  levels: string[]
  types: string[]
  level: string
  type: string
  onChange: (level: string, type: string) => void
  available: boolean
  disabled: boolean
}) {
  return (
    <div className="filter-bar" aria-label="Search filters">
      <label>Level
        <select value={level} disabled={disabled} onChange={(event) => onChange(event.target.value, type)}>
          <option value="">Any level</option>{levels.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      {available && types.length > 0 && (
        <label>Type
          <select value={type} disabled={disabled} onChange={(event) => onChange(level, event.target.value)}>
            <option value="">Any type</option>{types.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      )}
      {(level || type) && <button className="text-button clear-filter" onClick={() => onChange('', '')} disabled={disabled}><X size={13} /> Clear filters</button>}
      {level && <span className="filter-chip">{level}</span>}
      {type && <span className="filter-chip">{type}</span>}
    </div>
  )
}

function ModeSwitch({ mode, disabled, onChange }: { mode: ChatMode; disabled: boolean; onChange: (mode: ChatMode) => void }) {
  return (
    <div className="mode-switch" role="group" aria-label="Assistant mode">
      {(['rag', 'agent', 'graph'] as const).map((value) => (
        <button key={value} type="button" className={mode === value ? 'mode-selected' : ''} disabled={disabled} aria-pressed={mode === value} onClick={() => onChange(value)}>
          {modeLabels[value]}
        </button>
      ))}
    </div>
  )
}
