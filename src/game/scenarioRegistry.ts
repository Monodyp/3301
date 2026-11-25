import type { AppId } from '../types/index.ts'
import { CHARACTERS, getEncounter } from './content/index.ts'
import type { Character, Encounter } from './types.ts'

export const BACKEND_SCENARIO_IDS = [
  'MK-A1',
  'MK-A2',
  'MK-A3',
  'MK-R1',
  'MK-R2',
  'MK-R3',
  'MK-O1',
  'MK-O2',
  'RF-A1',
  'RF-A2',
  'RF-A3',
  'RF-R1',
  'RF-R2',
  'RF-R3',
  'RF-O1',
  'RF-O2',
] as const

export type ScenarioId = (typeof BACKEND_SCENARIO_IDS)[number]
export type NpcIdentity = 'mika' | 'rafa'
export type AuthoredEncounter = Encounter
export type ActionOutcome =
  | { kind: 'resolved'; scenarioId: ScenarioId; actionId: ResolutionActionId; resolvesIncident: true }
  | { kind: 'incorrect'; scenarioId: ScenarioId; actionId: ResolutionActionId; resolvesIncident: false }

export const SUPPORTED_PHONE_SURFACES = [
  'messages',
  'social',
  'email',
  'browser',
  'contacts',
  'calls',
  'wallet',
  'settings',
] as const satisfies readonly AppId[]

export type PhoneSurface = (typeof SUPPORTED_PHONE_SURFACES)[number]

export interface ActionParameter {
  readonly name: string
  readonly expectedValue: string
}

export interface ResolutionActionStep {
  readonly id: string
  readonly surface: PhoneSurface
  readonly label: string
  readonly confirmation: string
}

export interface IncorrectActionBehavior {
  readonly kind: 'leave-unresolved'
  readonly resolvesIncident: false
}

export interface ResolutionAction {
  readonly id: string
  readonly authoredChoiceId: string
  readonly primaryAction: string
  readonly surface: PhoneSurface
  readonly parameters: readonly ActionParameter[]
  readonly steps: readonly ResolutionActionStep[]
  readonly successCondition: string
  readonly incorrectBehavior: IncorrectActionBehavior
  readonly playerDescription: string
}

export interface ScenarioRegistryEntry {
  readonly scenarioId: ScenarioId
  readonly encounter: AuthoredEncounter
  readonly npcIdentity: NpcIdentity
  readonly action: ResolutionAction
}

export type ScenarioAssignmentValidation =
  | {
    ok: true
    scenarioIds: ScenarioId[]
    entries: (typeof SCENARIO_REGISTRY)[number][]
  }
  | { ok: false; error: string }

type ScenarioDefinitionInput = Omit<ScenarioRegistryEntry, 'encounter'>

function bindAuthoredEncounter<const T extends ScenarioDefinitionInput>(
  definition: T,
): T & { encounter: AuthoredEncounter } {
  const encounter = getEncounter(definition.scenarioId)
  if (!encounter) {
    throw new Error(`Scenario registry references missing authored encounter: ${definition.scenarioId}`)
  }
  if (encounter.characterId !== definition.npcIdentity) {
    throw new Error(`Scenario registry NPC identity does not match ${definition.scenarioId}`)
  }
  return { ...definition, encounter }
}

const leaveUnresolved: IncorrectActionBehavior = {
  kind: 'leave-unresolved',
  resolvesIncident: false,
}

function actionSteps(...definitions: readonly (readonly [PhoneSurface, string, string])[]): ResolutionActionStep[] {
  return definitions.map(([surface, label, confirmation], index) => ({
    id: `step-${index + 1}`,
    surface,
    label,
    confirmation,
  }))
}

