'use client'

import { useState, useEffect } from 'react'
import { STOCKS } from '@/lib/stocks'

interface Props {
  onReplay: () => void
}

interface AllSignalData {
  insiderData: Record<string, unknown> | null
  redditData: Record<string, unknown> | null
  newsData: Record<string, unknown> | null
  quoteData: Record<string, unknown> | null
  footTrafficData: Record<string, unknown> | null
  satelliteData: Record<string, unknown> | null
  loading: boolean
}

interface ConvictionAssessment {
  convictionLevel: string
  agreeingSignalCount: number
  totalLiveSignals: number
  primarySignals: string[]
  reasoning: string
}

interface PredictionData {
  prediction: {
    compositeScore: number
    predictedDirection: string
    confidenceBand: string
    liveSignalCount: number
    signalBreakdown: Array<{ label: string; rawValue: unknown; normalisedScore: number; weight: number; contribution: number }>
    overfittingCaveat: string
  }
  risk: {
    recommendedAction: string
    maxPositionSizePercent: number
    rationale: string
    warnings: string[]
  }
  methodology: {
    weights: Array<{ key: string; label: string; weight: number; rationale: string }>
    note: string
  }
}

interface OnchainLogResult {
  logged: boolean
  txHash?: string
  blockNumber?: number
  explorerUrl?: string
  signalHash?: string
  network?: string
  message?: string
}

const SOURCE_COLORS = {
  free: '#3B6D11',
  paid: '#854F0B',
}

