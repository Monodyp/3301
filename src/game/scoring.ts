// Scoring follows GDD section 9: +100 per correct decision, up to +25 for
// deciding quickly, up to +10 for investigating. Maximum base score is 800.
// The numbers live in SCORING so they can be tuned after playtesting.

import type { Category, DecisionRecord, HorrorStage, ScoreBreakdown, SurvivalRating } from './types.ts'

export const SCORING = {
  correct: 100,
  maxTimeBonus: 25,
  // Full time bonus if decided within this many seconds of starting to investigate...
  fullTimeBonusSeconds: 15,
  // ...falling to zero at this many seconds (each encounter has roughly 40 s in a 7-minute run).
  noTimeBonusSeconds: 45,
  maxClueBonus: 10,
  // Each hint the player needed takes this much off the clue bonus.
  hintPenalty: 3,
} as const

export function timeBonus(secondsTaken: number, correct: boolean): number {
  if (!correct) return 0
  const { maxTimeBonus, fullTimeBonusSeconds, noTimeBonusSeconds } = SCORING
  if (secondsTaken <= fullTimeBonusSeconds) return maxTimeBonus
  if (secondsTaken >= noTimeBonusSeconds) return 0
  const fraction = (noTimeBonusSeconds - secondsTaken) / (noTimeBonusSeconds - fullTimeBonusSeconds)
  return Math.round(maxTimeBonus * fraction)
}

export function clueBonus(inspectedKeyEvidence: number, totalKeyEvidence: number, hintsUsed: number): number {
  if (totalKeyEvidence <= 0) return 0
  const share = Math.min(1, inspectedKeyEvidence / totalKeyEvidence)
  const raw = Math.round(SCORING.maxClueBonus * share) - hintsUsed * SCORING.hintPenalty
  return Math.max(0, raw)
}

export function scoreDecision(input: {
  correct: boolean
  secondsTaken: number
  inspectedKeyEvidence: number
  totalKeyEvidence: number
  hintsUsed: number
}): ScoreBreakdown {
  const base = input.correct ? SCORING.correct : 0
  const t = timeBonus(input.secondsTaken, input.correct)
  const c = clueBonus(input.inspectedKeyEvidence, input.totalKeyEvidence, input.hintsUsed)
  return { base, timeBonus: t, clueBonus: c, total: base + t + c }
}

// GDD 9.3. Provisional; adjust after playtesting.
export function survivalRating(correctCount: number): SurvivalRating {
  if (correctCount >= 8) return 'FULLY SECURED'
  if (correctCount >= 6) return 'MOSTLY SECURED'
  if (correctCount >= 4) return 'PARTIALLY COMPROMISED'
  if (correctCount >= 2) return 'CRITICAL'
  return 'BLACKED OUT'
}

export function eventSurvivalRating(correctCount: number): SurvivalRating {
  if (correctCount >= 5) return 'FULLY SECURED'
  if (correctCount >= 4) return 'MOSTLY SECURED'
  if (correctCount >= 3) return 'PARTIALLY COMPROMISED'
  if (correctCount >= 2) return 'CRITICAL'
  return 'BLACKED OUT'
}

export interface CategoryResult {
  category: Category
  correct: number
  total: number
}

export function resultsByCategory(history: readonly DecisionRecord[]): CategoryResult[] {
  const order: Category[] = ['awareness', 'responsibility', 'opportunity']
  return order.map(category => {
    const inCategory = history.filter(d => d.category === category)
    return { category, correct: inCategory.filter(d => d.correct).length, total: inCategory.length }
  })
}

// Horror rises with progress through the run, not only with mistakes
// (Stage 4, section 8). Mistakes push it one step further, earlier.
export function horrorStageFor(completed: number, mistakes: number): HorrorStage {
  const level = completed + Math.min(mistakes, 3)
  if (completed === 0) return 'NORMAL'
  if (level >= 8) return 'BLACKOUT'
  if (level >= 4) return 'COMPROMISED'
  return 'UNSETTLED'
}