export const SCENARIO_REGISTRY = [
  bindAuthoredEncounter({
    scenarioId: 'MK-A1',
    npcIdentity: 'mika',
    action: {
      id: 'mk-a1.set-boundaries',
      authoredChoiceId: 'MK-A1-c2',
      primaryAction: 'Keep the conversation on-platform, protect private information, and verify claims independently.',
      surface: 'messages',
      parameters: [],
      steps: actionSteps(
        ['messages', 'Keep the conversation on this platform', 'The conversation stays on a channel you can verify.'],
        ['messages', 'Decline to share private details', 'No private information was shared.'],
        ['browser', 'Check the offer through an independent source', 'The offer was checked without using the sender’s link.'],
      ),
      successCondition: 'Mika keeps boundaries, shares no private information, and independently verifies professional claims.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Set a firm boundary and verify before trusting the contact.',
    },
  }),
  bindAuthoredEncounter({
    scenarioId: 'MK-A2',
    npcIdentity: 'mika',
    action: {
      id: 'mk-a2.leave-and-report',
      authoredChoiceId: 'MK-A2-c2',
      primaryAction: 'Leave the hostile group, preserve evidence, and report credible threats through proper channels.',
      surface: 'social',
      parameters: [],
      steps: actionSteps(
        ['social', 'Save the threatening post', 'The post is preserved.'],
        ['social', 'Leave the group', 'You are no longer in the hostile group.'],
        ['social', 'Report the threat to the moderators', 'The threat has been reported through the platform.'],
      ),
      successCondition: 'Mika leaves the group, preserves evidence, and reports credible threats appropriately.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Leave the group and report credible threats.',
    },
  }),
  bindAuthoredEncounter({
    scenarioId: 'MK-A3',
    npcIdentity: 'mika',
    action: {
      id: 'mk-a3.verify-sponsorship',
      authoredChoiceId: 'MK-A3-c2',
      primaryAction: 'Verify the company and review the full agreement without letting the deadline decide.',
      surface: 'email',
      parameters: [],
      steps: actionSteps(
        ['email', 'Review the complete agreement', 'The full terms have been reviewed.'],
        ['browser', 'Verify the sponsor independently', 'The sponsor was checked outside the email.'],
        ['email', 'Decline the deadline pressure', 'The deadline no longer dictates the decision.'],
      ),
      successCondition: 'Mika independently verifies the company and reviews the complete agreement without deadline pressure.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Verify the sponsor and review the full agreement before deciding.',
    },
  }),
  bindAuthoredEncounter({
    scenarioId: 'MK-R1',
    npcIdentity: 'mika',
    action: {
      id: 'mk-r1.check-official-account',
      authoredChoiceId: 'MK-R1-c2',
      primaryAction: 'Ignore the email link and check account status through the official app or a typed address.',
      surface: 'settings',
      parameters: [],
      steps: actionSteps(
        ['settings', 'Check account status from Security Center', 'Account status was checked through the phone settings.'],
        ['email', 'Leave the sign-in link unopened', 'The email link was not used.'],
      ),
      successCondition: 'Mika avoids the supplied link and checks account status through an official channel.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Ignore the link and check the account through an official channel.',
    },
  }),
  bindAuthoredEncounter({
    scenarioId: 'MK-R2',
    npcIdentity: 'mika',
    action: {
      id: 'mk-r2.refuse-deposit',
      authoredChoiceId: 'MK-R2-c2',
      primaryAction: 'Refuse the deposit, verify the company independently, and keep the messages.',
      surface: 'wallet',
      parameters: [],
      steps: actionSteps(
        ['wallet', 'Decline the deposit request', 'No deposit was sent.'],
        ['browser', 'Verify the company independently', 'The company was checked outside the payment request.'],
        ['messages', 'Keep the original request', 'The request remains available as a record.'],
      ),
      successCondition: 'Mika sends no deposit, independently verifies the company, and preserves the messages.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Do not pay the deposit; verify the company independently.',
    },
  }),
  bindAuthoredEncounter({
    scenarioId: 'MK-R3',
    npcIdentity: 'mika',
    action: {
      id: 'mk-r3-verify-moderator',
      authoredChoiceId: 'MK-R3-c2',
      primaryAction: 'Do not share the code; contact the moderator through a separate trusted channel.',
      surface: 'contacts',
      parameters: [],
      steps: actionSteps(
        ['contacts', 'Keep the verification code private', 'The code was not shared.'],
        ['contacts', 'Use a saved contact method to reach the moderator', 'You reached the moderator through a trusted contact route.'],
        ['contacts', 'Confirm the request with the moderator', 'The request was checked separately.'],
      ),
      successCondition: 'Mika shares no verification code and verifies the request through a separate trusted channel.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Keep the code private and verify the request separately.',
    },
  }),
  bindAuthoredEncounter({
    scenarioId: 'MK-O1',
    npcIdentity: 'mika',
    action: {
      id: 'mk-o1-review-agency-contract',
      authoredChoiceId: 'MK-O1-c2',
      primaryAction: 'Verify the agency, review the contract, and get qualified advice before giving up account or money control.',
      surface: 'email',
      parameters: [],
      steps: actionSteps(
        ['email', 'Keep account and payment access private', 'No account or payment control was granted.'],
        ['browser', 'Verify the agency independently', 'The agency was checked outside its message.'],
        ['contacts', 'Ask a trusted adviser to review the terms', 'The terms were referred for independent advice.'],
      ),
      successCondition: 'Mika independently verifies the agency and reviews the contract before granting control.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Verify the agency and review the contract before agreeing.',
    },
  }),
  bindAuthoredEncounter({
    scenarioId: 'MK-O2',
    npcIdentity: 'mika',
    action: {
      id: 'mk-o2-refuse-unknown-file',
      authoredChoiceId: 'MK-O2-c2',
      primaryAction: 'Do not run the file; verify the recruiter and software independently, and report if needed.',
      surface: 'messages',
      parameters: [],
      steps: actionSteps(
        ['messages', 'Do not open or run the file', 'The unverified file was not run.'],
        ['browser', 'Verify the recruiter independently', 'The recruiter was checked outside the message.'],
        ['email', 'Request a safe way to review the work', 'A safer review process was requested.'],
      ),
      successCondition: 'Mika does not run the file and independently verifies the recruiter and software.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Do not run the file; verify the recruiter and software first.',
    },
  }),
  bindAuthoredEncounter({
    scenarioId: 'RF-A1',
    npcIdentity: 'rafa',
    action: {
      id: 'rf-a1-restrict-lab-access',
      authoredChoiceId: 'RF-A1-c2',
      primaryAction: 'Keep lab access limited, verify Lance through Ben or an official channel, and share only public schedules.',
      surface: 'messages',
      parameters: [],
      steps: actionSteps(
        ['messages', 'Decline unsupervised lab access', 'Restricted access remains protected.'],
        ['contacts', 'Verify Lance through a saved lab contact', 'Lance was checked through a trusted lab contact.'],
        ['messages', 'Share only public schedule details', 'Restricted schedules were not shared.'],
      ),
      successCondition: 'Rafa grants no restricted access, verifies Lance through a trusted channel, and shares only public schedules.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Limit access and verify Lance through a trusted lab contact.',
    },
  }),
  bindAuthoredEncounter({
    scenarioId: 'RF-A2',
    npcIdentity: 'rafa',
    action: {
      id: 'rf-a2-leave-and-report',
      authoredChoiceId: 'RF-A2-c2',
      primaryAction: 'Leave the group, preserve evidence, and report credible threats through the lab coordinator.',
      surface: 'social',
      parameters: [],
      steps: actionSteps(
        ['social', 'Preserve the threatening post', 'The post is preserved.'],
        ['social', 'Leave the group', 'You are no longer in the hostile group.'],
        ['social', 'Report the threat to the lab coordinator', 'The threat has been reported through the appropriate channel.'],
      ),
      successCondition: 'Rafa leaves the group, preserves evidence, and reports credible threats to the lab coordinator.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Leave the group and report credible threats to the coordinator.',
    },
  }),
  bindAuthoredEncounter({
    scenarioId: 'RF-A3',
    npcIdentity: 'rafa',
    action: {
      id: 'rf-a3-verify-recruiter',
      authoredChoiceId: 'RF-A3-c2',
      primaryAction: 'Independently verify the recruiter and request a contract with authorized scope.',
      surface: 'email',
      parameters: [],
      steps: actionSteps(
        ['email', 'Request written terms and authorized scope', 'The terms and work scope were requested in writing.'],
        ['browser', 'Verify the recruiter independently', 'The recruiter was checked outside the email.'],
        ['email', 'Wait to share identity documents', 'Identity documents remain private until the terms are verified.'],
      ),
      successCondition: 'Rafa verifies the recruiter and obtains the contract and authorized scope before sharing identity documents.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Verify the recruiter and request written terms before sharing identity documents.',
    },
  }),
  bindAuthoredEncounter({
    scenarioId: 'RF-R1',
    npcIdentity: 'rafa',
    action: {
      id: 'rf-r1-check-official-portal',
      authoredChoiceId: 'RF-R1-c2',
      primaryAction: 'Type the official lab address, verify the notice in the real dashboard, and report the email.',
      surface: 'browser',
      parameters: [],
      steps: actionSteps(
        ['browser', 'Type the official lab address and check the dashboard', 'The notice was checked through the official dashboard.'],
        ['email', 'Leave the email link unopened', 'The supplied email link was not used.'],
        ['email', 'Report the suspicious email', 'The suspicious email has been reported.'],
      ),
      successCondition: 'Rafa avoids the email link, verifies the notice in the official dashboard, and reports the email.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Use the official lab address to verify the notice, then report the email.',
    },
  }),
  bindAuthoredEncounter({
    scenarioId: 'RF-R2',
    npcIdentity: 'rafa',
    action: {
      id: 'rf-r2-refuse-personal-payment',
      authoredChoiceId: 'RF-R2-c2',
      primaryAction: 'Decline personal payment and use the campus office’s verified payment channel.',
      surface: 'wallet',
      parameters: [],
      steps: actionSteps(
        ['wallet', 'Decline the personal payment request', 'No personal payment was sent.'],
        ['wallet', 'Choose the campus office’s verified payment channel', 'Payment is limited to the verified campus process.'],
      ),
      successCondition: 'Rafa sends no personal payment and uses the verified campus payment process.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Refuse personal payment and use the verified campus channel.',
    },
  }),
  bindAuthoredEncounter({
    scenarioId: 'RF-R3',
    npcIdentity: 'rafa',
    action: {
      id: 'rf-r3-verify-ben',
      authoredChoiceId: 'RF-R3-c2',
      primaryAction: 'Do not share the code; verify Ben through a known number and alert the coordinator.',
      surface: 'contacts',
      parameters: [],
      steps: actionSteps(
        ['contacts', 'Call Ben using his saved number without sharing the reset code', 'Ben was reached through a known number; the reset code stayed private.'],
        ['email', 'Alert the lab coordinator', 'The coordinator has been alerted to the request.'],
      ),
      successCondition: 'Rafa shares no reset code, verifies Ben through a known number, and alerts the coordinator.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Keep the code private and verify Ben using a known number.',
    },
  }),
  bindAuthoredEncounter({
    scenarioId: 'RF-O1',
    npcIdentity: 'rafa',
    action: {
      id: 'rf-o1-refuse-account-sharing',
      authoredChoiceId: 'RF-O1-c2',
      primaryAction: 'Decline account sharing, verify the employer, and ask for an ordinary interview.',
      surface: 'browser',
      parameters: [],
      steps: actionSteps(
        ['browser', 'Verify the employer independently', 'The employer was checked outside the offer.'],
        ['messages', 'Decline account and document sharing', 'Accounts and lab documents remain private.'],
        ['email', 'Ask for an ordinary interview process', 'A standard interview was requested.'],
      ),
      successCondition: 'Rafa shares no account or lab documents and verifies the employer through a normal interview process.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Keep accounts and lab documents private; verify the employer.',
    },
  }),
  bindAuthoredEncounter({
    scenarioId: 'RF-O2',
    npcIdentity: 'rafa',
    action: {
      id: 'rf-o2-refuse-unsafe-installer',
      authoredChoiceId: 'RF-O2-c2',
      primaryAction: 'Do not run the installer or disable protection; verify the recruiter and request a safer test environment.',
      surface: 'settings',
      parameters: [],
      steps: actionSteps(
        ['settings', 'Keep device protection enabled', 'Device protection remains enabled.'],
        ['messages', 'Do not run the unverified installer', 'The unverified installer was not run.'],
        ['email', 'Request a safer test environment', 'A safer test environment was requested.'],
      ),
      successCondition: 'Rafa does not execute the installer or weaken protection, and requests a verified safer test environment.',
      incorrectBehavior: leaveUnresolved,
      playerDescription: 'Keep protection enabled and do not run the unverified installer.',
    },
  }),
] as const satisfies readonly ScenarioRegistryEntry[]

