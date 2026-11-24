import type { Category, DecisionRecord, Encounter } from './types'

// Seminar titles are not reproduced here as exact program names because the
// repository did not provide a verified seminar-topic schedule. These editable
// labels describe the mapped learning areas and should be confirmed by Priority 3.
export const EDUCATIONAL_DEBRIEF: Record<Category, {
  topic: string
  lesson: string
  takeaway: string
  confirmation: 'repository-confirmed' | 'needs-seminar-confirmation'
}> = {
  awareness: {
    topic: 'Cybersecurity awareness',
    lesson: 'Recognize manipulation, urgency, unusual communities and suspicious opportunities before acting.',
    takeaway: 'Pause, verify independently and keep personal or account information private.',
    confirmation: 'needs-seminar-confirmation',
  },
  responsibility: {
    topic: 'Responsible account and incident response',
    lesson: 'Protect accounts and finances through verification, secure channels and timely reporting.',
    takeaway: 'Use official channels, secure affected accounts and report suspected cybercrime when appropriate.',
    confirmation: 'needs-seminar-confirmation',
  },
  opportunity: {
    topic: 'Cybersecurity opportunity and professional engagement awareness',
    lesson: 'Evaluate jobs, sponsorships and technical work for hidden access, payment or identity risks.',
    takeaway: 'Verify organizations and do not share credentials or disable security controls for an opportunity.',
    confirmation: 'needs-seminar-confirmation',
  },
}

export interface DecisionFeedback {
  result: 'Correct' | 'Incorrect'
  category: Category
  principle: string
  recommendedAction: string
  selectedOutcome: string
  saferChoice?: string
}

export function feedbackForDecision(encounter: Encounter, decision: DecisionRecord): DecisionFeedback {
  const selected = encounter.choices.find(choice => choice.id === decision.choiceId)
  const safer = encounter.choices.find(choice => choice.isCorrect)
  return {
    result: decision.correct ? 'Correct' : 'Incorrect',
    category: decision.category,
    principle: encounter.feedback.principle,
    recommendedAction: encounter.feedback.recommendedAction,
    selectedOutcome: selected?.outcome ?? 'This response did not protect the account or information.',
    saferChoice: decision.correct ? undefined : safer?.text,
  }
}

export function formatCompletionTime(runStartedAt: number | null, runFinishedAt: number | null): string {
  if (runStartedAt === null || runFinishedAt === null) return '0:00'
  const seconds = Math.max(0, Math.floor((runFinishedAt - runStartedAt) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}
