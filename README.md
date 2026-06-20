# VANTAGE — Alternative Data Intelligence Platform

> What does the hedge fund know that you don't?

A two-act product that first exposes how hedge funds use alternative data to trade against retail investors, then gives retail investors access to the same signals for $29/month.

## Real data sources

| Source | Data | Cost | Auth |
|--------|------|------|------|
| **Yahoo Finance** (via yahoo-finance2) | Real-time stock quotes, price, volume, 52-week range | Free | None |
| **Finnhub.io free tier** | Insider transactions (Form 3/4/5), insider sentiment MSPR score, company news, news sentiment | Free | API key (free at finnhub.io) |
| **SEC EDGAR** (data.sec.gov) | Form 4 filing velocity, company submissions history | Free | None (User-Agent header only) |
| **ApeWisdom** | Reddit mentions across r/wallstreetbets, r/stocks, r/options, r/investing | Free | None |
| **Google Maps Popular Times** | Real-time foot traffic / busyness scores for company locations | Free tier | API key |
| **ESA Copernicus Sentinel-2** | Satellite facility activity via NDVI/NDBI change detection | Free tier | OAuth client ID + secret |

### What each signal means

**Finnhub Insider MSPR** — Monthly Share Purchase Ratio. Ranges from -100 (most bearish insider activity) to +100 (most bullish). Calculated from Form 3/4/5 filings. Academic research shows MSPR predicts 30-90 day price moves.

**SEC EDGAR Form 4 velocity** — How many insider transactions filed in the last 30/90 days. Clustering of filings (3+ insiders in 48 hours) is a qualitatively different signal than normal activity. Completely free, no API key, just a User-Agent header required.

**ApeWisdom Reddit rank** — Real-time ticker mention rankings across 50+ subreddits. No API key. Refreshed every ~30 minutes. Returns rank, mentions, upvotes, and 24h change. Research shows social volume spikes precede price moves.

**Finnhub news sentiment** — Bullish/bearish percentage across all company news in last 7 days. Combined with article count gives a picture of media narrative direction.

**Yahoo Finance quote** — Real-time price, change %, volume vs average. High volume divergence from price is itself an alternative signal.

**Google Maps Popular Times** — Real busyness scores (0-100) for specific company locations, derived from opted-in location history. The closest free proxy to commercial foot-traffic data like SafeGraph or Placer.ai.

**ESA Sentinel-2 satellite** — NDVI/NDBI change detection over company facility bounding boxes, comparing the most recent 30 days to the prior 30. A genuine, free proxy for the kind of facility-activity signal hedge funds pay Planet Labs or Maxar millions per year for, at lower resolution and revisit frequency.

## Architecture

```
/src
  /app
    /api
      /quote          — Yahoo Finance real-time quotes
      /quote-batch    — Batched Yahoo Finance quotes for game starting prices
      /insider        — Finnhub MSPR + SEC EDGAR Form 4 velocity
      /reddit         — ApeWisdom mention tracking
      /news           — Finnhub company news + sentiment
      /foottraffic    — Google Maps Popular Times
      /satellite      — ESA Sentinel-2 via Sentinel Hub Statistical API
      /edge-analysis  — Anthropic Claude streaming synthesis + conviction agent
      /game-reveal    — Anthropic Claude reveal explanation
    page.tsx          — Main screen orchestrator
    layout.tsx
    globals.css
  /components
    TitleScreen.tsx   — Act 1 intro
    GameScreen.tsx    — 90-second trading game (6 stocks, all rated Buy)
    RevealScreen.tsx  — The reveal: what the hedge fund knew
    EdgeScreen.tsx    — VANTAGE product: real alternative data dashboard
  /lib
    stocks.ts         — Stock constants, CIK mappings, alt data directions
```

## The product story

**Act 1 (the trading game):** You trade 6 stocks pre-earnings. All are analyst-rated Buy. Starting prices are pulled live from Yahoo Finance when the game loads — the scripted earnings outcome (beat/miss) then plays out from that real starting point, so the session is grounded in a real market price even though the earnings result itself is a fixed scenario for the demo. The hedge fund on the other side has satellite imagery, credit card data, job posting feeds, and shipping volumes. It knows which Buy ratings are wrong. You lose.

**Reveal:** Side-by-side comparison showing your P&L vs hedge fund P&L on each stock, what alternative data the hedge fund had, and the exact dollar data advantage.

**Act 2 (the VANTAGE product):** The same alternative data signals democratised, using real live data: insider sentiment from SEC filings, Reddit mention velocity, news sentiment, real-time price, Google Maps foot traffic, and ESA Sentinel-2 satellite facility analysis. AI synthesis explaining what the combination of signals means vs analyst consensus.

## Codeplain

`vantage.plain` in the project root is the full Plain specification for this app, written for the Codeplain bounty. It defines every screen, data integration, and behaviour as concepts and functional specs that Codeplain can render into code.

## What's agentic

Most of VANTAGE's Claude calls are single-shot generation: feed pre-fetched data in, get written analysis out. That's an LLM call, not an agent.

The one genuinely agentic step is the **conviction agent** inside `/api/edge-analysis`. Before the prose synthesis is generated, a separate call to Claude is made with `tool_choice` forced to a single tool, `set_conviction`. Claude is handed the seven raw live signal values for the selected stock and must commit to a structured decision — a conviction level (high / moderate / low / insufficient data), how many of the live signals actually agree with each other, which signals it weighted most heavily, and a one-sentence justification — without any hardcoded threshold logic from the app telling it how to decide.

This matters for two reasons. First, it's auditable: the conviction badge shown on the product screen is the model's own structured judgment, not a `score > 5 ? 'bullish' : 'bearish'` if-statement dressed up in a prompt. Second, it's honest about data quality — the agent is instructed to return "insufficient data" whenever fewer than three of the seven signals returned live data, regardless of which direction those signals point, so a sparse dataset can't be spun into false confidence.

The conviction result streams to the client as the first server-sent event, ahead of the prose analysis, so the badge renders before the written synthesis starts typing out.

## Setup

```bash
# Clone and install
npm install

# Copy environment variables
cp .env.local.example .env.local

# Add your keys to .env.local:
# ANTHROPIC_API_KEY      — from console.anthropic.com
# FINNHUB_API_KEY        — free at finnhub.io (60 calls/min free tier)
# GOOGLE_MAPS_API_KEY    — free at console.cloud.google.com
# SENTINEL_HUB_CLIENT_ID and SENTINEL_HUB_CLIENT_SECRET — free at dataspace.copernicus.eu

# Run locally
npm run dev

# Deploy to Vercel
vercel --prod
```

## Business model

- **$29/month** subscription
- 7 real alternative data signals per stock (expandable to 50+ stocks)
- Target: active retail investors (50+ trades/year) who care about execution quality
- TAM: 150M retail investors in the US
- Referral revenue potential from brokers (Fidelity, IBKR) who benefit from informed investors

## Hackathon

Built for: Encode Club Vibe Coding Hackathon
Track: BGA Bounty — AI Trading & Strategy, fairer and transparent markets
Built with: Next.js 14, Anthropic Claude Sonnet, Finnhub, SEC EDGAR, ApeWisdom, Google Maps, ESA Copernicus, Yahoo Finance
