import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, ArrowUpRight, Database, Search, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getDigimon, getFilters, listDigimon } from '../../api/digimon'
import type { DigimonListItem } from '../../api/schemas'
import { ApiError } from '../../api/client'

const PAGE_SIZE = 24
const levelsFallback = ['Fresh', 'In-Training', 'Rookie', 'Champion', 'Ultimate', 'Mega']

export function ExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)
  const q = searchParams.get('q') ?? ''
  const level = searchParams.get('level') ?? ''
  const type = searchParams.get('type') ?? ''
  const attribute = searchParams.get('attribute') ?? ''
  const selectedId = Number(searchParams.get('id')) || null

  const filters = useQuery({ queryKey: ['digimon-filters'], queryFn: ({ signal }) => getFilters(signal), staleTime: 3_600_000, retry: false })
  const list = useQuery({
    queryKey: ['digimon', { q, level, type, attribute, page }],
    queryFn: ({ signal }) => listDigimon({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      ...(q ? { q } : {}),
      ...(level ? { level } : {}),
      ...(type ? { type } : {}),
      ...(attribute ? { attribute } : {}),
    }, signal),
    placeholderData: (previous) => previous,
  })
  const detail = useQuery({
    queryKey: ['digimon', 'detail', selectedId],
    queryFn: ({ signal }) => getDigimon(selectedId ?? 0, signal),
    enabled: selectedId !== null,
    retry: false,
  })

  const levels = filters.data?.levels ?? (filters.isError ? levelsFallback : [])
  const types = filters.data?.types ?? []
  const attributes = filters.data?.attributes ?? []
  const total = list.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    if (page >= pageCount || !list.data) return
    const query = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      ...(q ? { q } : {}),
      ...(level ? { level } : {}),
      ...(type ? { type } : {}),
      ...(attribute ? { attribute } : {}),
    }
    const timer = window.setTimeout(() => {
      void queryClient.prefetchQuery({
        queryKey: ['digimon', { q, level, type, attribute, page: page + 1 }],
        queryFn: ({ signal }) => listDigimon(query, signal),
      })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [attribute, level, list.data, page, pageCount, q, queryClient, type])

  const updateParams = (updates: Record<string, string>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setSearchParams(next)
  }
  const clearFilters = () => {
    setSearchParams(selectedId ? { id: String(selectedId) } : {})
  }
  const closeDrawer = (open: boolean) => {
    if (!open) updateParams({ id: '' })
  }

  return (
    <div className="explorer-page page-container">
      <header className="page-heading explorer-heading">
        <div>
          <span className="eyebrow">FIELD GUIDE · DATABASE</span>
          <h1>Digimon archive<span className="heading-period">.</span></h1>
          <p>Search and explore the creatures in your knowledge base.</p>
        </div>
        <div className="archive-count"><Database size={16} /><strong>{list.isPending ? '—' : total.toLocaleString()}</strong><span>indexed records</span></div>
      </header>

      <div className="explorer-controls">
        <SearchBox key={q} />
        <label>Level
          <select value={level} onChange={(event) => updateParams({ level: event.target.value, page: '' })}>
            <option value="">All levels</option>{levels.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        {types.length > 0 && <label>Type
          <select value={type} onChange={(event) => updateParams({ type: event.target.value, page: '' })}>
            <option value="">All types</option>{types.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>}
        {attributes.length > 0 && <label>Attribute
          <select value={attribute} onChange={(event) => updateParams({ attribute: event.target.value, page: '' })}>
            <option value="">All attributes</option>{attributes.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>}
        {(q || level || type || attribute) && <button className="text-button clear-explorer" onClick={clearFilters}>Clear filters</button>}
      </div>

      {list.isError ? (
        <section className="explorer-state" role="alert">
          <h2>Couldn’t load the archive</h2><p>{list.error instanceof ApiError ? list.error.message : 'Check the API connection and try again.'}</p>
          <button className="button button-primary" onClick={() => void list.refetch()}>Retry</button>
        </section>
      ) : list.isPending ? (
        <div className="digimon-grid" aria-label="Loading Digimon" aria-busy="true">
          {Array.from({ length: 12 }, (_, index) => <div key={index} className="digimon-skeleton" />)}
        </div>
      ) : list.data.items.length === 0 ? (
        <section className="explorer-state">
          <span className="eyebrow">NO MATCHES</span><h2>No Digimon match your filters.</h2><p>Try a different search or clear the selected filters.</p>
          <button className="button button-outline" onClick={clearFilters}>Clear filters</button>
        </section>
      ) : (
        <>
          {total < 150 && <p className="ingest-note" role="status">Only {total} Digimon have been ingested so far. The archive reflects the data currently in the backend.</p>}
          <div className="digimon-grid">
            {list.data.items.map((digimon) => <DigimonCard key={digimon.id} item={digimon} onOpen={() => updateParams({ id: String(digimon.id) })} />)}
          </div>
          <nav className="pagination" aria-label="Archive pages">
            <span>Page {page} of {pageCount} <small>· {total.toLocaleString()} results</small></span>
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
          <Dialog.Content className="digimon-dialog" aria-describedby="digimon-detail-description">
            <Dialog.Close className="icon-button dialog-close" aria-label="Close Digimon details"><X size={18} /></Dialog.Close>
            {detail.isPending ? <div className="detail-loading" role="status"><Dialog.Title className="sr-only">Loading Digimon details</Dialog.Title>Loading Digimon details…</div> : detail.isError ? (
              <div className="detail-error" role="alert">
                <Dialog.Title>{detail.error instanceof ApiError && detail.error.status === 404 ? 'Digimon not found' : 'Couldn’t load details'}</Dialog.Title>
                <p id="digimon-detail-description">{detail.error instanceof ApiError ? detail.error.message : 'Try again in a moment.'}</p>
                {!(detail.error instanceof ApiError && detail.error.status === 404) && <button className="button button-outline" onClick={() => void detail.refetch()}>Retry</button>}
              </div>
            ) : detail.data ? (
              <DigimonDetailView
                digimon={detail.data}
                onAsk={() => navigate('/', { state: { ask: `Tell me about ${detail.data.name}` } })}
              />
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
      <span className="sr-only">Search Digimon</span>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name…" />
      {search && <button type="button" className="icon-button small-icon" aria-label="Clear search" onClick={() => setSearch('')}><X size={15} /></button>}
    </label>
  )
}

function DigimonCard({ item, onOpen }: { item: DigimonListItem; onOpen: () => void }) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <button className="digimon-card" onClick={onOpen} aria-label={`View ${item.name} details`}>
      <span className="card-image">
        {item.image_url && !imageFailed ? (
          <img src={item.image_url} alt="" width="240" height="240" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
        ) : <span className="fallback-avatar" aria-hidden="true">{item.name.slice(0, 1)}</span>}
        <span className="card-index">#{String(item.id).padStart(3, '0')}</span>
      </span>
      <span className="card-copy">
        <span className="card-name">{item.name}<ArrowUpRight size={15} aria-hidden="true" /></span>
        <span className="card-badges">
          {item.level && <span className="level-badge">{item.level}</span>}
          {item.type && <span>{item.type}</span>}
        </span>
      </span>
    </button>
  )
}

function DigimonDetailView({
  digimon,
  onAsk,
}: {
  digimon: { id: number; name: string; level: string | null; type: string | null; attribute: string | null; description: string | null; image_url: string | null }
  onAsk: () => void
}) {
  const badges = [digimon.level, digimon.type, digimon.attribute].filter(Boolean)
  return (
    <div className="detail-view">
      <div className="detail-art">
        {digimon.image_url ? <img src={digimon.image_url} alt={digimon.name} width="360" height="360" decoding="async" referrerPolicy="no-referrer" /> : <span className="fallback-avatar detail-fallback" aria-hidden="true">{digimon.name.slice(0, 1)}</span>}
        <span className="detail-number">ARCHIVE ENTRY · {String(digimon.id).padStart(4, '0')}</span>
      </div>
      <div className="detail-copy">
        <span className="eyebrow">DIGIMON FIELD RECORD</span>
        <Dialog.Title className="detail-name">{digimon.name}<span className="heading-period">.</span></Dialog.Title>
        <div className="detail-badges">{badges.map((badge) => <span className="level-badge" key={badge}>{badge}</span>)}</div>
        <p id="digimon-detail-description">{digimon.description || 'No description is available for this entry yet.'}</p>
        <button className="button button-primary ask-button" onClick={onAsk}>Ask about {digimon.name}<ArrowUpRight size={16} /></button>
        <small>Information sourced from DAPI (digi-api.com).</small>
      </div>
    </div>
  )
}