export type ResolutionActionId = (typeof SCENARIO_REGISTRY)[number]['action']['id']

const registryById = new Map<ScenarioId, (typeof SCENARIO_REGISTRY)[number]>()
for (const entry of SCENARIO_REGISTRY) registryById.set(entry.scenarioId, entry)

const scenarioIdSet = new Set<string>(BACKEND_SCENARIO_IDS)

export function isScenarioId(value: string): value is ScenarioId {
  return scenarioIdSet.has(value)
}

export function getScenarioDefinition(id: ScenarioId): (typeof SCENARIO_REGISTRY)[number] | undefined {
  return registryById.get(id)
}

export function validateScenarioAssignment(value: unknown): ScenarioAssignmentValidation {
  if (!Array.isArray(value)) {
    return { ok: false, error: 'The event service did not return a scenario assignment.' }
  }
  if (value.length !== 5) {
    return { ok: false, error: 'The event service must assign exactly five scenarios.' }
  }

  const scenarioIds: ScenarioId[] = []
  const entries: (typeof SCENARIO_REGISTRY)[number][] = []
  const seen = new Set<string>()
  for (const id of value) {
    if (typeof id !== 'string' || !isScenarioId(id)) {
      return { ok: false, error: `The event service returned an unknown scenario ID: ${String(id)}.` }
    }
    if (seen.has(id)) {
      return { ok: false, error: `The event service returned duplicate scenario ID ${id}.` }
    }
    const entry = getScenarioDefinition(id)
    if (!entry) {
      return { ok: false, error: `Scenario ${id} has no authored content in the registry.` }
    }
    seen.add(id)
    scenarioIds.push(id)
    entries.push(entry)
  }

  return { ok: true, scenarioIds, entries }
}

