import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get('symbol')

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 })
  }

  try {
    // Dynamic import to avoid SSR issues
    const yahooFinance = (await import('yahoo-finance2')).default
    const quote = await yahooFinance.quote(symbol)

    return NextResponse.json({
      symbol: quote.symbol,
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      previousClose: quote.regularMarketPreviousClose,
      volume: quote.regularMarketVolume,
      avgVolume: quote.averageDailyVolume10Day,
      marketCap: quote.marketCap,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      source: 'Yahoo Finance (real-time)'
    })
  } catch (error) {
    console.error('Yahoo Finance error:', error)
    return NextResponse.json({ error: 'Failed to fetch quote' }, { status: 500 })
  }
}
