'use client'

interface Props {
  onStart: () => void
}

export default function TitleScreen({ onStart }: Props) {
  return (
    <div className="screen-dark flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <div
        style={{
          fontSize: 11,
          letterSpacing: '0.18em',
          color: '#e94560',
          textTransform: 'uppercase',
          marginBottom: 16,
          fontFamily: 'Courier New, monospace',
        }}
      >
        The information asymmetry experiment
      </div>

      <h1
        style={{
          fontSize: 64,
          fontWeight: 500,
          letterSpacing: '0.06em',
          color: '#fff',
          lineHeight: 1,
          marginBottom: 8,
          fontFamily: 'Courier New, monospace',
        }}
      >
        VANTAGE
      </h1>

      <p style={{ fontSize: 13, color: '#a8a9b4', marginBottom: 12 }}>
        Six stocks. All analyst-rated Buy. 90 seconds to trade.
      </p>

      <p
        style={{
          fontSize: 13,
          color: '#54577a',
          lineHeight: 1.8,
          maxWidth: 420,
          marginBottom: 32,
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
        You don&apos;t.
      </p>

      <button
        onClick={onStart}
        style={{
          padding: '12px 36px',
          background: '#e94560',
          color: '#fff',
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: 'Courier New, monospace',
        }}
      >
        Start trading ↗
      </button>

      <div
        style={{
          marginTop: 24,
          padding: '8px 14px',
          background: 'rgba(233,69,96,0.12)',
          border: '0.5px solid rgba(233,69,96,0.3)',
          borderRadius: 6,
          fontSize: 11,
          color: '#e94560',
          letterSpacing: '0.04em',
        }}
      >
        All six stocks are rated Buy. Not all six will beat earnings.
      </div>
    </div>
  )
}
