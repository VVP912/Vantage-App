import { NextResponse } from 'next/server'

/**
 * VANTAGE crypto macro sentiment signal (CoinGecko free public API)
 *
 * This is NOT a crypto trading feature — VANTAGE trades equities, not
 * crypto. This route uses CoinGecko's free, no-auth-required public API
 * (BTC and ETH 24h price action) as an eighth macro-context signal:
 * broad crypto price momentum is a genuine, widely-used proxy for
 * market-wide risk appetite that often correlates with equity behaviour.
 *
 * Originally built on Bybit's public V5 API, but Bybit's infrastructure
 * blocks requests from major cloud-provider IP ranges (including AWS,
 * which powers Vercel's serverless functions) at the network/CDN level
 * — confirmed independently across multiple platforms reporting the
 * identical issue. CoinGecko's keyless public API has no such
 * restriction and is built specifically for this kind of use case.
 *
 * No API key required.
 */

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3/simple/price'

interface CoinGeckoPrice {
  usd: number
  usd_24h_change: number
}

async function fetchPrices(): Promise<Record<string, CoinGeckoPrice> | null> {
  try {
    const res = await fetch(
      `${COINGECKO_BASE}?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true`,
      {
        headers: { Accept: 'application/json' },
        next: { revalidate: 60 },
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data.bitcoin && !data.ethereum) return null
    return data
  } catch {
    return null
  }
}

function interpretMomentum(avgChange: number): string {
  if (avgChange > 4) return 'Strong positive momentum — broad risk-on conditions across crypto markets'
  if (avgChange > 1) return 'Mild positive momentum — modest risk appetite'
  if (avgChange < -4) return 'Sharp negative momentum — broad risk-off / deleveraging pressure'
  if (avgChange < -1) return 'Mild negative momentum — modest risk aversion'
  return 'Flat — no strong directional momentum in crypto markets'
}

export async function GET() {
  const prices = await fetchPrices()

  if (!prices) {
    return NextResponse.json({
      available: false,
      message: 'Crypto macro data unavailable — using neutral macro signal as fallback.',
      source: 'CoinGecko public API (no key required)',
    })
  }

  const changes: number[] = []
  if (prices.bitcoin) changes.push(prices.bitcoin.usd_24h_change)
  if (prices.ethereum) changes.push(prices.ethereum.usd_24h_change)

  const avgChange = changes.reduce((s, c) => s + c, 0) / changes.length

  // Composite macro risk-appetite score in roughly [-1, 1] from 24h
  // price momentum across BTC and ETH.
  const macroScore = Math.max(-1, Math.min(1, avgChange / 10))

  return NextResponse.json({
    available: true,
    source: 'CoinGecko public API (BTC + ETH 24h price action, no auth required)',
    macroScore: parseFloat(macroScore.toFixed(3)),
    interpretation: interpretMomentum(avgChange),
    detail: [
      prices.bitcoin && { symbol: 'BTC', lastPrice: prices.bitcoin.usd, change24hPercent: parseFloat(prices.bitcoin.usd_24h_change.toFixed(2)) },
      prices.ethereum && { symbol: 'ETH', lastPrice: prices.ethereum.usd, change24hPercent: parseFloat(prices.ethereum.usd_24h_change.toFixed(2)) },
    ].filter(Boolean),
    note: 'Used as a macro risk-appetite context signal, not a stock-specific signal. VANTAGE trades equities — this is crypto market momentum used the way institutional desks use it: as a broader risk-on/risk-off gauge.',
  })
}
