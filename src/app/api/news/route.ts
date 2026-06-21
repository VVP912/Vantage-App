import { NextRequest, NextResponse } from 'next/server'

const FINNHUB_KEY = process.env.FINNHUB_API_KEY

// Finnhub's /news-sentiment endpoint is premium-gated — on a free key the
// call succeeds (200 OK) but the sentiment fields come back empty. Rather
// than show a dead "Unknown" badge, we compute a basic, honestly-labeled
// keyword sentiment score from the real headlines Finnhub does return for
// free. This is a simple heuristic, not NLP — it's disclosed as such in
// the response so it's never mistaken for the premium-grade signal.
const BULLISH_WORDS = [
  'beat', 'beats', 'surge', 'surges', 'soar', 'soars', 'rally', 'rallies',
  'jump', 'jumps', 'gain', 'gains', 'upgrade', 'upgraded', 'outperform',
  'record', 'strong', 'growth', 'expand', 'expands', 'optimis', 'bullish',
  'buy rating', 'raises guidance', 'raises forecast', 'tops estimates',
]
const BEARISH_WORDS = [
  'miss', 'misses', 'plunge', 'plunges', 'slump', 'slumps', 'fall', 'falls',
  'drop', 'drops', 'downgrade', 'downgraded', 'underperform', 'weak',
  'decline', 'declines', 'cut', 'cuts', 'layoff', 'layoffs', 'lawsuit',
  'investigation', 'sell rating', 'cuts guidance', 'misses estimates',
  'warns', 'warning', 'recall',
]

function keywordSentiment(headlines: string[]): { bullishPercent: number; bearishPercent: number; basis: number } {
  let bull = 0
  let bear = 0
  for (const h of headlines) {
    const lower = h.toLowerCase()
    if (BULLISH_WORDS.some((w) => lower.includes(w))) bull++
    if (BEARISH_WORDS.some((w) => lower.includes(w))) bear++
  }
  const total = bull + bear
  if (total === 0) return { bullishPercent: 0.5, bearishPercent: 0.5, basis: 0 }
  return {
    bullishPercent: parseFloat((bull / total).toFixed(2)),
    bearishPercent: parseFloat((bear / total).toFixed(2)),
    basis: total,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get('symbol')

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 })
  }

  if (!FINNHUB_KEY) {
    return NextResponse.json({ error: 'Finnhub API key not configured' }, { status: 500 })
  }

  try {
    const to = new Date().toISOString().split('T')[0]
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    const res = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_KEY}`,
      { next: { revalidate: 900 } }
    )

    const articles = await res.json()

    // Get news sentiment score (premium-gated on free keys — see note above)
    const sentimentRes = await fetch(
      `https://finnhub.io/api/v1/news-sentiment?symbol=${symbol}&token=${FINNHUB_KEY}`,
      { next: { revalidate: 900 } }
    )
    const sentimentData = await sentimentRes.json()

    const topArticles = articles.slice(0, 5).map((a: {
      headline: string
      summary: string
      source: string
      datetime: number
      url: string
    }) => ({
      headline: a.headline,
      summary: a.summary?.substring(0, 200),
      source: a.source,
      datetime: new Date(a.datetime * 1000).toLocaleDateString(),
      url: a.url,
    }))

    const premiumBullish = sentimentData.sentiment?.bullishPercent
    const premiumBearish = sentimentData.sentiment?.bearishPercent
    const hasPremiumSentiment = premiumBullish != null && premiumBearish != null

    let bullishPercent = premiumBullish
    let bearishPercent = premiumBearish
    let sentimentSource: 'finnhub_premium' | 'keyword_heuristic' | 'unavailable' = 'unavailable'
    let sentimentBasis = 0

    if (hasPremiumSentiment) {
      sentimentSource = 'finnhub_premium'
    } else {
      const headlines: string[] = Array.isArray(articles) ? articles.map((a: { headline: string }) => a.headline).filter(Boolean) : []
      if (headlines.length > 0) {
        const kw = keywordSentiment(headlines)
        if (kw.basis > 0) {
          bullishPercent = kw.bullishPercent
          bearishPercent = kw.bearishPercent
          sentimentSource = 'keyword_heuristic'
          sentimentBasis = kw.basis
        }
      }
    }

    return NextResponse.json({
      symbol,
      articles: topArticles,
      sentiment: sentimentData,
      bullishPercent,
      bearishPercent,
      sentimentSource,
      sentimentBasis,
      articleCount: articles.length,
      source: hasPremiumSentiment
        ? 'Finnhub.io (premium news sentiment)'
        : 'Finnhub.io free tier (headlines) + basic keyword sentiment heuristic',
    })
  } catch (error) {
    console.error('Finnhub news error:', error)
    return NextResponse.json({ error: 'News data unavailable' }, { status: 500 })
  }
}
