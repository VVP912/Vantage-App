'use client'

import { useEffect, useState } from 'react'

interface Props {
  onStart: () => void
}

export default function TitleScreen({ onStart }: Props) {
  const [cursorOn, setCursorOn] = useState(true)

  useEffect(() => {
    const id = setInterval(() => setCursorOn((c) => !c), 600)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="screen-dark flex flex-col items-center justify-center min-h-screen px-6 text-center" style={{ position: 'relative', overflow: 'hidden' }}>

      {/* Signature element: a faint coordinate/tracking readout in the
          corner, evoking satellite telemetry — the one piece of bold
          decoration on an otherwise quiet, disciplined page */}
      <div
        style={{
          position: 'absolute', top: 18, left: 20,
          fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.05em',
          textAlign: 'left', lineHeight: 1.6,
        }}
      >
        <div>SCANNING_EQUITIES :: 6 ACTIVE</div>
        <div>SIGNAL_SOURCES :: 8 LIVE</div>
      </div>
      <div
        style={{
          position: 'absolute', top: 18, right: 20,
          fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.05em',
        }}
      >
        {new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC
      </div>

      <div
        style={{
          fontSize: 11,
          letterSpacing: '0.22em',
          color: 'var(--phosphor)',
          textTransform: 'uppercase',
          marginBottom: 18,
        }}
      >
        ▸ The information asymmetry experiment
      </div>

      <h1
        style={{
          fontSize: 68,
          fontWeight: 600,
          letterSpacing: '0.08em',
          color: 'var(--text-primary)',
          lineHeight: 1,
          marginBottom: 4,
          textShadow: '0 0 40px var(--phosphor-glow)',
        }}
      >
        VANTAGE
      </h1>
      <div style={{ fontSize: 13, color: 'var(--phosphor)', marginBottom: 20, letterSpacing: '0.04em' }}>
        {cursorOn ? '█' : ' '}
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: '0.02em' }}>
        Six stocks. All analyst-rated Buy. 60 seconds to trade.
      </p>

      <p
        style={{
          fontSize: 13,
          color: 'var(--text-tertiary)',
          lineHeight: 1.8,
          maxWidth: 440,
          marginBottom: 36,
        }}
      >
        Every stock heading into earnings is rated Buy by Wall Street.
        Consensus is bullish across the board.
        <br />
        <br />
        The hedge fund on the other side has satellite imagery, credit card
        data, job posting feeds, and shipping volumes. It has the vantage
        point. It knows which analyst notes are wrong.
        <br />
        <br />
        <span style={{ color: 'var(--text-secondary)' }}>You don&apos;t.</span>
      </p>

      <button
        onClick={onStart}
        style={{
          padding: '13px 40px',
          background: 'var(--phosphor)',
          color: '#08100a',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          boxShadow: '0 0 24px var(--phosphor-glow), 0 4px 0 rgba(0,0,0,0.3)',
          transition: 'transform 0.15s ease',
        }}
        onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(2px)' }}
        onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
      >
        Start trading ↗
      </button>

      <div
        style={{
          marginTop: 26,
          padding: '9px 16px',
          background: 'var(--bear-dim)',
          border: '1px solid rgba(255,71,71,0.3)',
          borderRadius: 4,
          fontSize: 11,
          color: 'var(--bear)',
          letterSpacing: '0.04em',
        }}
      >
        All six stocks are rated Buy. Not all six will beat earnings.
      </div>
    </div>
  )
}
