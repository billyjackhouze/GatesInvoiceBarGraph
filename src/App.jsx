import { useState, useEffect, useCallback } from 'react'

const REFRESH_MS = 60_000

// Stage order defines the pipeline sequence
const STAGE_ORDER = ['Preflight', 'Acknowledged', 'Fulfillment', 'Logistics', 'Delivery', 'Signed']

const STAGE_CFG = {
  Preflight:    { color: '#3b82f6', label: 'Preflight',    short: 'PRE'  },
  Acknowledged: { color: '#8b5cf6', label: 'Acknowledged', short: 'ACK'  },
  Fulfillment:  { color: '#f97316', label: 'Fulfillment',  short: 'FULL' },
  Logistics:    { color: '#06b6d4', label: 'Logistics',    short: 'LOG'  },
  Delivery:     { color: '#22c55e', label: 'Delivery',     short: 'DEL'  },
  Signed:       { color: '#eab308', label: 'Signed',       short: 'SGN'  },
  'On Hold':    { color: '#6b7280', label: 'On Hold',      short: 'HOLD' },
}

// Parse FM date M/D/YYYY → JS Date (noon local)
function parseFMDate(str) {
  if (!str) return null
  const [m, d, y] = str.split('/').map(Number)
  if (!m || !d || !y) return null
  return new Date(y, m - 1, d, 12, 0, 0)
}

function formatDate(str) {
  const d = parseFMDate(str)
  if (!d) return str || '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Live clock ─────────────────────────────────────────────────────────────────
function Clock() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')
  useEffect(() => {
    function tick() {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-US', {
        timeZone: 'America/Chicago', hour12: true,
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }) + ' CT')
      setDate(now.toLocaleDateString('en-US', {
        timeZone: 'America/Chicago', weekday: 'short',
        month: 'short', day: 'numeric', year: 'numeric',
      }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="clock-block">
      <div className="clock-time">{time}</div>
      <div className="clock-date">{date}</div>
    </div>
  )
}

// ── Fullscreen button ──────────────────────────────────────────────────────────
function FullscreenButton() {
  const [isFull, setIsFull] = useState(false)
  useEffect(() => {
    const onChange = () => setIsFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggle = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }
  return (
    <button className="fs-btn" onClick={toggle} title={isFull ? 'Exit fullscreen' : 'Enter fullscreen'}>
      {isFull ? '✕' : '⛶'}
      <span className="fs-label">{isFull ? 'EXIT FULL' : 'FULLSCREEN'}</span>
    </button>
  )
}

// ── Header ─────────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header className="header">
      <div className="logo-wrap">
        <img src="/gates_logo.avif" alt="Gates Engineered Lubricants" className="logo-img" />
      </div>
      <div className="title-block">
        <div className="app-title">Invoice Pipeline</div>
        <div className="app-sub">Gates Engineered Lubricants</div>
      </div>
      <Clock />
      <FullscreenButton />
    </header>
  )
}

// ── Status bar ─────────────────────────────────────────────────────────────────
function StatusBar({ connected, asOf }) {
  const [ago, setAgo] = useState('')
  useEffect(() => {
    function compute() {
      if (!asOf) return setAgo('')
      const secs = Math.round((Date.now() - new Date(asOf)) / 1000)
      if (secs < 10)  return setAgo('just now')
      if (secs < 60)  return setAgo(`${secs}s ago`)
      if (secs < 120) return setAgo('1m ago')
      setAgo(`${Math.round(secs / 60)}m ago`)
    }
    compute()
    const id = setInterval(compute, 10_000)
    return () => clearInterval(id)
  }, [asOf])
  return (
    <div className="statusbar">
      <span className={`status-dot ${connected ? 'live' : 'dead'}`} />
      <span className="status-text">
        {connected ? 'Live — updates every minute' : 'Disconnected'}
      </span>
      {ago && <span className="last-update">Updated {ago}</span>}
    </div>
  )
}

