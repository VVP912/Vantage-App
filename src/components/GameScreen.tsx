'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { STOCKS } from '@/lib/stocks'
import { GameResult, Trade } from '@/app/page'

interface Props {
  onReveal: (result: GameResult) => void
}

const TOTAL = 10000
const GAME_SECS = 60
const POSITION_SIZE = 2000 // hedge fund position per stock

const HEDGE_MSGS = [
  (sym: string, dir: string, sig: string) =>
    `${sym} satellite: facility activity ${sig}. Analyst note ${dir === 'bear' ? 'contradicted' : 'confirmed'} by ground truth.`,
  (sym: string, dir: string, sig: string) =>
    `${sym} CC spend: ${sig}. ${dir === 'bear' ? 'Diverges from bullish consensus.' : 'Confirms analyst Buy rating.'}`,
  (sym: string, dir: string) =>
    `${sym} job postings: ${dir === 'bear' ? 'significant contraction signal' : 'expansion confirmed'}. Acting on data.`,
  (sym: string, dir: string) =>
    `${sym} alt-data consensus: ${dir}. Wall Street: Buy. ${dir === 'bear' ? 'Shorting against the consensus.' : dir === 'bull' ? 'Going long with the consensus.' : 'Staying neutral.'}`,
  (sym: string) =>
    `${sym} shipping volumes cross-referenced with satellite. Position sizing accordingly.`,
]

const MKT_MSGS = [
  'Alternative data contradicts analyst consensus on 3 of 6 names.',
  'Satellite imagery: facility utilisation diverging from sell-side models.',
  'CC spend data: 2 names showing consumer weakness not in estimates.',
  'Smart money positioned against consensus on bearish alt-data names.',
  'Job posting velocity: headcount signals inconsistent with guidance.',
]

