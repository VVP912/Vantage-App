import { NextResponse } from 'next/server'

/**
 * VANTAGE crypto macro sentiment signal (Bybit v5 public market data)
 *
 * This is NOT a crypto trading feature — VANTAGE trades equities, not
 * crypto. This route uses Bybit's public, no-auth-required market data
 * (BTCUSDT and ETHUSDT perpetual tickers) as an eighth macro-context
 * signal: crypto funding rates and 24h price action are a genuine,
 * widely-used institutional proxy for market-wide risk appetite.
 *
 * Why this is a real signal and not a stretch: a strongly positive
 * perpetual funding rate means leveraged long positioning is crowded
 * (longs are paying shorts to stay in the trade), which historically
 * correlates with broader "risk-on" euphoria across both crypto and
 * equities. A sharply negative funding rate or a large 24h drawdown
 * signals risk-off / deleveraging pressure that often bleeds into
 * equity markets too. Desks already watch this; it's a legitimate,
 * free, real-time macro input — not a stock-specific signal, so it's
 * weighted lightly in the predictive model relative to the
 * stock-specific signals.
 *
 * No API key required — these are Bybit's public V5 market endpoints.
 */

const BYBIT_BASE = 'https://api.bybit.com/v5/market/tickers'

interface BybitTicker {
  symbol: string
  lastPrice: string
  price24hPcnt: string
  fundingRate: string
  volume24h: string
}

async function fetchTicker(symbol: string): Promise<BybitTicker | null> {
  try {
    const res = await fetch(`${BYBIT_BASE}?category=linear&symbol=${symbol}`, {
      headers: { 'User-Agent': 'Vantage-App/1.0' },
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.retCode !== 0 || !data.result?.list?.length) return null
    return data.result.list[0] as BybitTicker
  } catch {
    return null
  }
}

function interpretFundingRate(rate: number): string {
  if (rate > 0.0008) return 'Elevated positive funding — leveraged long crowding, risk-on euphoria signal'
  if (rate > 0.0002) return 'Mildly positive funding — modest long bias'
  if (rate < -0.0008) return 'Elevated negative funding — leveraged short crowding, risk-off pressure'
  if (rate < -0.0002) return 'Mildly negative funding — modest short bias'
  return 'Neutral funding — balanced long/short positioning'
}

export async function GET() {
  const [btc, eth] = await Promise.all([
    fetchTicker('BTCUSDT'),
    fetchTicker('ETHUSDT'),
  ])

  if (!btc && !eth) {
    return NextResponse.json({
      available: false,
      message: 'Bybit market data unavailable — using neutral macro signal as fallback.',
      source: 'Bybit V5 public API (no key required)',
    })
  }

  const tickers = [btc, eth].filter((t): t is BybitTicker => t !== null)

  const avgFundingRate = tickers.reduce((sum, t) => sum + parseFloat(t.fundingRate), 0) / tickers.length
  const avgPrice24hPcnt = tickers.reduce((sum, t) => sum + parseFloat(t.price24hPcnt), 0) / tickers.length

  // Composite macro risk-appetite score in roughly [-1, 1] — combines
  // funding rate positioning with 24h price action across BTC and ETH.
  const macroScore = Math.max(-1, Math.min(1, avgFundingRate * 300 + avgPrice24hPcnt * 2))

  return NextResponse.json({
    available: true,
    source: 'Bybit V5 public market data (BTCUSDT + ETHUSDT perpetuals, no auth required)',
    macroScore: parseFloat(macroScore.toFixed(3)),
    interpretation: interpretFundingRate(avgFundingRate),
    detail: tickers.map((t) => ({
      symbol: t.symbol,
      lastPrice: parseFloat(t.lastPrice),
      change24hPercent: parseFloat((parseFloat(t.price24hPcnt) * 100).toFixed(2)),
      fundingRate: parseFloat(t.fundingRate),
      fundingRatePercent: parseFloat((parseFloat(t.fundingRate) * 100).toFixed(4)),
    })),
    note: 'Used as a macro risk-appetite context signal, not a stock-specific signal. VANTAGE trades equities — this is crypto market positioning data used the way institutional desks use it: as a broader risk-on/risk-off gauge that often correlates with equity market behaviour.',
  })
}
