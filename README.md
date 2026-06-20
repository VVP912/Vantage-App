# VANTAGE — Alternative Data Intelligence Platform

> What does the hedge fund know that you don't?

A two-act product that first exposes how hedge funds use alternative data to trade against retail investors, then gives retail investors access to the same signals for $29/month.

## BGA bounty alignment

VANTAGE was built for the BGA "AI Trading & Strategy" track, which explicitly rewards better systems over higher returns. Each criterion maps to a specific part of the build:

- **Alignment with BGA ethos** — the entire product is a reducing-information-asymmetry mechanism, not a PnL-maximisation tool. The game and product never claim to predict winning trades; they expose what data institutions have that retail doesn't.
- **Innovation & technical depth** — 8 real external data integrations including Bybit's public crypto market API, a genuinely agentic conviction step (forced tool-use, not prompt dressing), a deterministic predictive scoring model, and a real Solidity contract on a live testnet.
- **Strategy design & risk management** — explicit, hard-capped position sizing and a circuit breaker that recommends no position when signals conflict, rather than always forcing a directional call. See "Predictive model, risk management, and on-chain verification" below.
- **Transparency & verifiability** — every signal's source, cost, and free/paid status is shown in the UI; the predictive model's weights and rationale are visible, not hidden in a prompt; conviction calls can be logged on-chain and independently verified before the outcome is known.
- **Real-world impact** — closes a genuine $2-5M/year vs $29/month access gap for retail investors.
- **User accessibility & UX** — the trading game is the on-ramp; no prior knowledge of alternative data is required to understand the reveal.

## Real data sources

| Source | Data | Cost | Auth |
|--------|------|------|------|
| **Yahoo Finance** (via yahoo-finance2) | Real-time stock quotes, price, volume, 52-week range | Free | None |
| **Finnhub.io free tier** | Insider transactions (Form 3/4/5), insider sentiment MSPR score, company news, news sentiment | Free | API key (free at finnhub.io) |
| **SEC EDGAR** (data.sec.gov) | Form 4 filing velocity, company submissions history | Free | None (User-Agent header only) |
| **ApeWisdom** | Reddit mentions across r/wallstreetbets, r/stocks, r/options, r/investing | Free | None |
| **Google Maps Popular Times** | Real-time foot traffic / busyness scores for company locations | Free tier | API key |
| **ESA Copernicus Sentinel-2** | Satellite facility activity via NDVI/NDBI change detection | Free tier | OAuth client ID + secret |
| **Bybit V5 public API** | Crypto market-wide risk appetite via BTC/ETH perpetual funding rates | Free | None |

### What each signal means

**Finnhub Insider MSPR** — Monthly Share Purchase Ratio. Ranges from -100 (most bearish insider activity) to +100 (most bullish). Calculated from Form 3/4/5 filings. Academic research shows MSPR predicts 30-90 day price moves.

**SEC EDGAR Form 4 velocity** — How many insider transactions filed in the last 30/90 days. Clustering of filings (3+ insiders in 48 hours) is a qualitatively different signal than normal activity. Completely free, no API key, just a User-Agent header required.

**ApeWisdom Reddit rank** — Real-time ticker mention rankings across 50+ subreddits. No API key. Refreshed every ~30 minutes. Returns rank, mentions, upvotes, and 24h change. Research shows social volume spikes precede price moves.

**Finnhub news sentiment** — Bullish/bearish percentage across all company news in last 7 days. Combined with article count gives a picture of media narrative direction.

**Yahoo Finance quote** — Real-time price, change %, volume vs average. High volume divergence from price is itself an alternative signal.

**Google Maps Popular Times** — Real busyness scores (0-100) for specific company locations, derived from opted-in location history. The closest free proxy to commercial foot-traffic data like SafeGraph or Placer.ai.

**ESA Sentinel-2 satellite** — NDVI/NDBI change detection over company facility bounding boxes, comparing the most recent 30 days to the prior 30. A genuine, free proxy for the kind of facility-activity signal hedge funds pay Planet Labs or Maxar millions per year for, at lower resolution and revisit frequency.

**Bybit crypto macro (BTC/ETH funding rates)** — VANTAGE trades equities, not crypto, so this isn't a trading-venue integration. It's an eighth signal: Bybit's public, no-key market data on BTCUSDT and ETHUSDT perpetual futures, specifically the funding rate, used as a market-wide risk-appetite gauge. A strongly positive funding rate means leveraged long positioning is crowded across crypto markets — historically a real, widely-watched proxy for broader risk-on euphoria that often correlates with equity market behaviour too. This is genuinely how some institutional desks use crypto positioning data: as macro context, not as a stock-specific signal. It's weighted lowest of all eight signals in the predictive model for exactly that reason — market-wide, not company-specific — but it's live, real, and disclosed rather than a stretch claim of "blockchain integration."

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

## Short-term or long-term?

VANTAGE is built for short-term, catalyst-driven trading — specifically positioning ahead of earnings and similar near-term events — not long-term fundamental investing.