export default function GameScreen({ onReveal }: Props) {
  const [cash, setCash] = useState(TOTAL)
  const [holdings, setHoldings] = useState<Record<string, number>>({})
  const [trades, setTrades] = useState<Trade[]>([])
  const [startPrices, setStartPrices] = useState<Record<string, number>>(
    Object.fromEntries(STOCKS.map((s) => [s.sym, s.basePrice]))
  )
  const [prices, setPrices] = useState(
    STOCKS.map((s) => ({ sym: s.sym, cur: s.basePrice, chg: 0 }))
  )
  const [pricesLoaded, setPricesLoaded] = useState(false)
  const [livePriceCount, setLivePriceCount] = useState(0)
  const [selIdx, setSelIdx] = useState(0)
  const [qty, setQty] = useState(3)
  const [timeLeft, setTimeLeft] = useState(GAME_SECS)
  const [log, setLog] = useState<{ msg: string; type: string; t: number }[]>([
    { msg: 'Fetching live opening prices from Yahoo Finance...', type: 'info', t: 0 },
  ])
  const [instMsg, setInstMsg] = useState(
    'Cross-referencing satellite imagery against analyst consensus on all 6 names...'
  )
  const [running, setRunning] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const pricesRef = useRef(prices)
  const cashRef = useRef(cash)
  const holdingsRef = useRef(holdings)
  const tradesRef = useRef(trades)
  const timeRef = useRef(timeLeft)
  const startPricesRef = useRef(startPrices)
  const cmtIdx = useRef(0)
  const msgIdx = useRef(0)

  pricesRef.current = prices
  cashRef.current = cash
  holdingsRef.current = holdings
  tradesRef.current = trades
  timeRef.current = timeLeft
  startPricesRef.current = startPrices

  const addLog = useCallback((msg: string, type: string) => {
    const t = GAME_SECS - timeRef.current
    setLog((prev) => [...prev.slice(-20), { msg, type, t }])
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }, 50)
  }, [])

  // Fetch real Yahoo Finance starting prices on mount, then run the
  // scripted earnings scenario from that real base — grounded in
  // reality, but still tells a reliable story for the demo.
  useEffect(() => {
    const fetchStartPrices = async () => {
      try {
        const res = await fetch('/api/quote-batch')
        const data = await res.json()
        const fetched: Record<string, number> = {}
        let liveCount = 0
        STOCKS.forEach((s) => {
          const q = data.prices?.[s.sym]
          if (q?.price) {
            fetched[s.sym] = q.price
            if (q.live) liveCount++
          } else {
            fetched[s.sym] = s.basePrice
          }
        })
        setStartPrices(fetched)
        setPrices(STOCKS.map((s) => ({ sym: s.sym, cur: fetched[s.sym], chg: 0 })))
        setLivePriceCount(liveCount)
        setPricesLoaded(true)
        setLog([{
          msg: liveCount > 0
            ? `Live prices loaded from Yahoo Finance (${liveCount}/6 real-time). Earnings season open.`
            : 'Using reference prices (Yahoo Finance unavailable). Earnings season open.',
          type: 'info',
          t: 0,
        }])
        setRunning(true)
      } catch {
        setPricesLoaded(true)
        setRunning(true)
        addLog('Using reference prices. Earnings season open.', 'info')
      }
    }
    fetchStartPrices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const endGame = useCallback(() => {
    setRunning(false)
    const finalPrices: Record<string, number> = {}
    const sp = startPricesRef.current
    const p = pricesRef.current
    STOCKS.forEach((s, i) => {
      const base = sp[s.sym] ?? s.basePrice
      finalPrices[s.sym] = base * (1 + s.result)
      p[i] = { sym: s.sym, cur: finalPrices[s.sym], chg: s.result * 100 }
    })
    setPrices([...p])

    let finalCash = cashRef.current
    const h = holdingsRef.current
    STOCKS.forEach((s) => {
      if (h[s.sym] > 0) {
        finalCash += h[s.sym] * finalPrices[s.sym]
      }
    })
    const yourPnL = finalCash - TOTAL

    let hedgePnL = 0
    STOCKS.forEach((s) => {
      if (s.altDataDir === 'bear') {
        hedgePnL += POSITION_SIZE * Math.abs(s.result)
      } else if (s.altDataDir === 'bull') {
        hedgePnL += POSITION_SIZE * s.result
      }
    })

    onReveal({
      yourPnL,
      hedgePnL,
      dataAdvantage: hedgePnL - yourPnL,
      trades: tradesRef.current,
      holdings: holdingsRef.current,
      finalPrices,
    })
  }, [onReveal])

  // Price tick — only once real starting prices have loaded
  useEffect(() => {
    if (!running || !pricesLoaded) return
    const interval = setInterval(() => {
      setPrices((prev) =>
        prev.map((p, i) => {
          const s = STOCKS[i]
          const base = startPricesRef.current[s.sym] ?? s.basePrice
          const move = (Math.random() - 0.5) * s.vol * p.cur
          const drift = (s.result / GAME_SECS) * p.cur * 0.2
          const cur = Math.max(p.cur + move + drift, 1)
          return {
            sym: p.sym,
            cur: parseFloat(cur.toFixed(2)),
            chg: parseFloat((((cur - base) / base) * 100).toFixed(2)),
          }
        })
      )
      if (Math.random() > 0.7) {
        setInstMsg(MKT_MSGS[cmtIdx.current++ % MKT_MSGS.length])
      }
    }, 1500)
    return () => clearInterval(interval)
  }, [running, pricesLoaded])

  // Timer — only counts down once prices have loaded
  useEffect(() => {
    if (!running || !pricesLoaded) return
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval)
          setTimeout(endGame, 100)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [running, pricesLoaded, endGame])

  const placeTrade = (side: 'buy' | 'sell') => {
    const p = prices[selIdx]
    const s = STOCKS[selIdx]
    if (side === 'buy') {
      const cost = qty * p.cur
      if (cost > cashRef.current) {
        addLog(`Insufficient cash for ${qty} ${p.sym}`, 'warn')
        return
      }
      setCash((c) => c - cost)
      setHoldings((h) => ({ ...h, [p.sym]: (h[p.sym] || 0) + qty }))
      addLog(`Bought ${qty} ${p.sym} @ $${p.cur.toFixed(2)} (analyst: Buy)`, 'buy')
    } else {
      const held = holdingsRef.current[p.sym] || 0
      if (held < qty) {
        addLog(`Only ${held} ${p.sym} held`, 'warn')
        return
      }
      setCash((c) => c + qty * p.cur)
      setHoldings((h) => ({ ...h, [p.sym]: h[p.sym] - qty }))
      addLog(`Sold ${qty} ${p.sym} @ $${p.cur.toFixed(2)}`, 'sell')
    }

    const altMsg = HEDGE_MSGS[msgIdx.current++ % HEDGE_MSGS.length]
    const sig = s.altDataDir === 'bear' ? 'down vs Q2' : 'elevated vs Q2'
    setInstMsg(altMsg(p.sym, s.altDataDir, sig))
    setTrades((prev) => [...prev, { side, sym: p.sym, qty, price: p.cur, t: GAME_SECS - timeRef.current }])
  }

  const portVal = () => {
    let v = cash
    for (const [sym, q] of Object.entries(holdings)) {
      if (q > 0) {
        const p = prices.find((p) => p.sym === sym)
        if (p) v += q * p.cur
      }
    }
    return v
  }

  const pv = portVal()
  const pnl = pv - TOTAL
  const pct = ((pnl / TOTAL) * 100).toFixed(1)
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const ss = String(timeLeft % 60).padStart(2, '0')
  const sel = STOCKS[selIdx]
  const selPrice = prices[selIdx]

  if (!pricesLoaded) {
    return (
      <div className="screen-dark" style={{ padding: 16, maxWidth: 1200, margin: '0 auto', minHeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 17, color: 'var(--text-secondary)', marginBottom: 8 }}>Loading live market data...</div>
          <div style={{ fontSize: 15, color: 'var(--text-tertiary)' }}>Fetching real prices from Yahoo Finance</div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen-dark" style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 10, borderBottom: '0.5px solid rgba(255,255,255,0.1)' }}>
        <div>
          <div style={{ fontSize: 15, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Earnings season</div>
          <div style={{ fontSize: 14, color: 'var(--bear)', marginTop: 1 }}>
            All 6 rated Buy · {livePriceCount > 0 ? `${livePriceCount}/6 live prices` : 'reference prices'}
          </div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 500, color: timeLeft <= 15 ? 'var(--bear)' : 'var(--text-primary)' }}>{mm}:{ss}</div>
        <div style={{ fontSize: 15, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: 20, border: '0.5px solid rgba(255,255,255,0.1)' }}>
          ${Math.round(cash).toLocaleString()}
        </div>
      </div>

      {/* Stock tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 10 }}>
        {prices.map((p, i) => (
          <button
            key={p.sym}
            onClick={() => setSelIdx(i)}
            style={{
              background: i === selIdx ? 'var(--phosphor)' : 'var(--bg-panel-raised)',
              border: i === selIdx ? '1px solid var(--phosphor)' : '0.5px solid rgba(255,255,255,0.12)',
              borderRadius: 6, padding: 8, cursor: 'pointer', textAlign: 'center'
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 500, color: i === selIdx ? 'var(--bg-void)' : 'var(--text-primary)' }}>{p.sym}</div>
            <div style={{ fontSize: 15, color: i === selIdx ? 'var(--bg-void)' : (p.chg >= 0 ? 'var(--bull)' : 'var(--bear)'), marginTop: 2 }}>
              ${p.cur.toFixed(0)}
            </div>
            <div style={{ fontSize: 14, color: i === selIdx ? 'rgba(8,11,16,0.7)' : (p.chg >= 0 ? 'var(--bull)' : 'var(--bear)'), marginTop: 1 }}>
              {p.chg >= 0 ? '+' : ''}{p.chg.toFixed(1)}%
            </div>
          </button>
        ))}
      </div>

      {/* Selected stock info */}
      <div style={{ background: 'var(--bg-panel)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-primary)' }}>{sel.sym}</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>{sel.name} · {sel.sector}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--text-primary)' }}>${selPrice.cur.toFixed(2)}</div>
            <div style={{ fontSize: 15, color: selPrice.chg >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
              {selPrice.chg >= 0 ? '+' : ''}{selPrice.chg.toFixed(2)}%
            </div>
          </div>
        </div>
        {/* Analyst strip — green, bullish — always */}
        <div style={{ background: 'rgba(61,220,132,0.1)', border: '0.5px solid rgba(61,220,132,0.3)', borderRadius: 6, padding: 8 }}>
          <div style={{ fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bull)', marginBottom: 3 }}>
            Wall Street consensus — all you can see
          </div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>{sel.analystNote}</div>
          <div style={{ fontSize: 15, color: 'var(--bull)', marginTop: 4, fontWeight: 500 }}>
            Buy · EPS est: {sel.eps} · PT: {sel.priceTarget}
          </div>
        </div>
      </div>

      {/* Trade bar */}
      <div style={{ background: 'var(--bg-panel)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type="number"
            value={qty}
            min={1}
            max={100}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ flex: 1, background: 'var(--bg-void)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '6px 10px', fontSize: 17, color: 'var(--text-primary)', fontFamily: 'Courier New, monospace' }}
          />
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', whiteSpace: 'nowrap', alignSelf: 'center' }}>
            Cost: ${Math.round(qty * selPrice.cur).toLocaleString()}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button
            onClick={() => placeTrade('buy')}
            style={{ padding: 10, borderRadius: 6, fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'var(--bull)', color: '#08100a', border: '1px solid var(--bull)', fontFamily: 'Courier New, monospace' }}
          >
            BUY {sel.sym}
          </button>
          <button
            onClick={() => placeTrade('sell')}
            style={{ padding: 10, borderRadius: 6, fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'var(--bear)', color: '#1a0606', border: '1px solid var(--bear)', fontFamily: 'Courier New, monospace' }}
          >
            SELL {sel.sym}
          </button>
        </div>
      </div>

      {/* Portfolio */}
      <div style={{ background: 'var(--bg-panel)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 26, fontWeight: 500, color: pnl >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
          ${Math.round(pv).toLocaleString()}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>
          Portfolio value · <span style={{ color: pnl >= 0 ? 'var(--bull)' : 'var(--bear)' }}>{pnl >= 0 ? '+' : ''}{pct}%</span>
        </div>
        <div style={{ marginTop: 8 }}>
          {Object.entries(holdings).filter(([, q]) => q > 0).length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--text-tertiary)', paddingTop: 5 }}>No positions</div>
          ) : (
            Object.entries(holdings).filter(([, q]) => q > 0).map(([sym, q]) => {
              const p = prices.find((p) => p.sym === sym)
              const base = startPrices[sym] ?? STOCKS.find((s) => s.sym === sym)?.basePrice ?? 0
              const positionPnL = p ? q * (p.cur - base) : 0
              return (
                <div key={sym} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '4px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{sym}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{q}sh</span>
                  <span style={{ color: positionPnL >= 0 ? 'var(--bull)' : 'var(--bear)', fontWeight: 500 }}>
                    {positionPnL >= 0 ? '+' : ''}${Math.round(positionPnL)}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Hedge fund feed */}
      <div style={{ background: 'rgba(199,146,255,0.1)', border: '0.5px solid rgba(199,146,255,0.35)', borderRadius: 8, padding: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--agentic)', marginBottom: 4 }}>
          Hedge fund — internal alt-data feed
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{instMsg}</div>
      </div>

      {/* Trade log */}
      <div
        ref={logRef}
        style={{ background: 'var(--bg-inset)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 8, maxHeight: 70, overflowY: 'auto' }}
      >
        {log.map((entry, i) => {
          const t = entry.t
          const lmm = String(Math.floor(t / 60)).padStart(2, '0')
          const lss = String(t % 60).padStart(2, '0')
          return (
            <div
              key={i}
              style={{
                fontSize: 14,
                color: entry.type === 'buy' ? 'var(--bull)' : entry.type === 'sell' ? 'var(--bear)' : 'var(--text-secondary)',
                padding: '1px 0',
                lineHeight: 1.5,
              }}
            >
              [{lmm}:{lss}] {entry.msg}
            </div>
          )
        })}
      </div>
    </div>
  )
}
