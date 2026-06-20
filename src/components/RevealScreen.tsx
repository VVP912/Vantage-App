'use client'

import { useEffect, useState } from 'react'
import { STOCKS } from '@/lib/stocks'
import { GameResult } from '@/app/page'

interface Props {
  result: GameResult
  onEdge: () => void
  onReplay: () => void
}

const POSITION_SIZE = 2000

export default function RevealScreen({ result, onEdge, onReplay }: Props) {
  const [explanation, setExplanation] = useState('')
  const [selectedStock, setSelectedStock] = useState<typeof STOCKS[number] | null>(null)

  const bearNames = STOCKS.filter((s) => s.altDataDir === 'bear')
    .map((s) => s.sym)
    .join(', ')
  const bullNames = STOCKS.filter((s) => s.altDataDir === 'bull')
    .map((s) => s.sym)
    .join(', ')

  useEffect(() => {
    const fetchExplanation = async () => {
      try {
        const res = await fetch('/api/game-reveal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            yourPnL: result.yourPnL,
            hedgePnL: result.hedgePnL,
            dataAdvantage: result.dataAdvantage,
            bearNames,
            bullNames,
          }),
        })

        const reader = res.body?.getReader()
        const dec = new TextDecoder()
        let full = ''

        while (reader) {
          const { done, value } = await reader.read()
          if (done) break
          const lines = dec.decode(value).split('\n').filter((l) => l.startsWith('data: '))
          for (const line of lines) {
            const d = line.slice(6)
            if (d === '[DONE]') break
            try {
              const p = JSON.parse(d)
              if (p.text) {
                full += p.text
                setExplanation(full)
              }
            } catch { /* */ }
          }
        }
      } catch {
        setExplanation(
          `Every stock was rated Buy. But ${bearNames} were about to miss earnings — satellite imagery, credit card data, and job postings all said so. The hedge fund shorted them and went long on ${bullNames} where the data confirmed the bull case. The hedge fund made $${Math.round(result.dataAdvantage)} more than you on the same six stocks. The only difference was data access. VANTAGE closes that gap.`
        )
      }
    }
    fetchExplanation()
  }, [result, bearNames, bullNames])

  const stockRows = STOCKS.map((tk) => {
    const userTrades = result.trades.filter((t) => t.sym === tk.sym)
    const userHolding = result.holdings[tk.sym] || 0
    let userStockPnL = 0

    if (userHolding > 0 && userTrades.filter((t) => t.side === 'buy').length > 0) {
      const buyTrades = userTrades.filter((t) => t.side === 'buy')
      const totalQty = buyTrades.reduce((s, t) => s + t.qty, 0)
      const totalCost = buyTrades.reduce((s, t) => s + t.price * t.qty, 0)
      const avgEntry = totalQty > 0 ? totalCost / totalQty : 0
      const finalP = result.finalPrices[tk.sym] || tk.basePrice
      userStockPnL = userHolding * (finalP - avgEntry)
    }

    const hedgeStockPnL =
      tk.altDataDir === 'bear'
        ? POSITION_SIZE * Math.abs(tk.result)
        : tk.altDataDir === 'bull'
        ? POSITION_SIZE * tk.result
        : 0

    const traded = userTrades.length > 0

    return { tk, userStockPnL, hedgeStockPnL, traded }
  })

  return (
    <div className="screen-dark" style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', padding: '20px 0 12px', borderBottom: '0.5px solid rgba(255,255,255,0.1)', marginBottom: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--bear)', marginBottom: 6 }}>
          The reveal
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 500, color: 'var(--text-primary)' }}>
          Same stocks. Different information.
        </h2>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
          Every stock was rated Buy. The alternative data told a different story on 3 of them.
          The hedge fund knew which 3. You didn&apos;t.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'Your P&L', val: `${result.yourPnL >= 0 ? '+' : ''}$${Math.round(Math.abs(result.yourPnL)).toLocaleString()}`, color: result.yourPnL >= 0 ? 'var(--bull)' : 'var(--bear)', border: 'rgba(255,71,71,0.4)', bg: 'rgba(255,71,71,0.06)' },
          { label: 'Hedge fund P&L', val: `+$${Math.round(result.hedgePnL).toLocaleString()}`, color: 'var(--bull)', border: 'rgba(61,220,132,0.4)', bg: 'rgba(61,220,132,0.06)' },
          { label: 'Data advantage', val: `$${Math.round(result.dataAdvantage).toLocaleString()}`, color: 'var(--phosphor)', border: 'rgba(159,239,0,0.4)', bg: 'rgba(159,239,0,0.06)' },
        ].map((c) => (
          <div key={c.label} style={{ border: `0.5px solid ${c.border}`, background: c.bg, borderRadius: 8, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 500, color: c.color }}>{c.val}</div>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Stock comparison table */}
      <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        Stock-by-stock — you vs the hedge fund <span style={{ textTransform: 'none', color: 'var(--text-tertiary)', fontWeight: 400 }}>· tap a row for detail</span>
      </div>
      <div style={{ marginBottom: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'Courier New, monospace' }}>
          <thead>
            <tr>
              {['Stock', 'Analyst', 'Alt data', 'Result', 'Your P&L', 'Hedge P&L'].map((h) => (
                <th key={h} style={{ fontSize: 9, fontWeight: 500, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '5px 6px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', textAlign: h === 'Stock' || h === 'Analyst' ? 'left' : 'right' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stockRows.map(({ tk, userStockPnL, hedgeStockPnL, traded }) => (
              <tr key={tk.sym} onClick={() => setSelectedStock(tk)} style={{ cursor: 'pointer' }}>
                <td style={{ padding: '7px 6px', borderBottom: '0.5px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)', fontWeight: 500 }}>{tk.sym}</td>
                <td style={{ padding: '7px 6px', borderBottom: '0.5px solid rgba(255,255,255,0.05)', color: 'var(--bull)', fontSize: 10 }}>Buy</td>
                <td style={{ padding: '7px 6px', borderBottom: '0.5px solid rgba(255,255,255,0.05)', color: tk.altDataDir === 'bull' ? 'var(--bull)' : tk.altDataDir === 'bear' ? 'var(--bear)' : 'var(--phosphor)', fontSize: 10, textAlign: 'right' }}>
                  {tk.altDataDir === 'bull' ? 'Bullish' : tk.altDataDir === 'bear' ? 'Bearish' : 'Neutral'}
                </td>
                <td style={{ padding: '7px 6px', borderBottom: '0.5px solid rgba(255,255,255,0.05)', color: tk.result >= 0 ? 'var(--bull)' : 'var(--bear)', fontSize: 10, textAlign: 'right' }}>
                  {tk.result >= 0 ? '+' : ''}{Math.round(tk.result * 100)}%
                </td>
                <td style={{ padding: '7px 6px', borderBottom: '0.5px solid rgba(255,255,255,0.05)', color: traded ? (userStockPnL >= 0 ? 'var(--bull)' : 'var(--bear)') : 'var(--text-tertiary)', textAlign: 'right' }}>
                  {traded ? `${userStockPnL >= 0 ? '+' : ''}$${Math.round(Math.abs(userStockPnL))}` : '—'}
                </td>
                <td style={{ padding: '7px 6px', borderBottom: '0.5px solid rgba(255,255,255,0.05)', color: hedgeStockPnL >= 0 ? 'var(--bull)' : 'var(--text-secondary)', textAlign: 'right' }}>
                  {hedgeStockPnL >= 0 ? '+' : ''}${Math.round(Math.abs(hedgeStockPnL))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* What the hedge fund knew */}
      <div style={{ background: 'rgba(159,239,0,0.06)', border: '0.5px solid rgba(159,239,0,0.3)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--phosphor)', marginBottom: 8 }}>
          What the hedge fund was reading
        </div>
        {STOCKS.filter(s => s.altDataDir === 'bear').map(tk => (
          <div key={tk.sym} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.06)', paddingBottom: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--phosphor)', marginBottom: 3 }}>{tk.sym} — {tk.resultNote}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{tk.hedgeAction}</div>
          </div>
        ))}
        {STOCKS.filter(s => s.altDataDir === 'bull').map(tk => (
          <div key={tk.sym} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.06)', paddingBottom: 6, marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--bull)', marginBottom: 2 }}>{tk.sym} — {tk.resultNote}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{tk.hedgeAction}</div>
          </div>
        ))}
      </div>

      {/* Claude explanation */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, fontFamily: 'Courier New, monospace', whiteSpace: 'pre-wrap' }}>
          {explanation || 'Generating analysis...'}
        </div>
      </div>

      <button
        onClick={onEdge}
        style={{ display: 'block', width: '100%', padding: 13, background: 'var(--bull)', border: 'none', borderRadius: 6, color: 'var(--bg-void)', fontSize: 13, fontWeight: 500, cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontFamily: 'Courier New, monospace' }}
      >
        Get the same data they had ↗
      </button>
      <button
        onClick={onReplay}
        style={{ display: 'block', width: '100%', padding: 10, background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 11, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'Courier New, monospace' }}
      >
        Play again
      </button>

      {/* Per-stock detail modal */}
      {selectedStock && (() => {
        const row = stockRows.find(r => r.tk.sym === selectedStock.sym)!
        const trades = result.trades.filter(t => t.sym === selectedStock.sym)
        const finalPrice = result.finalPrices[selectedStock.sym] || selectedStock.basePrice
        return (
          <div onClick={() => setSelectedStock(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-panel, #111)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: 18, maxWidth: 420, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-primary)' }}>{selectedStock.sym}</div>
                <button onClick={() => setSelectedStock(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 18, cursor: 'pointer', padding: 4 }}>✕</button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 14 }}>{selectedStock.sector} · analyst rated Buy</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 3 }}>Alt data said</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: selectedStock.altDataDir === 'bull' ? 'var(--bull)' : selectedStock.altDataDir === 'bear' ? 'var(--bear)' : 'var(--phosphor)' }}>
                    {selectedStock.altDataDir === 'bull' ? 'Bullish' : selectedStock.altDataDir === 'bear' ? 'Bearish' : 'Neutral'}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 3 }}>Actual result</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: selectedStock.result >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                    {selectedStock.result >= 0 ? '+' : ''}{Math.round(selectedStock.result * 100)}%
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 14, background: 'rgba(159,239,0,0.06)', border: '0.5px solid rgba(159,239,0,0.25)', borderRadius: 8, padding: 10 }}>
                <span style={{ color: 'var(--phosphor)', fontWeight: 500 }}>{selectedStock.resultNote}</span> — {selectedStock.hedgeAction}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 3 }}>Your P&L</div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: row.traded ? (row.userStockPnL >= 0 ? 'var(--bull)' : 'var(--bear)') : 'var(--text-tertiary)' }}>
                    {row.traded ? `${row.userStockPnL >= 0 ? '+' : ''}$${Math.round(Math.abs(row.userStockPnL))}` : 'No position'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 3 }}>Hedge fund P&L</div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--bull)' }}>
                    {row.hedgeStockPnL >= 0 ? '+' : ''}${Math.round(Math.abs(row.hedgeStockPnL))}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Your trades on {selectedStock.sym}</div>
              {trades.length > 0 ? (
                trades.map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '5px 0', borderBottom: i < trades.length - 1 ? '0.5px solid rgba(255,255,255,0.06)' : 'none' }}>
                    <span style={{ color: t.side === 'buy' ? 'var(--bull)' : 'var(--bear)', fontWeight: 500, textTransform: 'uppercase' }}>{t.side}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{t.qty} sh @ ${t.price.toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No trades placed.</div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 10 }}>Final price: ${finalPrice.toFixed(2)}</div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