// ── Total banner ───────────────────────────────────────────────────────────────
function TotalBanner({ total, stageCounts }) {
  return (
    <div className="total-banner">
      <div className="total-main">
        <span className="total-num">{total}</span>
        <span className="total-label">Active Invoices in Pipeline</span>
      </div>
      <div className="total-chips">
        {STAGE_ORDER.filter(s => stageCounts[s] > 0).map(s => {
          const cfg = STAGE_CFG[s]
          return (
            <span key={s} className="total-chip" style={{ borderColor: cfg.color, color: cfg.color }}>
              {cfg.short} {stageCounts[s]}
            </span>
          )
        })}
        {stageCounts['On Hold'] > 0 && (
          <span className="total-chip" style={{ borderColor: '#6b7280', color: '#6b7280' }}>
            HOLD {stageCounts['On Hold']}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Progress bar ───────────────────────────────────────────────────────────────
function ProgressBar({ currentStage }) {
  const currentIdx = STAGE_ORDER.indexOf(currentStage)
  const isOnHold   = currentStage === 'On Hold'

  if (isOnHold) {
    return (
      <div className="progress-bar">
        <div className="progress-seg hold-seg">
          <span className="seg-label">⏸ ON HOLD</span>
        </div>
      </div>
    )
  }

  return (
    <div className="progress-bar">
      {STAGE_ORDER.map((stage, idx) => {
        const cfg         = STAGE_CFG[stage]
        const isCompleted = idx < currentIdx
        const isCurrent   = idx === currentIdx
        const isFuture    = idx > currentIdx

        return (
          <div
            key={stage}
            className={`progress-seg ${isCompleted ? 'seg-done' : ''} ${isCurrent ? 'seg-active' : ''} ${isFuture ? 'seg-future' : ''}`}
            style={{
              '--seg-color':    cfg.color,
              '--seg-color-dim': cfg.color + '33',
              flex: isCurrent ? '1.4' : '1',
            }}
          >
            {isCompleted && <span className="seg-check">✓</span>}
            <span className="seg-label">{isCurrent ? cfg.label.toUpperCase() : cfg.short}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Invoice row ────────────────────────────────────────────────────────────────
function InvoiceRow({ record }) {
  const cfg     = STAGE_CFG[record.stage] || STAGE_CFG['On Hold']
  const isHold  = record.stage === 'On Hold'
  const isSigned = record.stage === 'Signed'

  return (
    <div className={`inv-row ${isHold ? 'inv-row-hold' : ''}`}
         style={{ '--row-color': cfg.color }}>
      <div className="inv-row-top">
        <div className="inv-info">
          <div className="inv-company">{record.company}</div>
          <div className="inv-meta">
            <span className="inv-number" style={{ color: cfg.color }}>
              #{record.invoiceId}
            </span>
            {record.poNumber && (
              <span className="inv-po">· PO {record.poNumber}</span>
            )}
          </div>
        </div>
        <div className="inv-date-block">
          <div className="inv-date">{formatDate(record.date)}</div>
          {isSigned && record.dateSigned && (
            <div className="inv-signed-date">
              ✓ Signed {formatDate(record.dateSigned)}
            </div>
          )}
        </div>
      </div>
      <ProgressBar currentStage={record.stage} />
    </div>
  )
}

// ── Empty / error ──────────────────────────────────────────────────────────────
function EmptyState({ error }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{error ? '⚠️' : '✅'}</div>
      <div className="empty-label">{error ? 'Failed to load pipeline' : 'No Active Invoices'}</div>
      <div className="empty-sub">{error || 'Board refreshes automatically'}</div>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [stages,    setStages]    = useState([])
  const [total,     setTotal]     = useState(0)
  const [asOf,      setAsOf]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [connected, setConnected] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setStages(data.stages || [])
      setTotal(data.total  || 0)
      setAsOf(data.asOf)
      setConnected(true)
      setError(null)
    } catch (err) {
      setError(err.message)
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  // Flatten all records, sort by date desc, On Hold at bottom
  const allRecords = stages.flatMap(s => s.records)
  const pipeline   = allRecords
    .filter(r => r.stage !== 'On Hold')
    .sort((a, b) => {
      const da = parseFMDate(a.date), db = parseFMDate(b.date)
      return (db || 0) - (da || 0)
    })
  const onHold = allRecords
    .filter(r => r.stage === 'On Hold')
    .sort((a, b) => {
      const da = parseFMDate(a.date), db = parseFMDate(b.date)
      return (db || 0) - (da || 0)
    })
  const sorted = [...pipeline, ...onHold]

  // Stage counts for the summary chips
  const stageCounts = {}
  stages.forEach(s => { stageCounts[s.stage] = s.count })

  let content
  if (loading && stages.length === 0) {
    content = (
      <div className="empty-state">
        <div className="empty-icon" style={{ opacity: 0.3 }}>⏳</div>
        <div className="empty-label">Loading Pipeline…</div>
        <div className="empty-sub">Connecting to GEL Sidekick</div>
      </div>
    )
  } else if (error && stages.length === 0) {
    content = <EmptyState error={error} />
  } else if (sorted.length === 0) {
    content = <EmptyState />
  } else {
    content = sorted.map(r => <InvoiceRow key={r.recordId} record={r} />)
  }

  return (
    <>
      <Header />
      <StatusBar connected={connected} asOf={asOf} />
      {total > 0 && <TotalBanner total={total} stageCounts={stageCounts} />}
      <main className="board">{content}</main>
    </>
  )
}
