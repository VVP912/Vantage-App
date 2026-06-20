import { NextRequest, NextResponse } from 'next/server'

const FINNHUB_KEY = process.env.FINNHUB_API_KEY

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

    // Get news sentiment score
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

    return NextResponse.json({
      symbol,
      articles: topArticles,
      sentiment: sentimentData,
      bullishPercent: sentimentData.sentiment?.bullishPercent,
      bearishPercent: sentimentData.sentiment?.bearishPercent,
      articleCount: articles.length,
      source: 'Finnhub.io free tier (company news + sentiment)',
    })
  } catch (error) {
    console.error('Finnhub news error:', error)
    return NextResponse.json({ error: 'News data unavailable' }, { status: 500 })
  }
}
