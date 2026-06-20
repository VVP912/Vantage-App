import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { yourPnL, hedgePnL, dataAdvantage, bearNames, bullNames } = body

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 140,
    messages: [{
      role: 'user',
      content: `ONE short punchy paragraph, max 60 words, plain text, no headers, no bullets.

A retail investor traded 6 stocks pre-earnings. All were analyst-rated Buy. Their P&L: ${yourPnL >= 0 ? '+' : ''}$${Math.round(yourPnL)}. The hedge fund made +$${Math.round(hedgePnL)} on the same stocks. Data advantage: $${Math.round(dataAdvantage)}.

The key: ${bearNames} had alternative data pointing to misses despite Buy ratings. ${bullNames} had data confirming the bull case.

State why equal Buy ratings hide the real signal, and that the $${Math.round(dataAdvantage)} gap came from data access alone. Direct, outraged on behalf of retail. No disclaimers.`
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
