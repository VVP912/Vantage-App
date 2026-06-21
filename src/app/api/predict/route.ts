import { NextRequest, NextResponse } from 'next/server'
import { runPredictiveModel, SignalInputs, SIGNAL_WEIGHTS } from '@/lib/predictiveModel'
import { assessRisk } from '@/lib/riskManagement'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    insiderData, redditData, newsData, quoteData,
    footTrafficData, satelliteData
  } = body

  // Fetch the crypto macro signal directly from CoinGecko rather than
  // self-fetching our own /api/crypto-sentiment route — internal
  // serverless-to-serverless calls can be flaky (cold starts, internal
  // routing), and a failure here was silently dropping this signal
  // from the live count with no visibility.
  let cryptoMacroScore: number | null = null
  try {
    const cryptoRes = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true',
      { headers: { Accept: 'application/json' } }
    )
    if (cryptoRes.ok) {
      const prices = await cryptoRes.json()
      const changes: number[] = []
      if (prices?.bitcoin?.usd_24h_change != null) changes.push(prices.bitcoin.usd_24h_change)
      if (prices?.ethereum?.usd_24h_change != null) changes.push(prices.ethereum.usd_24h_change)
      if (changes.length > 0) {
        const avgChange = changes.reduce((s, c) => s + c, 0) / changes.length
        cryptoMacroScore = Math.max(-1, Math.min(1, avgChange / 10))
      }
    }
  } catch {
    cryptoMacroScore = null
  }

  const inputs: SignalInputs = {
    insiderMspr: insiderData?.insiderSentiment?.mspr ?? null,
    edgarVelocity: insiderData?.edgarFilingVelocity?.velocity ?? null,
    redditMentionChange: redditData?.found ? redditData?.mentionChange ?? null : null,
    newsBullishPercent: newsData?.bullishPercent ?? null,
    footTrafficScore: footTrafficData?.aggregateScore ?? null,
    satelliteActivityScore: satelliteData?.available ? satelliteData?.aggregateActivityScore ?? null : null,
    priceChangePercent: quoteData?.changePercent ?? null,
    cryptoMacroScore,
  }

  const prediction = runPredictiveModel(inputs)
  const risk = assessRisk(prediction)

  return NextResponse.json({
    prediction,
    risk,
    methodology: {
      weights: SIGNAL_WEIGHTS,
      note: 'Rule-based weighted model, fixed weights chosen by data-quality rationale (not backtested/optimised) to avoid overfitting on a small demo dataset. Full methodology in src/lib/predictiveModel.ts.',
    },
  })
}