export function validateScenarioRegistry(
  entries: readonly ScenarioRegistryEntry[] = SCENARIO_REGISTRY,
  characters: readonly Character[] = CHARACTERS,
): string[] {
  const problems: string[] = []
  const scenarioIds = new Set<string>()
  const actionIds = new Set<string>()
  const supportedSurfaces = new Set<string>(SUPPORTED_PHONE_SURFACES)
  const charactersById = new Map(characters.map(character => [character.id, character]))
  const authoredEncounters = new Map(
    characters.flatMap(character => character.encounters.map(encounter => [encounter.id, encounter] as const)),
  )

  if (entries.length !== BACKEND_SCENARIO_IDS.length) {
    problems.push(`registry has ${entries.length} definitions, expected ${BACKEND_SCENARIO_IDS.length}`)
  }

  for (const entry of entries) {
    if (scenarioIds.has(entry.scenarioId)) {
      problems.push(`${entry.scenarioId}: duplicate scenario ID`)
    }
    scenarioIds.add(entry.scenarioId)

    if (!scenarioIdSet.has(entry.scenarioId)) {
      problems.push(`${entry.scenarioId}: not a backend scenario ID`)
    }

    const authoredEncounter = authoredEncounters.get(entry.scenarioId)
    const npc = charactersById.get(entry.npcIdentity)
    if (!authoredEncounter) {
      problems.push(`${entry.scenarioId}: no matching authored encounter`)
    } else {
      if (entry.encounter.id !== entry.scenarioId || entry.encounter !== authoredEncounter) {
        problems.push(`${entry.scenarioId}: does not reference its existing authored encounter`)
      }
      if (entry.encounter.characterId !== entry.npcIdentity) {
        problems.push(`${entry.scenarioId}: NPC identity does not match the authored encounter`)
      }
    }

    const expectedNpc = entry.scenarioId.startsWith('MK-') ? 'mika' : 'rafa'
    if (entry.npcIdentity !== expectedNpc) {
      problems.push(`${entry.scenarioId}: NPC identity does not match its scenario ID`)
    }

    if (actionIds.has(entry.action.id)) {
      problems.push(`${entry.scenarioId}: duplicate resolution action ID ${entry.action.id}`)
    }
    actionIds.add(entry.action.id)

    if (!entry.action.id.trim()) problems.push(`${entry.scenarioId}: resolution action ID is empty`)
    if (!supportedSurfaces.has(entry.action.surface)) {
      problems.push(`${entry.scenarioId}: unsupported phone surface ${entry.action.surface}`)
    }
    if (authoredEncounter && !npc?.apps.includes(entry.action.surface)) {
      problems.push(`${entry.scenarioId}: NPC phone does not include ${entry.action.surface}`)
    }
    if (!entry.action.primaryAction.trim()) problems.push(`${entry.scenarioId}: primary action is empty`)
    if (entry.action.steps.length === 0) problems.push(`${entry.scenarioId}: has no required protective-action steps`)
    if (entry.action.steps[0]?.surface !== entry.action.surface) {
      problems.push(`${entry.scenarioId}: primary action surface must match its first step`)
    }
    const stepIds = new Set<string>()
    for (const step of entry.action.steps) {
      if (!step.id.trim() || stepIds.has(step.id)) problems.push(`${entry.scenarioId}: has an empty or duplicate action step ID`)
      stepIds.add(step.id)
      if (!supportedSurfaces.has(step.surface)) problems.push(`${entry.scenarioId}: unsupported action step surface ${step.surface}`)
      if (authoredEncounter && !npc?.apps.includes(step.surface)) {
        problems.push(`${entry.scenarioId}: NPC phone does not include action surface ${step.surface}`)
      }
      if (!step.label.trim() || !step.confirmation.trim()) problems.push(`${entry.scenarioId}: has an incomplete action step`)
    }
    if (!entry.action.successCondition.trim()) problems.push(`${entry.scenarioId}: success condition is empty`)
    if (!entry.action.playerDescription.trim()) problems.push(`${entry.scenarioId}: player description is empty`)
    if (entry.action.incorrectBehavior.kind !== 'leave-unresolved' || entry.action.incorrectBehavior.resolvesIncident) {
      problems.push(`${entry.scenarioId}: incorrect action must leave the incident unresolved`)
    }

    const correctChoices = entry.encounter.choices.filter(choice => choice.isCorrect)
    if (
      correctChoices.length !== 1
      || correctChoices[0]?.id !== entry.action.authoredChoiceId
    ) {
      problems.push(`${entry.scenarioId}: action must reference its single authored correct choice`)
    }

    for (const parameter of entry.action.parameters) {
      if (!parameter.name.trim() || !parameter.expectedValue.trim()) {
        problems.push(`${entry.scenarioId}: action has an incomplete expected parameter`)
      }
    }
  }

  for (const id of BACKEND_SCENARIO_IDS) {
    if (!scenarioIds.has(id)) problems.push(`${id}: missing registry definition`)
  }
  for (const id of authoredEncounters.keys()) {
    if (!scenarioIds.has(id)) problems.push(`${id}: authored encounter is not in the scenario registry`)
  }

  return problems
}
