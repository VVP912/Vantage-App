import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get('symbol')

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 })
  }

  try {
    // yahoo-finance2 v2's default export is a class that must be
    // instantiated with `new` before use — using the bare default
    // export directly (the old v1-style singleton pattern) breaks
    // TypeScript's method `this`-context resolution for every call.
    const YahooFinance = (await import('yahoo-finance2')).default
    const yahooFinance = new YahooFinance()
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
