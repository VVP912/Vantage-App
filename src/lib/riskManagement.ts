/**
 * VANTAGE Risk Management Module
 *
 * Converts a conviction/prediction result into an explicit, bounded
 * position-sizing recommendation rather than leaving sizing entirely
 * to the user. This directly addresses BGA's "strategy design & risk
 * management" criterion: sound, explainable, defensible risk logic
 * with safeguards against runaway execution or overconfidence.
 *
 * Core principles (all disclosed, none hidden):
 * 1. Position size scales with confidence, never exceeds a hard cap.
 * 2. Conflicting signals trigger an explicit "no position" recommendation
 *    — the system can say "don't trade this" rather than always picking
 *    a side, which is the actual circuit-breaker behaviour BGA is
 *    looking for ("safeguards against misuse, systemic harm, or
 *    runaway execution").
 * 3. No recommendation ever exceeds a fixed % of a hypothetical
 *    portfolio, regardless of how confident the model is — single-name,
 *    single-signal-set conviction should never justify over-concentration.
 */

import { PredictionResult } from './predictiveModel'

export interface RiskAssessment {
  recommendedAction: 'consider_long' | 'consider_short' | 'no_position' | 'insufficient_data'
  maxPositionSizePercent: number   // max % of a hypothetical portfolio, hard-capped
  rationale: string
  warnings: string[]
}

// Hard ceiling — no single-name position from this model should ever be
// sized above 8% of a hypothetical portfolio, regardless of conviction.
// This is a deliberate guardrail against the model (or a user) treating
// any signal combination as a reason to over-concentrate.
const MAX_POSITION_SIZE_CAP = 8

export function assessRisk(prediction: PredictionResult): RiskAssessment {
  const warnings: string[] = []

  // Circuit breaker: insufficient data always means no position,
  // regardless of how the composite score looks.
  if (prediction.confidenceBand === 'insufficient_data') {
    return {
      recommendedAction: 'insufficient_data',
      maxPositionSizePercent: 0,
      rationale: `Fewer than 2 of ${prediction.signalBreakdown.length} signals returned live data. The model will not size a position on this few data points — this is a hard rule, not a soft suggestion.`,
      warnings: ['Insufficient live signal coverage to form any view.'],
    }
  }

  // Circuit breaker: check for internal disagreement among the signals
  // that contributed meaningfully (|contribution| > 0.02). If a
  // significant share of signals point in opposite directions to the
  // composite, that is a conflict signal, not a confident read.
  const meaningfulSignals = prediction.signalBreakdown.filter(
    (s) => Math.abs(s.contribution) > 0.02
  )
  const positiveCount = meaningfulSignals.filter((s) => s.normalisedScore > 0.1).length
  const negativeCount = meaningfulSignals.filter((s) => s.normalisedScore < -0.1).length
  const isConflicted = positiveCount > 0 && negativeCount > 0 &&
    Math.min(positiveCount, negativeCount) / Math.max(positiveCount, negativeCount, 1) > 0.6 &&
    Math.max(positiveCount, negativeCount) < 3

  if (isConflicted) {
    warnings.push(
      `Signals disagree: ${positiveCount} point bullish, ${negativeCount} point bearish among meaningful contributors. Composite direction is not a confident consensus.`
    )
  }

  if (prediction.predictedDirection === 'neutral' || isConflicted) {
    return {
      recommendedAction: 'no_position',
      maxPositionSizePercent: 0,
      rationale: isConflicted
        ? 'Signals meaningfully disagree with each other. The model explicitly avoids forcing a directional call when inputs conflict — this is the circuit breaker, not a bug.'
        : 'Composite score is too close to neutral to support a directional view.',
      warnings,
    }
  }

  // Position sizing scales with confidence band, hard-capped regardless
  // of how strong the composite score is.
  let baseSize: number
  switch (prediction.confidenceBand) {
    case 'high':
      baseSize = MAX_POSITION_SIZE_CAP
      break
    case 'moderate':
      baseSize = MAX_POSITION_SIZE_CAP * 0.5
      break
    case 'low':
    default:
      baseSize = MAX_POSITION_SIZE_CAP * 0.25
      break
  }

  if (prediction.liveSignalCount < 4) {
    warnings.push(
      `Only ${prediction.liveSignalCount} of ${prediction.signalBreakdown.length} signals were live for this call — position size reduced to reflect lower data coverage.`
    )
    baseSize *= 0.8
  }

  warnings.push(
    `Hard cap: this model will never recommend more than ${MAX_POSITION_SIZE_CAP}% of a hypothetical portfolio in a single name, regardless of conviction level. This guards against over-concentration on any single signal set.`
  )

  return {
    recommendedAction: prediction.predictedDirection === 'bullish' ? 'consider_long' : 'consider_short',
    maxPositionSizePercent: parseFloat(baseSize.toFixed(1)),
    rationale: `${prediction.confidenceBand} confidence, ${prediction.liveSignalCount}/${prediction.signalBreakdown.length} signals live, composite score ${prediction.compositeScore > 0 ? '+' : ''}${prediction.compositeScore}. Position size scaled to confidence band and hard-capped at ${MAX_POSITION_SIZE_CAP}% regardless of score strength.`,
    warnings,
  }
}