This is by design, not a limitation. Every signal in the stack measures current-moment operational state rather than long-run fundamentals: satellite imagery and foot traffic show what's happening at a facility this month, Form 4 filing velocity and Reddit mentions are read for recent directional shifts, news sentiment is a 7-day window. Alternative data of this kind is genuinely most predictive in tight windows around a known catalyst — it gets noisier and less informative the further out you try to extrapolate it, which is also why institutional desks use it the same way: to sharpen a near-term view ahead of a specific event, not to set a multi-year thesis. A long-term value investor doesn't need this week's car park occupancy.

The product also doesn't issue explicit buy/sell recommendations. Instead it shows the raw signals plus a conviction assessment (see "What's agentic" below) — deliberately stopping short of "buy X shares now." That's the line between alternative-data infrastructure and registered investment advice, and VANTAGE sits on the infrastructure side of it.

## Codeplain

`vantage.plain` in the project root is the full Plain specification for this app, written for the Codeplain bounty. It defines every screen, data integration, and behaviour as concepts and functional specs that Codeplain can render into code.

## What's agentic

Most of VANTAGE's Claude calls are single-shot generation: feed pre-fetched data in, get written analysis out. That's an LLM call, not an agent.

The one genuinely agentic step is the **conviction agent** inside `/api/edge-analysis`. Before the prose synthesis is generated, a separate call to Claude is made with `tool_choice` forced to a single tool, `set_conviction`. Claude is handed the seven raw live signal values for the selected stock and must commit to a structured decision — a conviction level (high / moderate / low / insufficient data), how many of the live signals actually agree with each other, which signals it weighted most heavily, and a one-sentence justification — without any hardcoded threshold logic from the app telling it how to decide.

This matters for two reasons. First, it's auditable: the conviction badge shown on the product screen is the model's own structured judgment, not a `score > 5 ? 'bullish' : 'bearish'` if-statement dressed up in a prompt. Second, it's honest about data quality — the agent is instructed to return "insufficient data" whenever fewer than three of the eight signals returned live data, regardless of which direction those signals point, so a sparse dataset can't be spun into false confidence.

The conviction result streams to the client as the first server-sent event, ahead of the prose analysis, so the badge renders before the written synthesis starts typing out.

## Predictive model, risk management, and on-chain verification

Three further additions built specifically to address strategy design, risk management, and transparency as real systems, not just framing.

**Predictive model (`src/lib/predictiveModel.ts`)** — a deterministic, rule-based weighted scoring function, not an LLM call. Each of the 8 signals is normalised to [-1, +1], multiplied by a fixed weight (weights sum to 1.0), and summed into a composite score. Weights are assigned by data-quality rationale — satellite and foot traffic carry the most weight as the closest free proxies to institutional-grade data, news sentiment carries the least as the most commoditised signal — not by backtesting, because with only 6 demo stocks and no real trade history, a trained ML model would overfit and misrepresent its own reliability. That limitation is disclosed in the UI, not hidden. The model returns "insufficient data" confidence whenever fewer than 3 of 8 signals are live, mirroring the conviction agent's own rule.

**Risk management (`src/lib/riskManagement.ts`)** — converts the predictive model's output into a bounded, explainable position-sizing recommendation. Position size scales with confidence but is hard-capped at 8% of a hypothetical portfolio regardless of how strong the composite score is. If signals meaningfully disagree with each other, the system explicitly recommends "no position" rather than forcing a directional call — a real circuit breaker against overconfidence, not just a disclaimer.

**On-chain verification (`contracts/VantagePredictionLog.sol`)** — a Solidity contract deployed to the Polygon Amoy testnet that logs each conviction call as a transaction containing a hash of the signal values, the conviction level, and a block timestamp, before the underlying earnings outcome is known. Anyone can independently verify on PolygonScan that a prediction was made honestly and wasn't altered after the fact. See `CONTRACT_DEPLOYMENT.md` for the deployment steps.

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
# VANTAGE_CONTRACT_ADDRESS and VANTAGE_WALLET_PRIVATE_KEY — see CONTRACT_DEPLOYMENT.md (optional, enables on-chain verification)

# Run locally
npm run dev

# Deploy to Vercel
vercel --prod
```

## Business model

- **$29/month** subscription
- 8 real alternative data signals per stock (expandable to 50+ stocks)
- Target: active, short-term retail traders (50+ trades/year) who position around earnings and other near-term catalysts, not buy-and-hold investors
- TAM: 150M retail investors in the US
- Referral revenue potential from brokers (Fidelity, IBKR) who benefit from informed investors

## Hackathon

Built for: Encode Club Vibe Coding Hackathon
Track: BGA Bounty — AI Trading & Strategy, fairer and transparent markets
Built with: Next.js 14, Anthropic Claude Sonnet, Finnhub, SEC EDGAR, ApeWisdom, Google Maps, ESA Copernicus, Yahoo Finance, Solidity, Polygon Amoy testnet, ethers.js
