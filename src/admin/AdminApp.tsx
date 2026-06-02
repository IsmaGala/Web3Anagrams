// WordChain CM Admin Panel
// Protected by ADMIN_SECRET header. Authenticate once per session.

import { useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Balances { gems: number; hints: number }

interface Inventory {
  ownedSkins:      string[]
  unlockedPremium: string[]
  eventUnlocks:    Array<{ worldId: string; weekId: number }>
}

interface Transaction {
  id:          number
  gems_delta:  number
  hints_delta: number
  reason:      string
  metadata:    Record<string, unknown>
  created_at:  string
}

interface PlayerData {
  address:            string
  balances:           Balances
  inventory:          Inventory
  recentTransactions: Transaction[]
  lastSyncedAt:       string | null
}

// ── Skin / World catalogs (mirror of src/skins/index.ts + worldData.ts) ───────

const SKIN_IDS = ['default', 'cybernetic', 'deep-sea', 'blood', 'patriot']

const WORLD_IDS = [
  'townstar', 'mirandus', 'galaswap', 'eternalnight',
  'area51', 'area515', 'flags', 'asimov', 'nature',
]

// ── API helper ────────────────────────────────────────────────────────────────

async function adminPost(secret: string, action: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/admin/${action}`, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-admin-secret': secret,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: 'ok' | 'err' }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 500,
      background: type === 'ok' ? '#16a34a' : '#dc2626', color: '#fff',
      boxShadow: '0 4px 12px rgba(0,0,0,.4)',
    }}>
      {message}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: '#9ca3af' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function Badge({ label, color = '#374151' }: { label: string; color?: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 12, background: color, color: '#fff', marginRight: 4, marginBottom: 4,
    }}>
      {label}
    </span>
  )
}

function ActionRow({
  label, onSubmit, children,
}: {
  label: string
  onSubmit: () => void
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
      <span style={{ minWidth: 130, fontSize: 13, color: '#d1d5db' }}>{label}</span>
      {children}
      <button onClick={onSubmit} style={btnStyle('#2563eb')}>Apply</button>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
  color: '#f9fafb', padding: '6px 10px', fontSize: 13, width: 90,
}

const selectStyle: React.CSSProperties = {
  ...inputStyle, width: 'auto', cursor: 'pointer',
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg, color: '#fff', border: 'none', borderRadius: 6,
    padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
  }
}

// ── Login screen ──────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (secret: string) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      // Verify the secret by hitting lookup-player with a dummy address.
      // 400 = secret accepted, address invalid — that's fine.
      // 401 = wrong secret.
      const res = await fetch('/api/admin/lookup-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': value },
        body: JSON.stringify({ address: '0x0' }),
      })
      if (res.status === 401) {
        setError('Wrong password.')
        return
      }
      sessionStorage.setItem('cm_secret', value)
      onLogin(value)
    } catch {
      setError('Could not reach server.')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#111827', fontFamily: 'system-ui, sans-serif',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#1f2937', padding: 32, borderRadius: 12, width: 320,
        boxShadow: '0 8px 32px rgba(0,0,0,.5)',
      }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 20, color: '#f9fafb' }}>CM Panel</h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#9ca3af' }}>WordChain · Admin Access</p>
        <input
          type="password"
          placeholder="Admin secret"
          value={value}
          onChange={e => setValue(e.target.value)}
          autoFocus
          style={{ ...inputStyle, width: '100%', marginBottom: 12, boxSizing: 'border-box' }}
        />
        {error && <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 10px' }}>{error}</p>}
        <button type="submit" style={{ ...btnStyle('#2563eb'), width: '100%', padding: '8px 0' }}>
          Sign In
        </button>
      </form>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AdminApp() {
  const [secret, setSecret] = useState<string | null>(() => sessionStorage.getItem('cm_secret'))
  const [searchAddr, setSearchAddr] = useState('')
  const [player, setPlayer]   = useState<PlayerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast]     = useState<{ message: string; type: 'ok' | 'err' } | null>(null)

  // Resource input state
  const [grantGems,  setGrantGems]  = useState('')
  const [grantHints, setGrantHints] = useState('')
  const [takeGems,   setTakeGems]   = useState('')
  const [takeHints,  setTakeHints]  = useState('')
  const [skinId,     setSkinId]     = useState(SKIN_IDS[1])
  const [worldId,    setWorldId]    = useState(WORLD_IDS[0])
  const [levelWorld, setLevelWorld] = useState(WORLD_IDS[0])
  const [levelIdx,   setLevelIdx]   = useState('0')
  const [levelScore, setLevelScore] = useState('100')

  const showToast = useCallback((message: string, type: 'ok' | 'err') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  async function act(action: string, body: Record<string, unknown>, successMsg: string) {
    if (!secret || !player) return
    try {
      const data = await adminPost(secret, action, { address: player.address, ...body })
      showToast(successMsg, 'ok')
      // Refresh player data after any mutation
      const refreshed = await adminPost(secret, 'lookup-player', { address: player.address })
      setPlayer(refreshed)
      return data
    } catch (e: any) {
      showToast(e.message ?? 'Error', 'err')
    }
  }

  async function lookupPlayer() {
    if (!secret || !searchAddr.trim()) return
    setLoading(true)
    try {
      const data = await adminPost(secret, 'lookup-player', { address: searchAddr.trim() })
      setPlayer(data)
    } catch (e: any) {
      showToast(e.message ?? 'Player not found', 'err')
      setPlayer(null)
    } finally {
      setLoading(false)
    }
  }

  if (!secret) {
    return <LoginScreen onLogin={setSecret} />
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#111827', color: '#f9fafb',
      fontFamily: 'system-ui, sans-serif', padding: '24px 32px',
    }}>
      {toast && <Toast {...toast} />}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>CM Panel</h1>
          <span style={{ fontSize: 12, color: '#6b7280' }}>WordChain · Community Manager</span>
        </div>
        <button onClick={() => { sessionStorage.removeItem('cm_secret'); setSecret(null) }} style={btnStyle('#374151')}>
          Sign Out
        </button>
      </div>

      {/* Player Search */}
      <div style={{ background: '#1f2937', borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            placeholder="0x wallet address"
            value={searchAddr}
            onChange={e => setSearchAddr(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && lookupPlayer()}
            style={{ ...inputStyle, flex: 1, width: 'auto' }}
          />
          <button onClick={lookupPlayer} disabled={loading} style={btnStyle('#2563eb')}>
            {loading ? 'Loading…' : 'Look Up'}
          </button>
        </div>
      </div>

      {/* Player Card */}
      {player && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* Left: Info + Inventory */}
          <div>
            <div style={{ background: '#1f2937', borderRadius: 10, padding: 20, marginBottom: 20 }}>
              <Section title="Player">
                <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6b7280', wordBreak: 'break-all' }}>
                  {player.address}
                </p>
                {player.lastSyncedAt && (
                  <p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>
                    Last sync: {new Date(player.lastSyncedAt).toLocaleString()}
                  </p>
                )}
              </Section>

              <Section title="Balances">
                <div style={{ display: 'flex', gap: 20 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#fbbf24' }}>{player.balances.gems}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>GEMS</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#60a5fa' }}>{player.balances.hints}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>HINTS</div>
                  </div>
                </div>
              </Section>

              <Section title="Owned Skins">
                {player.inventory.ownedSkins.length === 0
                  ? <span style={{ fontSize: 12, color: '#6b7280' }}>None</span>
                  : player.inventory.ownedSkins.map(s => <Badge key={s} label={s} color="#7c3aed" />)
                }
              </Section>

              <Section title="Unlocked Worlds">
                {player.inventory.unlockedPremium.length === 0
                  ? <span style={{ fontSize: 12, color: '#6b7280' }}>None</span>
                  : player.inventory.unlockedPremium.map(w => <Badge key={w} label={w} color="#0369a1" />)
                }
              </Section>
            </div>

            {/* Recent Transactions */}
            <div style={{ background: '#1f2937', borderRadius: 10, padding: 20 }}>
              <Section title="Recent Transactions">
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#6b7280', textAlign: 'left' }}>
                      <th style={{ paddingBottom: 6 }}>Date</th>
                      <th style={{ paddingBottom: 6 }}>Reason</th>
                      <th style={{ paddingBottom: 6, textAlign: 'right' }}>Gems</th>
                      <th style={{ paddingBottom: 6, textAlign: 'right' }}>Hints</th>
                    </tr>
                  </thead>
                  <tbody>
                    {player.recentTransactions.length === 0 && (
                      <tr><td colSpan={4} style={{ color: '#4b5563', paddingTop: 8 }}>No transactions</td></tr>
                    )}
                    {player.recentTransactions.map(tx => (
                      <tr key={tx.id} style={{ borderTop: '1px solid #374151' }}>
                        <td style={{ padding: '5px 0', color: '#9ca3af' }}>
                          {new Date(tx.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '5px 8px 5px 0' }}>{tx.reason}</td>
                        <td style={{ padding: '5px 0', textAlign: 'right', color: tx.gems_delta >= 0 ? '#4ade80' : '#f87171' }}>
                          {tx.gems_delta > 0 ? '+' : ''}{tx.gems_delta}
                        </td>
                        <td style={{ padding: '5px 0', textAlign: 'right', color: tx.hints_delta >= 0 ? '#60a5fa' : '#f87171' }}>
                          {tx.hints_delta > 0 ? '+' : ''}{tx.hints_delta}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            </div>
          </div>

          {/* Right: Actions */}
          <div style={{ background: '#1f2937', borderRadius: 10, padding: 20 }}>
            <Section title="Grant Resources">
              <ActionRow
                label="Grant Gems"
                onSubmit={() => act('grant-gems', { gems: Number(grantGems) || 0 }, `Granted ${grantGems} gems ✓`)}
              >
                <input type="number" min="1" placeholder="amount" value={grantGems} onChange={e => setGrantGems(e.target.value)} style={inputStyle} />
                <span style={{ fontSize: 12, color: '#fbbf24' }}>gems</span>
              </ActionRow>

              <ActionRow
                label="Grant Hints"
                onSubmit={() => act('grant-gems', { hints: Number(grantHints) || 0 }, `Granted ${grantHints} hints ✓`)}
              >
                <input type="number" min="1" placeholder="amount" value={grantHints} onChange={e => setGrantHints(e.target.value)} style={inputStyle} />
                <span style={{ fontSize: 12, color: '#60a5fa' }}>hints</span>
              </ActionRow>
            </Section>

            <Section title="Take Resources">
              <ActionRow
                label="Take Gems"
                onSubmit={() => act('take-gems', { gems: Number(takeGems) || 0 }, `Deducted ${takeGems} gems ✓`)}
              >
                <input type="number" min="1" placeholder="amount" value={takeGems} onChange={e => setTakeGems(e.target.value)} style={inputStyle} />
                <span style={{ fontSize: 12, color: '#fbbf24' }}>gems</span>
              </ActionRow>

              <ActionRow
                label="Take Hints"
                onSubmit={() => act('take-gems', { hints: Number(takeHints) || 0 }, `Deducted ${takeHints} hints ✓`)}
              >
                <input type="number" min="1" placeholder="amount" value={takeHints} onChange={e => setTakeHints(e.target.value)} style={inputStyle} />
                <span style={{ fontSize: 12, color: '#60a5fa' }}>hints</span>
              </ActionRow>
            </Section>

            <Section title="Grant Skin">
              <ActionRow
                label="Skin"
                onSubmit={() => act('grant-skin', { skinId }, `Skin "${skinId}" granted ✓`)}
              >
                <select value={skinId} onChange={e => setSkinId(e.target.value)} style={selectStyle}>
                  {SKIN_IDS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </ActionRow>
            </Section>

            <Section title="Unlock World">
              <ActionRow
                label="World"
                onSubmit={() => act('unlock-world', { worldId }, `World "${worldId}" unlocked ✓`)}
              >
                <select value={worldId} onChange={e => setWorldId(e.target.value)} style={selectStyle}>
                  {WORLD_IDS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </ActionRow>
            </Section>

            <Section title="Complete Level">
              <ActionRow
                label="World / Level"
                onSubmit={() => act(
                  'complete-level',
                  { worldId: levelWorld, levelIndex: Number(levelIdx), score: Number(levelScore) },
                  `Level ${levelWorld}[${levelIdx}] marked complete ✓`
                )}
              >
                <select value={levelWorld} onChange={e => setLevelWorld(e.target.value)} style={selectStyle}>
                  {WORLD_IDS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <input type="number" min="0" placeholder="idx" value={levelIdx} onChange={e => setLevelIdx(e.target.value)} style={{ ...inputStyle, width: 60 }} />
                <input type="number" min="0" placeholder="score" value={levelScore} onChange={e => setLevelScore(e.target.value)} style={{ ...inputStyle, width: 70 }} />
              </ActionRow>
            </Section>

            {/* Danger Zone */}
            <div style={{ borderTop: '1px solid #374151', paddingTop: 20, marginTop: 8 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: '#ef4444' }}>
                Danger Zone
              </h3>
              <button
                style={btnStyle('#7f1d1d')}
                onClick={() => {
                  if (!confirm(`Reset ALL data for ${player.address}?\n\nThis deletes balances, inventory, progress, and rounds. It cannot be undone.`)) return
                  act('reset-player', {}, 'Player reset ✓').then(() => setPlayer(null))
                }}
              >
                Reset Player
              </button>
              <p style={{ margin: '8px 0 0', fontSize: 11, color: '#6b7280' }}>
                Wipes balances, inventory, scores, play rounds, and profile.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
