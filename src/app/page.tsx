'use client'

import { useState } from 'react'
import TitleScreen from '@/components/TitleScreen'
import GameScreen from '@/components/GameScreen'
import RevealScreen from '@/components/RevealScreen'
import EdgeScreen from '@/components/EdgeScreen'

export type Screen = 'title' | 'game' | 'reveal' | 'edge'

export interface GameResult {
  yourPnL: number
  hedgePnL: number
  dataAdvantage: number
  trades: Trade[]
  holdings: Record<string, number>
  finalPrices: Record<string, number>
}

export interface Trade {
  side: 'buy' | 'sell'
  sym: string
  qty: number
  price: number
  t: number
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>('title')
  const [gameResult, setGameResult] = useState<GameResult | null>(null)

  return (
    <main>
      {screen === 'title' && (
        <TitleScreen onStart={() => setScreen('game')} />
      )}
      {screen === 'game' && (
        <GameScreen
          onReveal={(result) => {
            setGameResult(result)
            setScreen('reveal')
          }}
        />
      )}
      {screen === 'reveal' && gameResult && (
        <RevealScreen
          result={gameResult}
          onEdge={() => setScreen('edge')}
          onReplay={() => setScreen('title')}
        />
      )}
      {screen === 'edge' && (
        <EdgeScreen onReplay={() => setScreen('title')} />
      )}
    </main>
  )
}
