// Scenario definitions for every authored encounter.
//
// Nothing here is new story. Each encounter's existing content (trigger
// notification, thread, incoming call, key artifacts, choices) is mapped onto
// two scenarios:
//
//   S1 Incident       The trigger notification arrives. The player has to open
//                     the incident itself (the conversation, email, post or
//                     call screen) before anything else counts.
//   S2 Investigation  The player has to take in the authored narrative (read
//                     the thread to the end, or hear the call / voicemail) and
//                     find every key artifact. Only then does the decision
//                     unlock.
//
// NARRATIVE_SPECS records, per encounter, where the existing content is
// presented and what is missing. Where the content does not say something
// (for example an attachment that cannot be opened) it is listed in `gaps`
// instead of being made up.

import type {
  AppId,
  Artifact,
  Character,
  DecisionDefinition,
  Encounter,
  EncounterNarrative,
  ScenarioAction,
  ScenarioDefinition,
} from '../types.ts'
import { CHARACTERS } from './index.ts'

// Phone event targets. Screens build targets with these helpers so the
// strings always match the definitions below.
export const PHONE_TARGETS = {
  incident: (encounterId: string) => `incident:${encounterId}`,
  voicemail: (encounterId: string) => `voicemail:${encounterId}`,
  artifact: (artifactId: string) => `artifact:${artifactId}`,
  ambient: (app: AppId, id: string | number) => `ambient:${app}:${id}`,
} as const

// Ids of the narrative content a scenario requires the player to have seen.
export const NARRATIVE_CONTENT = {
  notice: (encounterId: string) => `${encounterId}:incident-notice`,
  thread: (encounterId: string) => `${encounterId}:thread`,
  call: (encounterId: string) => `${encounterId}:call-audio`,
} as const

// Where a clue's content is shown. A clue in the incident's own app belongs to
// the incident (the thread, email or post it describes) and appears inside that
// view; any other clue appears on the main screen of its own app. Artifacts are
// authored with an app but no finer anchor, so this is as specific as the
// content allows.
export interface ClueSource {
  app: AppId
  surface: 'incident' | 'app'
}

export function clueSource(encounter: Encounter, artifact: Artifact): ClueSource {
  const inIncident = artifact.app === encounter.trigger.app && encounter.trigger.app !== 'calls'
  return { app: artifact.app, surface: inIncident ? 'incident' : 'app' }
}

interface NarrativeSpec {
  // Encounters that must be resolved before this one unlocks. None of the
  // authored content depends on another encounter yet, so these are all empty;
  // the engine still honours them over the shuffled order.
  requires?: string[]
  // Whether the encounter's thread is shown on the incident surface. `false`
  // means the thread exists in the content but no screen presents it.
  threadPresented: boolean
  gaps?: string[]
}

const ATTACHMENT_GAP =
  'The thread mentions an attachment, but there is no attachment object to open, so ATTACHMENT_OPENED is not a required action. The evidence is found through the artifact cue.'
const SIDE_CHAT_GAP = (friend: string) =>
  `The thread is a side conversation with ${friend}, not email text. It is shown under the email until a dedicated chat is authored.`
const CALL_THREAD_GAP =
  'The thread has no screen that presents it (calls show only the call content and voicemail), so it is not required narrative. Author a follow-up chat to use it.'

export const NARRATIVE_SPECS: Record<string, NarrativeSpec> = {
  // Mika
  'MK-A1': { threadPresented: true },
  'MK-A2': { threadPresented: true },
  'MK-A3': { threadPresented: true },
  'MK-R1': { threadPresented: true, gaps: [SIDE_CHAT_GAP('Rafa')] },
  'MK-R2': { threadPresented: true },
  'MK-R3': { threadPresented: false, gaps: [CALL_THREAD_GAP] },
  'MK-O1': { threadPresented: true },
  'MK-O2': { threadPresented: true, gaps: [ATTACHMENT_GAP] },
  // Rafa
  'RF-A1': { threadPresented: true },
  'RF-A2': { threadPresented: true },
  'RF-A3': { threadPresented: true },
  'RF-R1': { threadPresented: true, gaps: [SIDE_CHAT_GAP('Nico')] },
  'RF-R2': { threadPresented: true },
  'RF-R3': { threadPresented: false, gaps: [CALL_THREAD_GAP] },
  'RF-O1': { threadPresented: true },
  'RF-O2': { threadPresented: true, gaps: [ATTACHMENT_GAP] },
}

const SURFACE_NOUN: Partial<Record<AppId, string>> = {
  messages: 'conversation',
  email: 'email',
  social: 'post',
  calls: 'incoming call',
  browser: 'page',
}

