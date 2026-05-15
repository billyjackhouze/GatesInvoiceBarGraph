import { useState, useEffect, useCallback } from 'react'

const REFRESH_MS = 60_000

// ── Stage config — defines order, color, and icon ─────────────────────────────
const STAGES = [
  { key: 'Preflight',    label: 'PREFLIGHT',    color: '#3b82f6', dark: '#1e3a5f', icon: '🔵' },
  { key: 'Acknowledged', label: 'ACKNOWLEDGED', color: '#8b5cf6', dark: '#2e1f5e', icon: '🟣' },
  { key: 'Fulfillment',  label: 'FULFILLMENT',  color: '#f97316', dark: '#431407', icon: '🟠' },
  { key: 'Logistics',    label: 'LOGISTICS',    color: '#06b6d4', dark: '#083344', icon: '🩵' },
  { key: 'Delivery',     label: 'DELIVERY',     color: '#22c55e', dark: '#052e16', icon: '🟢' },
  { key: 'Signed',       label: 'SIGNED',       color: '#eab308', dark: '#3a2700', icon: '⭐' },
]
const ON_HOLD = { key: 'On Hold', label: 'ON HOLD', color: '#6b7280', dark: '#1f2937', icon: '⏸️' }

function stageConfig(key) {
  return STAGES.find(s => s.key === key) || ON_HOLD
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

// ── Header ─────────────────────────────────────────────────────────────────────
function Header({ total }) {
  return (
    <header className="header">
      <div className="logo-wrap">
        <img src="/gates_logo.avif" alt="Gates Engineered Lubricants" className="logo-img" />
      </div>
      <div className="title-block">
        <div className="app-title">Invoice Pipeline</div>
        <div className="app-sub">Gates Engineered Lubricants{total > 0 ? ` — ${total} Active` : ''}</div>
      </div>
      <Clock />
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

// ── Invoice card ───────────────────────────────────────────────────────────────
function InvoiceCard({ record, stageColor }) {
  return (
    <div className="inv-card" style={{ '--stage-color': stageColor }}>
      <div className="inv-company">{record.company}</div>
      <div className="inv-number">#{record.invoiceId}</div>
      {record.poNumber && (
        <div className="inv-po">PO {record.poNumber}</div>
      )}
    </div>
  )
}

// ── Swim lane ──────────────────────────────────────────────────────────────────
function SwimLane({ stage, records, isOnHold }) {
  const cfg = stageConfig(stage)
  return (
    <section className={`swim-lane ${isOnHold ? 'on-hold-lane' : ''}`}>
      <div
        className="lane-header"
        style={{
          background: `linear-gradient(90deg, ${cfg.color}cc, ${cfg.dark}ee)`,
          borderLeft: `4px solid ${cfg.color}`,
        }}
      >
        <span className="lane-icon">{cfg.icon}</span>
        <span className="lane-name">{cfg.label}</span>
        <span className="lane-count" style={{ background: cfg.color }}>
          {records.length}
        </span>
      </div>
      {records.length === 0 ? (
        <div className="lane-empty">No invoices in this stage</div>
      ) : (
        <div className="lane-cards">
          {records.map(r => (
            <InvoiceCard key={r.recordId} record={r} stageColor={cfg.color} />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Empty / error ──────────────────────────────────────────────────────────────
function EmptyState({ error }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{error ? '⚠️' : '✅'}</div>
      <div className="empty-label">
        {error ? 'Failed to load pipeline' : 'No Active Invoices'}
      </div>
      <div className="empty-sub">
        {error || 'Board refreshes automatically every minute'}
      </div>
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
    setLoading(true)
    try {
      const res = await fetch('/api/pipeline')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setStages(data.stages || [])
      setTotal(data.total || 0)
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

  // Pipeline stages (top) and On Hold (bottom)
  const pipelineStages = stages.filter(s => s.stage !== 'On Hold')
  const onHoldStage    = stages.find(s => s.stage === 'On Hold')

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
  } else {
    content = (
      <>
        {pipelineStages.map(({ stage, records }) => (
          <SwimLane key={stage} stage={stage} records={records} isOnHold={false} />
        ))}
        {onHoldStage && (
          <SwimLane
            key="On Hold"
            stage="On Hold"
            records={onHoldStage.records}
            isOnHold={true}
          />
        )}
      </>
    )
  }

  return (
    <>
      <Header total={total} />
      <StatusBar connected={connected} asOf={asOf} />
      <main className="board">{content}</main>
    </>
  )
}
