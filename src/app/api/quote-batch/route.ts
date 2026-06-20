import { NextRequest, NextResponse } from 'next/server'
import { STOCKS } from '@/lib/stocks'

export async function GET(req: NextRequest) {
  try {
    // yahoo-finance2 v2's default export is a class that must be
    // instantiated with `new` before use — this is the actual fix;
    // the bare default-export-as-singleton pattern (v1-style) is what
    // was breaking TypeScript's overload resolution on every call,
    // regardless of for-loop vs .map() or any other call-site shape.
    const YahooFinance = (await import('yahoo-finance2')).default
    const yahooFinance = new YahooFinance()
    const symbols = STOCKS.map((s) => s.sym)

    const results = await Promise.allSettled(
      symbols.map((sym) => yahooFinance.quote(sym))
    )

    const prices: Record<string, { price: number; changePercent: number; live: boolean }> = {}

    results.forEach((res, i) => {
      const sym = symbols[i]
      const fallback = STOCKS[i].basePrice
      if (res.status === 'fulfilled' && res.value?.regularMarketPrice) {
        prices[sym] = {
          price: res.value.regularMarketPrice,
          changePercent: res.value.regularMarketChangePercent ?? 0,
          live: true,
        }
      } else {
        prices[sym] = {
          price: fallback,
          changePercent: 0,
          live: false,
        }
      }
    })

    return NextResponse.json({
      prices,
      source: 'Yahoo Finance (real-time)',
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Batch quote error:', error)
    // Full fallback to base prices if Yahoo Finance is unreachable
    const prices: Record<string, { price: number; changePercent: number; live: boolean }> = {}
    STOCKS.forEach((s) => {
      prices[s.sym] = { price: s.basePrice, changePercent: 0, live: false }
    })
    return NextResponse.json({
      prices,
      source: 'Fallback (Yahoo Finance unreachable)',
      fetchedAt: new Date().toISOString(),
    })
  }
}
