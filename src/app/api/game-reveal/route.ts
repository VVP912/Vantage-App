import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { yourPnL, hedgePnL, dataAdvantage, bearNames, bullNames } = body

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 280,
    messages: [{
      role: 'user',
      content: `2 short punchy paragraphs, plain text, no headers, no bullets.

A retail investor traded 6 stocks pre-earnings. All were analyst-rated Buy. Their P&L: ${yourPnL >= 0 ? '+' : ''}$${Math.round(yourPnL)}. The hedge fund made +$${Math.round(hedgePnL)} on the same stocks. Data advantage: $${Math.round(dataAdvantage)}.

The key: ${bearNames} had alternative data pointing to misses (satellite imagery, credit card spend, job postings all negative) despite Buy ratings. ${bullNames} had data confirming the bull case.

Para 1: Why equal Buy ratings on all 6 stocks is the trap — and how alternative data reveals which Buy ratings are wrong weeks before earnings. Be specific about the data types.
Para 2: The hedge fund made $${Math.round(dataAdvantage)} more than the retail investor on identical stocks with identical public information. The only difference was data access. This happens every earnings season. End with what equal access to this data would mean for market fairness.

Direct, outraged on behalf of retail. No disclaimers.`
    }]
  })

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`))
          }
        }
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      }
    }
  )
}
