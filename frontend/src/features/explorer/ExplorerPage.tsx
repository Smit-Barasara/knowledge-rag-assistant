import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Search, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { getGuidance, getGuidanceFilters, listGuidance } from '../../api/rail-guidance'
import type { GuidanceListItem } from '../../api/schemas'

const PAGE_SIZE = 12

export function ExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)
  const q = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? ''
  const topic = searchParams.get('topic') ?? ''
  const selectedId = Number(searchParams.get('id')) || null

  const filters = useQuery({
    queryKey: ['rail-guidance-filters'],
    queryFn: ({ signal }) => getGuidanceFilters(signal),
    staleTime: 3_600_000,
    retry: false,
  })
  const list = useQuery({
    queryKey: ['rail-guidance', { q, category, topic, page }],
    queryFn: ({ signal }) =>
      listGuidance({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        ...(q ? { q } : {}),
        ...(category ? { category } : {}),
        ...(topic ? { topic } : {}),
      }, signal),
    placeholderData: (previous) => previous,
  })
  const detail = useQuery({
    queryKey: ['rail-guidance', 'detail', selectedId],
    queryFn: ({ signal }) => getGuidance(selectedId ?? 0, signal),
    enabled: selectedId !== null,
    retry: false,
  })

  const categories = filters.data?.categories ?? []
  const topics = filters.data?.topics ?? []
  const total = list.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    if (page >= pageCount || !list.data) return
    const query = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      ...(q ? { q } : {}),
      ...(category ? { category } : {}),
      ...(topic ? { topic } : {}),
    }
    const timer = window.setTimeout(() => {
      void queryClient.prefetchQuery({
        queryKey: ['rail-guidance', { q, category, topic, page: page + 1 }],
        queryFn: ({ signal }) => listGuidance(query, signal),
      })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [category, list.data, page, pageCount, q, queryClient, topic])

  const updateParams = (updates: Record<string, string>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setSearchParams(next)
  }
  const clearFilters = () => setSearchParams(selectedId ? { id: String(selectedId) } : {})
  const closeDrawer = (open: boolean) => {
    if (!open) updateParams({ id: '' })
  }

  return (
    <div className="explorer-page page-container">
      <header className="page-heading explorer-heading">
        <div>
          <span className="eyebrow">INDIAN RAIL · KNOWLEDGE INDEX</span>
          <h1>Rail travel guide<span className="heading-period">.</span></h1>
          <p>Browse practical guidance linked to official IRCTC sources.</p>
        </div>
        <div className="archive-count"><BookOpen size={16} /><strong>{list.isPending ? '—' : total.toLocaleString()}</strong><span>source records</span></div>
      </header>

      <div className="explorer-controls">
        <SearchBox key={q} />
        <label>Category
          <select value={category} onChange={(event) => updateParams({ category: event.target.value, page: '' })}>
            <option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>Topic
          <select value={topic} onChange={(event) => updateParams({ topic: event.target.value, page: '' })}>
            <option value="">All topics</option>{topics.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        {(q || category || topic) && <button className="text-button clear-explorer" onClick={clearFilters}>Clear filters</button>}
      </div>

      {list.isError ? (
        <section className="explorer-state" role="alert">
          <h2>Couldn’t load rail guidance</h2><p>{list.error instanceof ApiError ? list.error.message : 'Check the API connection and try again.'}</p>
          <button className="button button-primary" onClick={() => void list.refetch()}>Retry</button>
        </section>
      ) : list.isPending ? (
        <div className="guide-list" aria-label="Loading rail guidance" aria-busy="true">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="guide-skeleton" />)}
        </div>
      ) : list.data.items.length === 0 ? (
        <section className="explorer-state">
          <span className="eyebrow">NO MATCHES</span><h2>No guidance matches these filters.</h2><p>Try a different search or clear the selected filters.</p>
          <button className="button button-outline" onClick={clearFilters}>Clear filters</button>
        </section>
      ) : (
        <>
          <div className="guide-list">
            {list.data.items.map((item) => (
              <GuidanceRow key={item.id} item={item} onOpen={() => updateParams({ id: String(item.id) })} />
            ))}
          </div>
          <nav className="pagination" aria-label="Guidance pages">
            <span>Page {page} of {pageCount} <small>· {total.toLocaleString()} sources</small></span>
            <div>
              <button className="button button-outline" disabled={page <= 1} onClick={() => updateParams({ page: page > 2 ? String(page - 1) : '' })}><ArrowLeft size={15} /> Previous</button>
              <button className="button button-outline" disabled={page >= pageCount} onClick={() => updateParams({ page: String(page + 1) })}>Next <ArrowRight size={15} /></button>
            </div>
          </nav>
        </>
      )}

      <Dialog.Root open={selectedId !== null} onOpenChange={closeDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="guidance-dialog" aria-describedby="guidance-detail-description">
            <Dialog.Close className="icon-button dialog-close" aria-label="Close guidance details"><X size={18} /></Dialog.Close>
            {detail.isPending ? <div className="detail-loading" role="status"><Dialog.Title className="sr-only">Loading guidance details</Dialog.Title>Loading guidance details…</div> : detail.isError ? (
              <div className="detail-error" role="alert">
                <Dialog.Title>{detail.error instanceof ApiError && detail.error.status === 404 ? 'Guidance not found' : 'Couldn’t load guidance'}</Dialog.Title>
                <p id="guidance-detail-description">{detail.error instanceof ApiError ? detail.error.message : 'Try again in a moment.'}</p>
                {!(detail.error instanceof ApiError && detail.error.status === 404) && <button className="button button-outline" onClick={() => void detail.refetch()}>Retry</button>}
              </div>
            ) : detail.data ? (
              <div className="guidance-detail">
                <span className="eyebrow">{detail.data.category} · {detail.data.topic}</span>
                <Dialog.Title className="detail-name">{detail.data.title}<span className="heading-period">.</span></Dialog.Title>
                <p className="guidance-summary" id="guidance-detail-description">{detail.data.summary}</p>
                <div className="guidance-content">{detail.data.content}</div>
                <p className="guidance-verified">Source checked {detail.data.last_verified}</p>
                <div className="guidance-actions">
                  <a className="button button-outline" href={detail.data.source_url} target="_blank" rel="noopener noreferrer">
                    Open official source <ArrowUpRight size={16} />
                  </a>
                  <button className="button button-primary ask-button" onClick={() => navigate('/', { state: { ask: `Explain the official guidance about ${detail.data.title}` } })}>
                    Ask about this topic
                  </button>
                </div>
                <small>General guidance only. Verify current, journey-specific information directly with IRCTC.</small>
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

function SearchBox() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') ?? '')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value = search.trim()
      if (value === (searchParams.get('q') ?? '')) return
      const next = new URLSearchParams(searchParams)
      if (value) next.set('q', value)
      else next.delete('q')
      next.delete('page')
      setSearchParams(next, { replace: true })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search, searchParams, setSearchParams])

  return (
    <label className="search-field">
      <Search size={17} aria-hidden="true" />
      <span className="sr-only">Search rail guidance</span>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search guidance…" />
      {search && <button type="button" className="icon-button small-icon" aria-label="Clear search" onClick={() => setSearch('')}><X size={15} /></button>}
    </label>
  )
}

function GuidanceRow({ item, onOpen }: { item: GuidanceListItem; onOpen: () => void }) {
  return (
    <button className="guide-row" onClick={onOpen} aria-label={`View ${item.title}`}>
      <span className="guide-index">{String(item.id).padStart(2, '0')}</span>
      <span className="guide-row-copy">
        <span className="guide-category">{item.category} <span>·</span> {item.topic}</span>
        <span className="guide-title">{item.title}</span>
        <span className="guide-summary">{item.summary}</span>
      </span>
      <span className="guide-source-meta">Checked {item.last_verified}</span>
      <ArrowUpRight size={16} aria-hidden="true" />
    </button>
  )
}
