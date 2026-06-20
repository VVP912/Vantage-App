import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get('symbol')

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 })
  }

  try {
    // ApeWisdom — completely free, no API key needed
    // Aggregates: r/wallstreetbets, r/stocks, r/options, r/investing and more
    const res = await fetch(
      `https://apewisdom.io/api/v1.0/filter/all-stocks/page/1`,
      {
        headers: { 'User-Agent': 'Vantage-App/1.0' },
        next: { revalidate: 1800 }, // cache 30 min
      }
    )

    if (!res.ok) throw new Error('ApeWisdom API error')
    const data = await res.json()

    // Find this ticker in the results
    const tickerData = data.results?.find(
      (r: { ticker: string }) => r.ticker === symbol
    )

    if (!tickerData) {
      // Ticker not in top results — low retail interest
      return NextResponse.json({
        symbol,
        found: false,
        rank: null,
        mentions: 0,
        upvotes: 0,
        mentions24hAgo: 0,
        mentionChange: 0,
        rank24hAgo: null,
        retailInterest: 'Low',
        interpretation:
          `${symbol} not trending on Reddit — retail interest below threshold`,
        source: 'ApeWisdom (r/wallstreetbets, r/stocks, r/options) — free, no key',
      })
    }

    const mentionChange =
      tickerData.mentions_24h_ago > 0
        ? Math.round(
            ((tickerData.mentions - tickerData.mentions_24h_ago) /
              tickerData.mentions_24h_ago) *
              100
          )
        : 0

    const rankChange =
      tickerData.rank_24h_ago && tickerData.rank_24h_ago !== tickerData.rank
        ? tickerData.rank_24h_ago - tickerData.rank // positive = moved up in ranking
        : 0

    const retailInterest =
      tickerData.rank <= 10
        ? 'Very high'
        : tickerData.rank <= 25
        ? 'High'
        : tickerData.rank <= 50
        ? 'Moderate'
        : 'Low'

    const interpretation =
      mentionChange > 50
        ? `Mentions surging +${mentionChange}% in 24h — retail FOMO building`
        : mentionChange < -30
        ? `Mentions falling ${mentionChange}% — retail losing interest`
        : mentionChange > 20
        ? `Mentions up ${mentionChange}% — growing retail attention`
        : `Stable retail interest — rank #${tickerData.rank} on Reddit`

    return NextResponse.json({
      symbol,
      found: true,
      rank: tickerData.rank,
      rank24hAgo: tickerData.rank_24h_ago,
      rankChange,
      mentions: tickerData.mentions,
      upvotes: tickerData.upvotes,
      mentions24hAgo: tickerData.mentions_24h_ago,
      mentionChange,
      retailInterest,
      interpretation,
      source: 'ApeWisdom (r/wallstreetbets, r/stocks, r/options) — free, no key',
    })
  } catch (error) {
    console.error('ApeWisdom error:', error)
    return NextResponse.json(
      { error: 'Reddit sentiment unavailable' },
      { status: 500 }
    )
  }
}