export function buildEncounterNarrative(encounter: Encounter, spec: NarrativeSpec): EncounterNarrative {
  const { id, characterId, trigger } = encounter
  const incident = PHONE_TARGETS.incident(id)
  const s1 = `${id}-S1`
  const s2 = `${id}-S2`
  const decisionId = `${id}-D1`
  const noticeId = NARRATIVE_CONTENT.notice(id)
  const threadId = NARRATIVE_CONTENT.thread(id)
  const callId = NARRATIVE_CONTENT.call(id)

  const open: ScenarioAction = {
    id: `${s1}-open`,
    description: `Open the ${SURFACE_NOUN[trigger.app] ?? 'incident'} from ${trigger.sender} in ${trigger.app}.`,
    anyOf: [{ kind: 'CONVERSATION_OPENED', app: trigger.app, target: incident }],
    presents: [noticeId],
  }

  const investigation: ScenarioAction[] = []
  const investigationContent: ScenarioDefinition['narrativeContent'] = []
  if (spec.threadPresented && encounter.thread.length > 0) {
    investigation.push({
      id: `${s2}-read`,
      description: `Read the ${SURFACE_NOUN[trigger.app] ?? 'thread'} from ${trigger.sender} to the end.`,
      anyOf: [{ kind: 'MESSAGE_READ', app: trigger.app, target: incident }],
      presents: [threadId],
    })
    investigationContent.push({ id: threadId, source: 'thread', app: trigger.app })
  }
  if (encounter.incomingCall) {
    investigation.push({
      id: `${s2}-call`,
      description: `Hear ${encounter.incomingCall.caller}: answer the call and end it, or play the voicemail.`,
      anyOf: [
        { kind: 'CALL_COMPLETED', app: 'calls', target: incident },
        { kind: 'MESSAGE_READ', app: 'calls', target: PHONE_TARGETS.voicemail(id) },
      ],
      presents: [callId],
    })
    investigationContent.push({ id: callId, source: 'incomingCall', app: 'calls' })
  }

  const scenarios: ScenarioDefinition[] = [
    {
      id: s1,
      encounterId: id,
      characterId,
      title: `${encounter.title}: incident`,
      narrativeContent: [{ id: noticeId, source: 'trigger', app: trigger.app }],
      requiredActions: [open],
      startsWhen: { kind: 'incident-delivered' },
      requiredEvidence: [],
      decisionId: null,
      completesWhen: 'actions-complete',
      next: { kind: 'scenario', scenarioId: s2 },
    },
    {
      id: s2,
      encounterId: id,
      characterId,
      title: `${encounter.title}: investigation`,
      narrativeContent: investigationContent,
      requiredActions: investigation,
      startsWhen: { kind: 'scenario-completed', scenarioId: s1 },
      requiredEvidence: encounter.artifacts.filter(a => a.isKeyEvidence).map(a => a.id),
      decisionId,
      completesWhen: 'decision-submitted',
      next: { kind: 'next-encounter' },
    },
  ]

  const decision: DecisionDefinition = {
    id: decisionId,
    characterId,
    encounterId: id,
    scenarioId: s2,
    prompt: encounter.prompt,
    choiceIds: encounter.choices.map(c => c.id),
  }

  return {
    encounterId: id,
    characterId,
    requiresEncounters: spec.requires ?? [],
    scenarios,
    decision,
    gaps: spec.gaps ?? [],
  }
}

function buildAll(characters: readonly Character[]): Map<string, EncounterNarrative> {
  const all = new Map<string, EncounterNarrative>()
  for (const character of characters) {
    for (const encounter of character.encounters) {
      const spec = NARRATIVE_SPECS[encounter.id]
      if (spec) all.set(encounter.id, buildEncounterNarrative(encounter, spec))
    }
  }
  return all
}

export const ENCOUNTER_NARRATIVES: ReadonlyMap<string, EncounterNarrative> = buildAll(CHARACTERS)

const SCENARIOS = new Map<string, ScenarioDefinition>()
const DECISIONS = new Map<string, DecisionDefinition>()
for (const narrative of ENCOUNTER_NARRATIVES.values()) {
  for (const scenario of narrative.scenarios) SCENARIOS.set(scenario.id, scenario)
  DECISIONS.set(narrative.decision.id, narrative.decision)
}

export function getEncounterNarrative(encounterId: string | null): EncounterNarrative | undefined {
  return encounterId ? ENCOUNTER_NARRATIVES.get(encounterId) : undefined
}

export function getScenario(scenarioId: string | null): ScenarioDefinition | undefined {
  return scenarioId ? SCENARIOS.get(scenarioId) : undefined
}

export function getDecision(decisionId: string | null): DecisionDefinition | undefined {
  return decisionId ? DECISIONS.get(decisionId) : undefined
}

