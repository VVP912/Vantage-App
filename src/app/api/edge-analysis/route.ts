import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// The conviction agent's one tool. Forcing Claude to call this tool —
// rather than just writing prose with a number in it — is what makes
// this a genuine agentic step: Claude must commit to a structured,
// auditable decision (conviction level + which signals it weighted)
// before any analysis text is generated downstream.
const CONVICTION_TOOL: Anthropic.Tool = {
  name: 'set_conviction',
  description: 'Record a conviction assessment for a stock based on how many of the available alternative-data signals agree with each other and with (or against) analyst consensus.',
  input_schema: {
    type: 'object',
    properties: {
      convictionLevel: {
        type: 'string',
        enum: ['high', 'moderate', 'low', 'insufficient_data'],
        description: 'high = 4+ live signals strongly agree on a direction. moderate = signals lean one way but are mixed or sparse. low = signals conflict or are mostly neutral. insufficient_data = fewer than 3 live signals returned usable data.',
      },
      agreeingSignalCount: {
        type: 'integer',
        description: 'How many of the 8 signals point in the same direction as the final call.',
      },
      totalLiveSignals: {
        type: 'integer',
        description: 'How many of the 8 signals actually returned usable live data (excludes signals in setup-needed or error state).',
      },
      primarySignals: {
        type: 'array',
        items: { type: 'string' },
        description: 'The 1-3 signal names that most influenced this conviction call, ordered by weight. Prefer satellite and foot traffic when both are live, since they are closest to institutional-grade alternative data.',
      },
      reasoning: {
        type: 'string',
        description: 'One sentence on why this conviction level was chosen, referencing specific signal values.',
      },
    },
    required: ['convictionLevel', 'agreeingSignalCount', 'totalLiveSignals', 'primarySignals', 'reasoning'],
  },
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    symbol, name, sector, altDataDir,
    insiderData, redditData, newsData, quoteData,
    footTrafficData, satelliteData
  } = body

  let cryptoData: { available?: boolean; macroScore?: number; interpretation?: string } | null = null
  try {
    const cryptoRes = await fetch(`${req.nextUrl.origin}/api/crypto-sentiment`)
    cryptoData = await cryptoRes.json()
  } catch {
    cryptoData = null
  }

  const insiderSummary = insiderData?.insiderSentiment
    ? `MSPR score: ${insiderData.insiderSentiment.mspr} (${insiderData.insiderSentiment.interpretation}), ${insiderData.insiderTransactions?.netSentiment || 'unknown'} in recent transactions`
    : 'Insider data unavailable'

  const edgarSummary = insiderData?.edgarFilingVelocity
    ? `${insiderData.edgarFilingVelocity.filingCount90d} Form 4 filings in 90 days (${insiderData.edgarFilingVelocity.velocity} velocity)`
    : 'EDGAR data unavailable'

  const redditSummary = redditData?.found
    ? `Reddit rank #${redditData.rank}, ${redditData.mentions} mentions, ${redditData.mentionChange > 0 ? '+' : ''}${redditData.mentionChange}% change — ${redditData.interpretation}`
    : redditData?.interpretation || 'Not trending on Reddit'

  const newsSummary = newsData?.bullishPercent != null
    ? `${Math.round(newsData.bullishPercent * 100)}% bullish, ${Math.round(newsData.bearishPercent * 100)}% bearish across ${newsData.articleCount} articles`
    : 'News sentiment unavailable'

  const priceSummary = quoteData?.price
    ? `$${quoteData.price?.toFixed(2)}, ${quoteData.changePercent?.toFixed(2)}% today`
    : 'Price unavailable'

  const footTrafficSummary = footTrafficData?.aggregateScore !== null && footTrafficData?.aggregateScore !== undefined
    ? `Current busyness score: ${footTrafficData.aggregateScore}/100 across ${footTrafficData.locationsMonitored} monitored locations — ${footTrafficData.aggregateInterpretation}`
    : footTrafficData?.aggregateInterpretation || 'Foot traffic data unavailable — add Google Maps API key'

  const satelliteSummary = satelliteData?.available
    ? `Satellite activity score: ${satelliteData.aggregateActivityScore} (${satelliteData.aggregateDirection}) — ${satelliteData.aggregateInterpretation}`
    : 'Satellite imagery unavailable — add Sentinel Hub credentials'

  const cryptoSummary = cryptoData?.available
    ? `Macro score ${cryptoData.macroScore! > 0 ? '+' : ''}${cryptoData.macroScore} — ${cryptoData.interpretation}. This is a MARKET-WIDE risk-appetite signal, not specific to ${symbol}.`
    : 'Crypto macro data unavailable'

  const signalsBlock = `1. LIVE PRICE [Yahoo Finance]: ${priceSummary}
2. INSIDER SENTIMENT MSPR [Finnhub / SEC Form 3/4/5]: ${insiderSummary}
3. SEC EDGAR FORM 4 VELOCITY [data.sec.gov]: ${edgarSummary}
4. REDDIT/SOCIAL SENTIMENT [ApeWisdom]: ${redditSummary}
5. NEWS SENTIMENT [Finnhub]: ${newsSummary}
6. FOOT TRAFFIC [Google Maps Popular Times]: ${footTrafficSummary}
7. SATELLITE IMAGERY [ESA Sentinel-2]: ${satelliteSummary}
8. CRYPTO MACRO RISK APPETITE [Bybit, BTC/ETH funding rates]: ${cryptoSummary}`

  // --- Agentic step 1: conviction agent ---
  // Claude is given the 8 raw signals and must call set_conviction.
  // It decides, signal by signal, how many genuinely agree and how
  // confident that makes it — this judgment is not computed by a
  // hardcoded threshold in the frontend, it is the model's own call.
  let conviction: {
    convictionLevel: string
    agreeingSignalCount: number
    totalLiveSignals: number
    primarySignals: string[]
    reasoning: string
  } | null = null

  try {
    const convictionResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      tools: [CONVICTION_TOOL],
      tool_choice: { type: 'tool', name: 'set_conviction' },
      messages: [{
        role: 'user',
        content: `You are the conviction-scoring agent inside VANTAGE, an alternative data platform. Given the 8 live signals below for ${symbol} (${name}, ${sector}), decide how many genuinely agree with each other and call set_conviction with your assessment. Treat any signal marked "unavailable" or "setup needed" as not live — do not count it toward totalLiveSignals or agreeingSignalCount. Signal 8 (crypto macro risk appetite) is market-wide, not specific to ${symbol} — weight it as context, not as primary evidence for or against this specific stock. Be honest: if fewer than 3 signals are live, conviction must be "insufficient_data" regardless of direction.

${signalsBlock}`
      }],
    })

    const toolUse = convictionResponse.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )
    if (toolUse) {
      conviction = toolUse.input as typeof conviction
    }
  } catch {
    conviction = null
  }

  const convictionBlock = conviction
    ? `CONVICTION AGENT ASSESSMENT (generated by a separate Claude tool-call, not hardcoded): ${conviction.convictionLevel.toUpperCase()} conviction. ${conviction.agreeingSignalCount} of ${conviction.totalLiveSignals} live signals agree. Primary signals weighted: ${conviction.primarySignals.join(', ')}. Reasoning: ${conviction.reasoning}`
    : 'CONVICTION AGENT ASSESSMENT: unavailable this request — proceed using the raw signals only.'

  const prompt = `You are VANTAGE, a real alternative data intelligence platform for retail investors. Analyse ${symbol} (${name}, ${sector}) using REAL data signals pulled from live APIs.

REAL DATA SIGNALS (all from actual live sources):

${signalsBlock}

${convictionBlock}

ALTERNATIVE DATA DIRECTION (from demo game scenario): ${altDataDir === 'bull' ? 'BULLISH' : altDataDir === 'bear' ? 'BEARISH' : 'NEUTRAL'}

Write 3 tight paragraphs, plain text, no headers, no bullets, no markdown.

Para 1: What signals 2-8 together tell you about ${symbol}'s operational reality right now. Be concrete about what each real signal means. Note which signals are genuinely from live data. The foot traffic and satellite signals are the most like what hedge funds pay millions for — emphasise these. The crypto macro signal (8) is market-wide context, not stock-specific — mention it only briefly as background risk appetite, don't treat it as primary evidence about ${symbol} itself.

Para 2: Where the data aligns with or diverges from analyst consensus. The retail investor only sees analyst notes and news. What are they missing from these alternative signals?

Para 3: State the conviction level from the conviction agent assessment above and what a hedge fund analyst would do with this combination of signals. Explain what VANTAGE is democratising by making these signals available for $29/month vs the $2-5M/year institutions pay.

Quantitative, analyst-register. Direct. No financial disclaimers.`

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 450,
    messages: [{ role: 'user', content: prompt }],
  })

  return new Response(
    new ReadableStream({
      async start(controller) {
        // Send the conviction agent's structured output first as its own
        // event so the client can render a conviction badge immediately,
        // before the prose analysis starts streaming in.
        if (conviction) {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ conviction })}\n\n`)
          )
        }
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
            )
          }
        }
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    }
  )
}
