import { NextRequest, NextResponse } from 'next/server'

const FINNHUB_KEY = process.env.FINNHUB_API_KEY

// SEC EDGAR CIK mapping
const CIK_MAP: Record<string, string> = {
  NVDA: '0001045810',
  AAPL: '0000320193',
  TSLA: '0001318605',
  META: '0001326801',
  JPM: '0000019617',
  AMZN: '0001018724',
}

async function getFinnhubInsiderSentiment(symbol: string) {
  if (!FINNHUB_KEY) return null
  try {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() - 3, 1)
      .toISOString()
      .split('T')[0]
    const to = now.toISOString().split('T')[0]

    const res = await fetch(
      `https://finnhub.io/api/v1/stock/insider-sentiment?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_KEY}`,
      { next: { revalidate: 3600 } }
    )
    const data = await res.json()

    if (!data.data || data.data.length === 0) return null

    // MSPR = Monthly Share Purchase Ratio — ranges -100 (most negative) to +100 (most positive)
    const latest = data.data[data.data.length - 1]
    const avg =
      data.data.reduce((s: number, d: { mspr: number }) => s + d.mspr, 0) /
      data.data.length

    return {
      mspr: latest.mspr,
      avgMspr: parseFloat(avg.toFixed(1)),
      change: latest.change,
      months: data.data.length,
      interpretation:
        avg > 10
          ? 'Insiders net buying — bullish signal'
          : avg < -10
          ? 'Insiders net selling — bearish signal'
          : 'Insider activity neutral',
      source: 'Finnhub (SEC Form 3/4/5)',
    }
  } catch {
    return null
  }
}

async function getFinnhubInsiderTransactions(symbol: string) {
  if (!FINNHUB_KEY) return null
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${symbol}&token=${FINNHUB_KEY}`,
      { next: { revalidate: 3600 } }
    )
    const data = await res.json()
    if (!data.data || data.data.length === 0) return null

    const recent = data.data.slice(0, 10)
    const buys = recent.filter(
      (t: { transactionCode: string }) => t.transactionCode === 'P'
    )
    const sells = recent.filter(
      (t: { transactionCode: string }) => t.transactionCode === 'S'
    )

    return {
      recentTransactions: recent.length,
      buys: buys.length,
      sells: sells.length,
      netSentiment:
        buys.length > sells.length
          ? 'Net buying'
          : buys.length < sells.length
          ? 'Net selling'
          : 'Balanced',
      latestFilers: recent
        .slice(0, 3)
        .map(
          (t: { name: string; transactionCode: string; share: number }) =>
            `${t.name} (${t.transactionCode === 'P' ? 'bought' : 'sold'} ${Math.abs(t.share).toLocaleString()} shares)`
        ),
      source: 'Finnhub (SEC Form 4)',
    }
  } catch {
    return null
  }
}

async function getEdgarFilingVelocity(symbol: string) {
  const cik = CIK_MAP[symbol]
  if (!cik) return null

  try {
    // SEC EDGAR submissions endpoint — completely free, no API key
    const res = await fetch(
      `https://data.sec.gov/submissions/CIK${cik}.json`,
      {
        headers: {
          'User-Agent': 'Vantage-App contact@vantage-app.io',
          Accept: 'application/json',
        },
        next: { revalidate: 3600 },
      }
    )

    if (!res.ok) return null
    const data = await res.json()

    // Count Form 4 filings in last 90 days
    const filings = data.filings?.recent
    if (!filings) return null

    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const form4Filings = filings.form
      .map((form: string, i: number) => ({
        form,
        date: new Date(filings.filingDate[i]),
        accession: filings.accessionNumber[i],
      }))
      .filter(
        (f: { form: string; date: Date }) =>
          f.form === '4' && f.date > ninetyDaysAgo
      )

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentFilings = form4Filings.filter(
      (f: { date: Date }) => f.date > thirtyDaysAgo
    )

    return {
      filingCount90d: form4Filings.length,
      filingCount30d: recentFilings.length,
      velocity:
        form4Filings.length > 8
          ? 'High'
          : form4Filings.length > 4
          ? 'Moderate'
          : 'Low',
      interpretation:
        form4Filings.length > 8
          ? 'Elevated insider filing activity — significant transactions occurring'
          : form4Filings.length > 4
          ? 'Normal insider filing activity'
          : 'Low insider filing activity — quiet period likely',
      source: 'SEC EDGAR (data.sec.gov) — free, no key',
    }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get('symbol')

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 })
  }

  const [sentiment, transactions, edgarVelocity] = await Promise.all([
    getFinnhubInsiderSentiment(symbol),
    getFinnhubInsiderTransactions(symbol),
    getEdgarFilingVelocity(symbol),
  ])

  return NextResponse.json({
    symbol,
    insiderSentiment: sentiment,
    insiderTransactions: transactions,
    edgarFilingVelocity: edgarVelocity,
    dataSources: [
      'Finnhub.io free tier (insider sentiment MSPR, Form 4 transactions)',
      'SEC EDGAR data.sec.gov (Form 4 filing velocity — free, no API key)',
    ],
  })
}