// Checks the rules the engine relies on. Run by the tests next to validateContent().
export function validateNarrative(characters: readonly Character[] = CHARACTERS): string[] {
  const problems: string[] = []
  const narratives = characters === CHARACTERS ? ENCOUNTER_NARRATIVES : buildAll(characters)
  const seen = new Set<string>()
  const note = (id: string, where: string) => {
    if (seen.has(id)) problems.push(`${where}: duplicate id ${id}`)
    seen.add(id)
  }

  for (const character of characters) {
    const ids = new Set(character.encounters.map(e => e.id))
    for (const encounter of character.encounters) {
      const where = `${character.id}/${encounter.id}`
      const narrative = narratives.get(encounter.id)
      if (!narrative) {
        problems.push(`${where}: has no scenario definition in NARRATIVE_SPECS`)
        continue
      }
      for (const required of narrative.requiresEncounters) {
        if (!ids.has(required)) problems.push(`${where}: requires unknown or other-character encounter ${required}`)
      }
      const artifactIds = new Set(encounter.artifacts.map(a => a.id))
      for (const artifact of encounter.artifacts) {
        if (!character.apps.includes(artifact.app)) problems.push(`${where}: clue ${artifact.id} lives in ${artifact.app}, which ${character.id}'s phone does not have`)
      }
      const choiceIds = new Set(encounter.choices.map(c => c.id))
      const scenarioIds = new Set(narrative.scenarios.map(s => s.id))
      let decisions = 0
      for (const scenario of narrative.scenarios) {
        note(scenario.id, where)
        if (scenario.encounterId !== encounter.id || scenario.characterId !== character.id) problems.push(`${where}: ${scenario.id} points at the wrong encounter or character`)
        if (scenario.requiredActions.length === 0) problems.push(`${where}: ${scenario.id} has no required player action`)
        if (scenario.narrativeContent.length === 0) problems.push(`${where}: ${scenario.id} presents no narrative content`)
        const presented = new Set(scenario.requiredActions.flatMap(a => a.presents))
        for (const content of scenario.narrativeContent) {
          if (!presented.has(content.id)) problems.push(`${where}: ${scenario.id} requires ${content.id} but no action presents it`)
        }
        for (const action of scenario.requiredActions) {
          note(action.id, where)
          if (action.anyOf.length === 0) problems.push(`${where}: ${action.id} has no completing event`)
        }
        for (const artifactId of scenario.requiredEvidence) {
          if (!artifactIds.has(artifactId)) problems.push(`${where}: ${scenario.id} needs unknown artifact ${artifactId}`)
        }
        if (scenario.startsWhen.kind === 'scenario-completed' && !scenarioIds.has(scenario.startsWhen.scenarioId)) problems.push(`${where}: ${scenario.id} starts after unknown scenario`)
        if (scenario.next.kind === 'scenario' && !scenarioIds.has(scenario.next.scenarioId)) problems.push(`${where}: ${scenario.id} continues to unknown scenario`)
        if (scenario.decisionId) {
          decisions++
          if (scenario.decisionId !== narrative.decision.id) problems.push(`${where}: ${scenario.id} unlocks a decision from elsewhere`)
          if (scenario.completesWhen !== 'decision-submitted') problems.push(`${where}: ${scenario.id} has a decision but completes without it`)
          if (scenario.requiredEvidence.length === 0) problems.push(`${where}: ${scenario.id} unlocks a decision with no evidence required`)
        }
      }
      if (decisions !== 1) problems.push(`${where}: needs exactly one scenario with a decision, has ${decisions}`)
      const { decision } = narrative
      note(decision.id, where)
      if (decision.characterId !== character.id || decision.encounterId !== encounter.id) problems.push(`${where}: decision points at the wrong encounter or character`)
      if (!scenarioIds.has(decision.scenarioId)) problems.push(`${where}: decision belongs to unknown scenario ${decision.scenarioId}`)
      if (decision.choiceIds.length !== choiceIds.size || decision.choiceIds.some(c => !choiceIds.has(c))) problems.push(`${where}: decision choices do not match the encounter's choices`)
    }
    if (hasCycle(character.encounters.map(e => e.id), id => narratives.get(id)?.requiresEncounters ?? [])) {
      problems.push(`${character.id}: encounter prerequisites form a cycle`)
    }
  }
  return problems
}

function hasCycle(ids: string[], requires: (id: string) => string[]): boolean {
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (id: string): boolean => {
    if (state.get(id) === 'done') return false
    if (state.get(id) === 'visiting') return true
    state.set(id, 'visiting')
    const cyclic = requires(id).some(visit)
    state.set(id, 'done')
    return cyclic
  }
  return ids.some(visit)
}