export default function EdgeScreen({ onReplay }: Props) {
  const [selIdx, setSelIdx] = useState(0)
  const [signals, setSignals] = useState<Record<string, AllSignalData>>({})
  const [analysis, setAnalysis] = useState('')
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [conviction, setConviction] = useState<ConvictionAssessment | null>(null)
  const [convictionLoading, setConvictionLoading] = useState(false)
  const [prediction, setPrediction] = useState<PredictionData | null>(null)
  const [onchainResult, setOnchainResult] = useState<OnchainLogResult | null>(null)
  const [onchainLoading, setOnchainLoading] = useState(false)

  const tk = STOCKS[selIdx]

  useEffect(() => {
    const sym = tk.sym
    if (signals[sym]) {
      runAnalysis(sym)
      return
    }

    setSignals(prev => ({ ...prev, [sym]: { insiderData: null, redditData: null, newsData: null, quoteData: null, footTrafficData: null, satelliteData: null, loading: true } }))
    setAnalysis('')
    setAnalysisLoading(false)
    setPrediction(null)
    setOnchainResult(null)
    setOnchainLoading(false)

    const fetchAll = async () => {
      const [insiderRes, redditRes, newsRes, quoteRes, footRes, satRes] = await Promise.allSettled([
        fetch(`/api/insider?symbol=${sym}`).then(r => r.json()),
        fetch(`/api/reddit?symbol=${sym}`).then(r => r.json()),
        fetch(`/api/news?symbol=${sym}`).then(r => r.json()),
        fetch(`/api/quote?symbol=${sym}`).then(r => r.json()),
        fetch(`/api/foottraffic?symbol=${sym}`).then(r => r.json()),
        fetch(`/api/satellite?symbol=${sym}`).then(r => r.json()),
      ])

      const data: AllSignalData = {
        insiderData: insiderRes.status === 'fulfilled' ? insiderRes.value : null,
        redditData: redditRes.status === 'fulfilled' ? redditRes.value : null,
        newsData: newsRes.status === 'fulfilled' ? newsRes.value : null,
        quoteData: quoteRes.status === 'fulfilled' ? quoteRes.value : null,
        footTrafficData: footRes.status === 'fulfilled' ? footRes.value : null,
        satelliteData: satRes.status === 'fulfilled' ? satRes.value : null,
        loading: false,
      }

      setSignals(prev => ({ ...prev, [sym]: data }))
      runAnalysis(sym, data)

      // Run the predictive model independently of the streamed
      // synthesis — quantitative, deterministic, not LLM-generated.
      try {
        const predRes = await fetch('/api/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            insiderData: data.insiderData,
            redditData: data.redditData,
            newsData: data.newsData,
            quoteData: data.quoteData,
            footTrafficData: data.footTrafficData,
            satelliteData: data.satelliteData,
          }),
        })
        const predData = await predRes.json()
        setPrediction(predData)
      } catch {
        setPrediction(null)
      }
    }

    fetchAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selIdx])

  const logToChain = async () => {
    if (!conviction) return
    setOnchainLoading(true)
    try {
      const res = await fetch('/api/onchain-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: tk.sym,
          signalValues: signals[tk.sym],
          convictionLevel: conviction.convictionLevel,
          agreeingSignals: conviction.agreeingSignalCount,
          totalLiveSignals: conviction.totalLiveSignals,
        }),
      })
      const result = await res.json()
      setOnchainResult(result)
    } catch {
      setOnchainResult({ logged: false, message: 'Request failed.' })
    } finally {
      setOnchainLoading(false)
    }

  const runAnalysis = async (sym: string, data?: AllSignalData) => {
    const d = data || signals[sym]
    if (!d || d.loading) return
    setAnalysis('')
    setAnalysisLoading(true)
    setConviction(null)
    setConvictionLoading(true)

    const tkData = STOCKS.find(s => s.sym === sym)!

    try {
      const res = await fetch('/api/edge-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: sym,
          name: tkData.name,
          sector: tkData.sector,
          altDataDir: tkData.altDataDir,
          insiderData: d.insiderData,
          redditData: d.redditData,
          newsData: d.newsData,
          quoteData: d.quoteData,
          footTrafficData: d.footTrafficData,
          satelliteData: d.satelliteData,
        }),
      })

      const reader = res.body?.getReader()
      const dec = new TextDecoder()
      let full = ''

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = dec.decode(value).split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const d = line.slice(6)
          if (d === '[DONE]') break
          try {
            const p = JSON.parse(d)
            if (p.conviction) {
              setConviction(p.conviction)
              setConvictionLoading(false)
            }
            if (p.text) { full += p.text; setAnalysis(full) }
          } catch { /* */ }
        }
      }
      setConvictionLoading(false)
    } catch {
      setAnalysis(`${sym} analysis unavailable — add API keys to enable live data.`)
      setConvictionLoading(false)
    } finally {
      setAnalysisLoading(false)
    }
  }

  const sig = signals[tk.sym]
  const loading = !sig || sig.loading

  type InsiderDataShape = {
    insiderSentiment?: { mspr: number; interpretation: string }
    insiderTransactions?: { netSentiment: string; buys: number; sells: number }
    edgarFilingVelocity?: { filingCount90d: number; filingCount30d: number; velocity: string; interpretation: string }
  }
  type RedditShape = { found?: boolean; rank?: number; mentions?: number; mentionChange?: number; interpretation?: string; retailInterest?: string }
  type NewsShape = { bullishPercent?: number; bearishPercent?: number; articleCount?: number; articles?: Array<{ headline: string; source: string; datetime: string }> }
  type QuoteShape = { price?: number; changePercent?: number; volume?: number; avgVolume?: number }
  type FootShape = { aggregateScore?: number | null; aggregateSignal?: string; aggregateInterpretation?: string; locationsMonitored?: number; locations?: Array<{ name: string; type: string; currentBusyness?: number | null; signal?: string }> }
  type SatShape = { available?: boolean; aggregateActivityScore?: number; aggregateDirection?: string; aggregateInterpretation?: string; facilities?: Array<{ name: string; type: string; satelliteData?: { direction: string; activityScore: number; interpretation: string } | null }> }

  const insider = sig?.insiderData as InsiderDataShape | null
  const reddit = sig?.redditData as RedditShape | null
  const news = sig?.newsData as NewsShape | null
  const quote = sig?.quoteData as QuoteShape | null
  const foot = sig?.footTrafficData as FootShape | null
  const sat = sig?.satelliteData as SatShape | null

  const card = (content: React.ReactNode, key: string) => (
    <div key={key} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: 12 }}>{content}</div>
  )

  const badge = (text: string, color: string, bg: string) => (
    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 500, color, background: bg }}>{text}</span>
  )

  const sourcePill = (text: string, isFree: boolean) => (
    <div style={{ fontSize: 9, color: isFree ? SOURCE_COLORS.free : SOURCE_COLORS.paid, marginTop: 6 }}>{isFree ? '✓ ' : '~'}{text}</div>
  )

  const mspr = insider?.insiderSentiment?.mspr
  const msprDir = mspr !== undefined ? (mspr > 10 ? 'bull' : mspr < -10 ? 'bear' : 'neut') : 'neut'
  const footScore = foot?.aggregateScore
  const footDir = foot?.aggregateSignal || 'neut'
  const satDir = sat?.aggregateDirection

  return (
    <div className="screen-light" style={{ padding: 18, maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ borderBottom: '0.5px solid #e5e5e5', paddingBottom: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 30, height: 30, background: '#0d0d1a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: '#4ecca3', fontFamily: 'Courier New, monospace' }}>V</div>
          <div style={{ fontSize: 18, fontWeight: 500, color: '#111' }}>VANTAGE</div>
        </div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>Alternative data intelligence. 7 real signals. Updated live.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {['Yahoo Finance', 'Finnhub', 'SEC EDGAR', 'ApeWisdom', 'Google Maps', 'ESA Sentinel-2'].map(s => (
            <span key={s} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: '#EAF3DE', color: '#3B6D11', fontWeight: 500 }}>{s}</span>
          ))}
        </div>
      </div>

      {/* Ticker selector */}
      <div style={{ fontSize: 10, fontWeight: 500, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Select a stock</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 16 }}>
        {STOCKS.map((s, i) => (
          <button key={s.sym} onClick={() => setSelIdx(i)}
            style={{ background: i === selIdx ? '#fff' : '#f5f5f5', border: i === selIdx ? '1.5px solid #0d0d1a' : '0.5px solid #e5e5e5', borderRadius: 8, padding: 9, cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>{s.sym}</div>
            <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>{s.sector}</div>
            <div style={{ fontSize: 11, fontWeight: 500, marginTop: 5, color: s.altDataDir === 'bull' ? '#3B6D11' : s.altDataDir === 'bear' ? '#A32D2D' : '#854F0B' }}>
              {s.altDataDir === 'bull' ? '↑ Bullish' : s.altDataDir === 'bear' ? '↓ Bearish' : '→ Neutral'}
            </div>
          </button>
        ))}
      </div>

      {/* Live price */}
      {quote?.price && (
        <div style={{ background: '#f5f5f5', borderRadius: 8, padding: '10px 12px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>{tk.sym} — live price</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: '#111', fontFamily: 'Courier New, monospace' }}>${quote.price?.toFixed(2)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: (quote.changePercent || 0) >= 0 ? '#3B6D11' : '#A32D2D' }}>
              {(quote.changePercent || 0) >= 0 ? '+' : ''}{quote.changePercent?.toFixed(2)}%
            </div>
            <div style={{ fontSize: 9, color: '#bbb', marginTop: 2 }}>Yahoo Finance · real-time</div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#999', fontSize: 13 }}>Fetching 7 live data sources...</div>
      ) : (
        <>
          <div style={{ fontSize: 10, fontWeight: 500, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>7 alternative data signals</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>

            {/* 1. Satellite imagery */}
            {card(<>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#111' }}>Satellite imagery</div>
                {badge(sat?.available ? (satDir === 'elevated' ? 'Active' : satDir === 'reduced' ? 'Quiet' : 'Stable') : 'Setup needed', satDir === 'elevated' ? '#3B6D11' : satDir === 'reduced' ? '#A32D2D' : '#854F0B', satDir === 'elevated' ? '#EAF3DE' : satDir === 'reduced' ? '#FCEBEB' : '#FAEEDA')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 500, color: '#111', fontFamily: 'Courier New, monospace' }}>
                {sat?.available ? `${sat.aggregateActivityScore > 0 ? '+' : ''}${sat.aggregateActivityScore?.toFixed(1)} score` : 'Needs setup'}
              </div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 3, lineHeight: 1.4 }}>
                {sat?.available ? sat.aggregateInterpretation?.substring(0, 100) + '...' : 'Add SENTINEL_HUB credentials to enable ESA Sentinel-2 NDVI/NDBI analysis'}
              </div>
              {sourcePill('ESA Sentinel-2 via Copernicus CDSE · free', true)}
              <div style={{ fontSize: 9, color: '#bbb', marginTop: 2 }}>Hedge funds pay: Planet Labs $500k+/yr</div>
            </>, 'sat')}

            {/* 2. Foot traffic */}
            {card(<>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#111' }}>Foot traffic</div>
                {badge(foot?.aggregateScore !== null && foot?.aggregateScore !== undefined ? (footScore! > 60 ? 'High' : footScore! > 35 ? 'Normal' : 'Low') : 'Setup needed', footDir === 'bull' ? '#3B6D11' : footDir === 'bear' ? '#A32D2D' : '#854F0B', footDir === 'bull' ? '#EAF3DE' : footDir === 'bear' ? '#FCEBEB' : '#FAEEDA')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 500, color: '#111', fontFamily: 'Courier New, monospace' }}>
                {foot?.aggregateScore !== null && foot?.aggregateScore !== undefined ? `${foot.aggregateScore}/100` : 'Needs setup'}
              </div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 3, lineHeight: 1.4 }}>
                {foot?.aggregateInterpretation?.substring(0, 100) || 'Add GOOGLE_MAPS_API_KEY to enable real-time location busyness'}
              </div>
              {sourcePill('Google Maps Popular Times · real opted-in location data', true)}
              <div style={{ fontSize: 9, color: '#bbb', marginTop: 2 }}>Hedge funds pay: SafeGraph/Placer.ai $200k+/yr</div>
            </>, 'foot')}

            {/* 3. Insider sentiment */}
            {card(<>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#111' }}>Insider sentiment</div>
                {badge(msprDir === 'bull' ? 'Bullish' : msprDir === 'bear' ? 'Bearish' : 'Neutral', msprDir === 'bull' ? '#3B6D11' : msprDir === 'bear' ? '#A32D2D' : '#854F0B', msprDir === 'bull' ? '#EAF3DE' : msprDir === 'bear' ? '#FCEBEB' : '#FAEEDA')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 500, color: '#111', fontFamily: 'Courier New, monospace' }}>
                {mspr !== undefined ? `${mspr > 0 ? '+' : ''}${mspr} MSPR` : 'N/A'}
              </div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 3, lineHeight: 1.4 }}>
                {insider?.insiderSentiment?.interpretation || 'Unavailable'}
              </div>
              {sourcePill('Finnhub free tier · SEC Form 3/4/5', true)}
            </>, 'insider')}

            {/* 4. SEC EDGAR Form 4 */}
            {card(<>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#111' }}>SEC Form 4 velocity</div>
                {badge(insider?.edgarFilingVelocity?.velocity || 'Unknown', insider?.edgarFilingVelocity?.velocity === 'High' ? '#854F0B' : '#666', insider?.edgarFilingVelocity?.velocity === 'High' ? '#FAEEDA' : '#F5F5F5')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 500, color: '#111', fontFamily: 'Courier New, monospace' }}>
                {insider?.edgarFilingVelocity ? `${insider.edgarFilingVelocity.filingCount90d} filings` : 'N/A'}
              </div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 3, lineHeight: 1.4 }}>
                {insider?.edgarFilingVelocity?.interpretation || 'Unavailable'}
              </div>
              {sourcePill('SEC EDGAR data.sec.gov · free, no key', true)}
            </>, 'edgar')}

            {/* 5. Reddit sentiment */}
            {card(<>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#111' }}>Reddit sentiment</div>
                {badge(reddit?.retailInterest || 'Unknown', '#534AB7', '#EEEDFE')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 500, color: '#534AB7', fontFamily: 'Courier New, monospace' }}>
                {reddit?.found ? `#${reddit.rank} rank` : 'Not trending'}
              </div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 3, lineHeight: 1.4 }}>
                {reddit?.found ? `${reddit.mentions} mentions · ${reddit.mentionChange && reddit.mentionChange > 0 ? '+' : ''}${reddit.mentionChange}% vs 24h` : reddit?.interpretation || 'Not in top mentions'}
              </div>
              {sourcePill('ApeWisdom · r/wsb, r/stocks · free, no key', true)}
            </>, 'reddit')}

            {/* 6. News sentiment */}
            {card(<>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#111' }}>News sentiment</div>
                {badge(news?.bullishPercent ? (news.bullishPercent > 0.6 ? 'Bullish' : news?.bearishPercent && news.bearishPercent > 0.5 ? 'Bearish' : 'Mixed') : 'Unknown', news?.bullishPercent && news.bullishPercent > 0.6 ? '#3B6D11' : news?.bearishPercent && news.bearishPercent > 0.5 ? '#A32D2D' : '#854F0B', news?.bullishPercent && news.bullishPercent > 0.6 ? '#EAF3DE' : news?.bearishPercent && news.bearishPercent > 0.5 ? '#FCEBEB' : '#FAEEDA')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 500, color: '#111', fontFamily: 'Courier New, monospace' }}>
                {news?.bullishPercent != null ? `${Math.round(news.bullishPercent * 100)}% bull` : 'N/A'}
              </div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 3, lineHeight: 1.4 }}>
                {news?.articleCount ? `${news.articleCount} articles · last 7 days` : 'Unavailable'}
              </div>
              {sourcePill('Finnhub free tier · company news NLP', true)}
            </>, 'news')}

          </div>

          {/* Satellite facility detail */}
          {sat?.available && sat?.facilities && sat.facilities.filter(f => f.satelliteData).length > 0 && (
            <div style={{ background: '#f5f5f5', borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Satellite detail — ESA Sentinel-2 facility analysis
              </div>
              {sat.facilities.filter(f => f.satelliteData).map((f, i) => (
                <div key={i} style={{ paddingBottom: 8, marginBottom: 8, borderBottom: i < sat.facilities!.length - 1 ? '0.5px solid #e5e5e5' : 'none' }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: '#111' }}>{f.name}</div>
                  <div style={{ fontSize: 10, color: f.satelliteData?.direction === 'elevated' ? '#3B6D11' : f.satelliteData?.direction === 'reduced' ? '#A32D2D' : '#666', marginTop: 2 }}>
                    Activity {f.satelliteData?.direction} · score {f.satelliteData?.activityScore > 0 ? '+' : ''}{f.satelliteData?.activityScore?.toFixed(1)}
                  </div>
                  <div style={{ fontSize: 10, color: '#666', marginTop: 2, lineHeight: 1.4 }}>{f.interpretation}</div>
                </div>
              ))}
            </div>
          )}

          {/* Foot traffic detail */}
          {foot?.locations && foot.locations.filter(l => l.currentBusyness !== null && l.currentBusyness !== undefined).length > 0 && (
            <div style={{ background: '#f5f5f5', borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Foot traffic detail — Google Maps Popular Times (live)
              </div>
              {foot.locations.filter(l => l.currentBusyness !== null && l.currentBusyness !== undefined).map((loc, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6, marginBottom: 6, borderBottom: '0.5px solid #e5e5e5' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: '#111' }}>{loc.name}</div>
                    <div style={{ fontSize: 10, color: '#999' }}>{loc.type?.replace('_', ' ')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 500, color: '#111', fontFamily: 'Courier New, monospace' }}>{loc.currentBusyness}/100</div>
                    <div style={{ fontSize: 10, color: '#999' }}>{loc.signal}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Conviction agent — genuine agentic step: Claude calls a tool
              to commit to a structured conviction judgment based on how
              many live signals agree, before any prose is generated */}
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Conviction agent
              </div>
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: '#EEEDFE', color: '#534AB7', fontWeight: 500 }}>
                Agentic · tool call
              </span>
            </div>
            {convictionLoading && !conviction ? (
              <div style={{ fontSize: 12, color: '#999' }}>Claude is weighing the 7 live signals against each other...</div>
            ) : conviction ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 500, padding: '3px 10px', borderRadius: 20,
                    background: conviction.convictionLevel === 'high' ? '#EAF3DE' : conviction.convictionLevel === 'moderate' ? '#FAEEDA' : conviction.convictionLevel === 'low' ? '#FCEBEB' : '#F5F5F5',
                    color: conviction.convictionLevel === 'high' ? '#3B6D11' : conviction.convictionLevel === 'moderate' ? '#854F0B' : conviction.convictionLevel === 'low' ? '#A32D2D' : '#666',
                  }}>
                    {conviction.convictionLevel.replace('_', ' ')} conviction
                  </span>
                  <span style={{ fontSize: 11, color: '#999' }}>
                    {conviction.agreeingSignalCount}/{conviction.totalLiveSignals} live signals agree
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5, marginBottom: 6 }}>{conviction.reasoning}</div>
                <div style={{ fontSize: 10, color: '#999' }}>
                  Weighted most: {conviction.primarySignals.join(', ')}
                </div>
                <div style={{ fontSize: 9, color: '#bbb', marginTop: 6 }}>
                  This judgment is made by a separate Claude tool-call that decides conviction from raw signal values — not a hardcoded threshold.
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#999' }}>Conviction assessment unavailable this request.</div>
            )}
          </div>

          {/* Predictive scoring model — deterministic, weighted, fully
              auditable. Not an LLM call: a rule-based model with fixed,
              disclosed weights. This is the quantitative backbone the
              conviction agent's qualitative judgment sits alongside. */}
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Predictive model
              </div>
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: '#E6F1FB', color: '#0C447C', fontWeight: 500 }}>
                Rule-based · weighted
              </span>
            </div>
            {!prediction ? (
              <div style={{ fontSize: 12, color: '#999' }}>Computing weighted composite score...</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 22, fontWeight: 500, fontFamily: 'Courier New, monospace', color: prediction.prediction.predictedDirection === 'bullish' ? '#3B6D11' : prediction.prediction.predictedDirection === 'bearish' ? '#A32D2D' : '#666' }}>
                    {prediction.prediction.compositeScore > 0 ? '+' : ''}{prediction.prediction.compositeScore.toFixed(3)}
                  </span>
                  <span style={{ fontSize: 12, color: '#666', textTransform: 'capitalize' }}>
                    {prediction.prediction.predictedDirection} · {prediction.prediction.confidenceBand.replace('_', ' ')} confidence
                  </span>
                </div>
                <div style={{ marginBottom: 8 }}>
                  {prediction.prediction.signalBreakdown.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: '#666', width: 130, flexShrink: 0 }}>{s.label}</span>
                      <div style={{ flex: 1, height: 6, background: '#f0f0f0', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                        <div style={{
                          position: 'absolute', top: 0, bottom: 0,
                          left: s.contribution >= 0 ? '50%' : `${50 + s.contribution * 200}%`,
                          width: `${Math.abs(s.contribution) * 200}%`,
                          background: s.contribution >= 0 ? '#639922' : '#E24B4A',
                        }} />
                        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#ccc' }} />
                      </div>
                      <span style={{ fontSize: 9, color: '#999', width: 50, textAlign: 'right', flexShrink: 0 }}>w={s.weight}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: '#bbb', lineHeight: 1.5, paddingTop: 6, borderTop: '0.5px solid #eee' }}>
                  {prediction.prediction.overfittingCaveat}
                </div>
              </>
            )}
          </div>

          {/* Risk management — explicit position sizing, hard caps,
              and circuit-breaker logic for conflicting signals. */}
          {prediction && (
            <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Risk assessment
                </div>
                <span style={{
                  fontSize: 9, padding: '2px 7px', borderRadius: 20, fontWeight: 500,
                  background: prediction.risk.recommendedAction === 'no_position' || prediction.risk.recommendedAction === 'insufficient_data' ? '#FAEEDA' : '#EAF3DE',
                  color: prediction.risk.recommendedAction === 'no_position' || prediction.risk.recommendedAction === 'insufficient_data' ? '#854F0B' : '#3B6D11',
                }}>
                  {prediction.risk.recommendedAction.replace(/_/g, ' ')}
                </span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 500, fontFamily: 'Courier New, monospace', color: '#111', marginBottom: 6 }}>
                Max {prediction.risk.maxPositionSizePercent}% position
              </div>
              <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5, marginBottom: 8 }}>{prediction.risk.rationale}</div>
              {prediction.risk.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 10, color: '#A32D2D', lineHeight: 1.5, marginBottom: 4, paddingLeft: 10, borderLeft: '2px solid #F09595' }}>{w}</div>
              ))}
            </div>
          )}

          {/* On-chain verification — logs the conviction call to Polygon
              Amoy testnet before the outcome is known, so the prediction
              is timestamped and tamper-proof. This is the verifiability
              layer: anyone can independently check the chain. */}
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                On-chain verification
              </div>
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: '#EEEDFE', color: '#534AB7', fontWeight: 500 }}>
                Polygon Amoy testnet
              </span>
            </div>
            {onchainResult?.logged ? (
              <>
                <div style={{ fontSize: 12, color: '#3B6D11', fontWeight: 500, marginBottom: 6 }}>Logged on-chain</div>
                <div style={{ fontSize: 10, color: '#666', wordBreak: 'break-all', marginBottom: 6 }}>Tx: {onchainResult.txHash}</div>
                {onchainResult.explorerUrl && (
                  <a href={onchainResult.explorerUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#378ADD' }}>
                    View on PolygonScan ↗
                  </a>
                )}
              </>
            ) : onchainResult && !onchainResult.logged ? (
              <div style={{ fontSize: 11, color: '#999', lineHeight: 1.5 }}>{onchainResult.message}</div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5, marginBottom: 8 }}>
                  Record this conviction call on Polygon Amoy testnet before the earnings outcome is known — a tamper-proof, timestamped, publicly auditable prediction. Raw signal values are hashed, not published, so the record proves prior commitment without exposing data.
                </div>
                <button
                  onClick={logToChain}
                  disabled={!conviction || onchainLoading}
                  style={{ padding: '8px 14px', background: conviction ? '#0d0d1a' : '#ccc', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: conviction ? 'pointer' : 'not-allowed', fontFamily: 'Courier New, monospace' }}
                >
                  {onchainLoading ? 'Logging...' : 'Log prediction on-chain'}
                </button>
              </>
            )}
          </div>

          {/* AI synthesis */}
          <div style={{ background: '#0d0d1a', borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 5 }}>
              AI synthesis — 7 signals vs analyst consensus
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', lineHeight: 1.6, marginBottom: 8 }}>
              {tk.altDataDir === 'bear'
                ? `${tk.sym} analyst consensus: Buy. Alternative data across 7 sources: mixed-to-bearish. Retail investors following analyst notes alone are missing operational ground truth.`
                : tk.altDataDir === 'bull'
                ? `${tk.sym} alternative data confirms analyst consensus across multiple sources. High-conviction long with satellite, foot traffic, and insider data all aligned.`
                : `${tk.sym} signals are mixed. Analyst consensus and alternative data neither strongly confirm nor contradict each other.`}
            </div>
            <div style={{ fontSize: 11, color: '#4ecca3', fontFamily: 'Courier New, monospace' }}>
              Satellite + foot traffic: most like institutional alt-data · Updated live
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
              Not financial advice. Signals are directional indicators only.
            </div>
          </div>

          {/* Streaming analysis */}
          <div style={{ background: '#f5f5f5', borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Full analysis — synthesising all 7 live signals</div>
            <div style={{ fontSize: 12, color: '#222', lineHeight: 1.8, fontFamily: 'Courier New, monospace', whiteSpace: 'pre-wrap' }}>
              {analysisLoading && !analysis ? 'Generating analysis from 7 live data sources...' : analysis || 'Select a stock to generate analysis.'}
            </div>
          </div>

          {/* Recent news */}
          {news?.articles && news.articles.length > 0 && (
            <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Recent news · Finnhub</div>
              {news.articles.slice(0, 3).map((a, i) => (
                <div key={i} style={{ paddingBottom: 8, marginBottom: 8, borderBottom: i < 2 ? '0.5px solid #e5e5e5' : 'none' }}>
                  <div style={{ fontSize: 12, color: '#111', fontWeight: 500, lineHeight: 1.4 }}>{a.headline}</div>
                  <div style={{ fontSize: 10, color: '#999', marginTop: 3 }}>{a.source} · {a.datetime}</div>
                </div>
              ))}
            </div>
          )}

          {/* Data sources transparency */}
          <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>All data sources — full transparency</div>
            {[
              { signal: 'Live stock quotes', source: 'Yahoo Finance (yahoo-finance2)', cost: 'Free', keyNeeded: 'None' },
              { signal: 'Insider sentiment MSPR', source: 'Finnhub.io free tier', cost: 'Free', keyNeeded: 'FINNHUB_API_KEY' },
              { signal: 'Form 4 filing velocity', source: 'SEC EDGAR data.sec.gov', cost: 'Free', keyNeeded: 'None' },
              { signal: 'Reddit mentions', source: 'ApeWisdom (r/wsb, r/stocks)', cost: 'Free', keyNeeded: 'None' },
              { signal: 'News sentiment', source: 'Finnhub.io free tier', cost: 'Free', keyNeeded: 'FINNHUB_API_KEY' },
              { signal: 'Foot traffic (Google Maps)', source: 'Google Maps Popular Times', cost: 'Free tier', keyNeeded: 'GOOGLE_MAPS_API_KEY' },
              { signal: 'Satellite imagery (Sentinel-2)', source: 'ESA Copernicus CDSE', cost: 'Free tier', keyNeeded: 'SENTINEL_HUB_*' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '4px 0', borderBottom: i < 6 ? '0.5px solid #eee' : 'none' }}>
                <span style={{ color: '#555', fontWeight: 500 }}>{s.signal}</span>
                <span style={{ color: '#999' }}>{s.source}</span>
              </div>
            ))}
          </div>

        </>
      )}

      {/* Pricing */}
      <div style={{ background: '#f5f5f5', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 500, color: '#111' }}>$29<span style={{ fontSize: 13, fontWeight: 400, color: '#999' }}>/month</span></div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>7 signals · 50 stocks · Weekly updates · Full AI synthesis</div>
          <div style={{ fontSize: 10, color: '#3B6D11', marginTop: 2 }}>Hedge funds pay $2-5M/year for the same data</div>
        </div>
        <button style={{ padding: '9px 18px', background: '#0d0d1a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Courier New, monospace' }}>
          Start free trial
        </button>
      </div>

      <button onClick={onReplay} style={{ display: 'block', width: '100%', padding: 10, background: 'transparent', border: '0.5px solid #ddd', borderRadius: 8, color: '#999', fontSize: 11, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'Courier New, monospace' }}>
        Play VANTAGE again ↗
      </button>
    </div>
  )
}
