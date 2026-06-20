import { NextRequest, NextResponse } from 'next/server'
import { runPredictiveModel, SignalInputs, SIGNAL_WEIGHTS } from '@/lib/predictiveModel'
import { assessRisk } from '@/lib/riskManagement'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    insiderData, redditData, newsData, quoteData,
    footTrafficData, satelliteData
  } = body

  // Fetch the Bybit macro signal server-side so the predictive model
  // always has the freshest reading, independent of whatever the
  // client already cached for the signal cards.
  let cryptoMacroScore: number | null = null
  try {
    const cryptoRes = await fetch(`${req.nextUrl.origin}/api/crypto-sentiment`)
    const cryptoData = await cryptoRes.json()
    cryptoMacroScore = cryptoData?.available ? cryptoData.macroScore : null
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
