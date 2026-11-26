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

export type PhoneInteractionControl =
  | 'reply'
  | 'menu-item'
  | 'bookmark'
  | 'attachment'
  | 'payment-send'
  | 'payment-decline'
  | 'link'
  | 'security-toggle'
  | 'contact-call'
  | 'contact-message'
  | 'search'
  | 'preserve'

export const PROTECTIVE_ACTION_CATALOG = {
  blockMessageAccount: { surface: 'messages', title: 'Block account', description: 'Stops this account from contacting you; blocking can be undone later.' },
  reportMessageAccount: { surface: 'messages', title: 'Report account', description: 'Flags the account for platform review; it does not block or delete the conversation, and this report cannot be retracted here.' },
  leaveConversation: { surface: 'messages', title: 'Leave conversation', description: 'Leaves the conversation; this may be difficult to undo.' },
  refuseMessageRequest: { surface: 'messages', title: 'Refuse request', description: 'Declines the request without sharing information or changing account access.' },
  refuseMessageAttachment: { surface: 'messages', title: 'Refuse attachment', description: 'Does not open or run the attachment; the conversation remains available.' },
  restrictMessageAccess: { surface: 'messages', title: 'Restrict lab access', description: 'Keeps private lab access limited until the requester is verified.' },
  verifyMessageIdentity: { surface: 'messages', title: 'Verify identity', description: 'Checks the request through a separate known channel; it does not approve the request.' },
  reportPhishingEmail: { surface: 'email', title: 'Report phishing', description: 'Flags the email for review; the message remains available, the sender is not blocked, and this report cannot be retracted here.' },
  deleteEmail: { surface: 'email', title: 'Delete email', description: 'Removes the email from the inbox; it may be recoverable from Trash and this does not report or block the sender.' },
  blockEmailSender: { surface: 'email', title: 'Block sender', description: 'Prevents further email from this sender; blocking can be reversed in mail settings.' },
  verifyEmailSender: { surface: 'email', title: 'Verify sender', description: 'Checks the sender and request independently before agreeing; no commitment is made.' },
  refuseEmailRequest: { surface: 'email', title: 'Refuse request', description: 'Declines the request without complying or sharing private information.' },
  declinePayment: { surface: 'wallet', title: 'Decline payment request', description: 'Declines this request without sending money; it does not report or block the recipient.' },
  cancelTransfer: { surface: 'wallet', title: 'Cancel pending transfer', description: 'Attempts to stop a pending transfer; only available while a transfer is pending.' },
  reportWalletRecipient: { surface: 'wallet', title: 'Report recipient or transaction', description: 'Flags the recipient or transaction for review; it does not send or cancel money, and this report cannot be retracted here.' },
  blockWalletRecipient: { surface: 'wallet', title: 'Block recipient', description: 'Prevents future requests from this recipient; this can be changed in wallet settings.' },
  reviewTransactions: { surface: 'wallet', title: 'Review transaction history', description: 'Shows transaction details for investigation and does not resolve the incident by itself.' },
  secureWallet: { surface: 'wallet', title: 'Secure wallet account', description: 'Reviews account protection; this does not make or authorize a payment.' },
  leaveSocialGroup: { surface: 'social', title: 'Leave group', description: 'Removes you from the group; saved evidence remains on the device.' },
  reportSocialGroup: { surface: 'social', title: 'Report group', description: 'Flags group activity for review; it does not leave or block the group, and this report cannot be retracted here.' },
  reportSocialAccount: { surface: 'social', title: 'Report account', description: 'Flags the account for review; it does not block the account or remove messages, and this report cannot be retracted here.' },
  blockSocialAccount: { surface: 'social', title: 'Block account', description: 'Stops this account from contacting you; blocking can be undone later.' },
  restrictSocialAccount: { surface: 'social', title: 'Restrict account', description: 'Limits account interactions without publicly confronting the account.' },
  verifyContactIdentity: { surface: 'contacts', title: 'Verify identity', description: 'Uses a saved contact route to check the request; it does not share a code.' },
  restrictContactAccess: { surface: 'contacts', title: 'Restrict access', description: 'Keeps private or lab access limited until authorization is confirmed.' },
  removeSuspiciousContact: { surface: 'contacts', title: 'Remove suspicious contact', description: 'Removes the saved contact from this device; this can be undone by adding it again.' },
  reportContactImpersonation: { surface: 'contacts', title: 'Report impersonation', description: 'Flags suspected impersonation with the appropriate service or organization; this report cannot be retracted here.' },
  blockContact: { surface: 'contacts', title: 'Block contact', description: 'Stops calls and messages from this contact; blocking can be reversed.' },
  closeSuspiciousPage: { surface: 'browser', title: 'Close suspicious page', description: 'Closes the page without submitting information; it does not report the site.' },
  navigateOfficialWebsite: { surface: 'browser', title: 'Navigate to official website', description: 'Opens the known official address directly rather than following the message link.' },
  verifyWebsite: { surface: 'browser', title: 'Verify website identity', description: 'Checks the site independently; this does not authenticate or submit credentials.' },
  reportPhishingPage: { surface: 'browser', title: 'Report phishing page', description: 'Flags the page for review; it does not delete the email or block the sender, and this report cannot be retracted here.' },
  refuseBrowserRequest: { surface: 'browser', title: 'Refuse suspicious request', description: 'Declines the page request without entering credentials or granting access.' },
  denyPermissions: { surface: 'settings', title: 'Deny permissions', description: 'Keeps the application from accessing the requested device data.' },
  disableSuspiciousAccess: { surface: 'settings', title: 'Disable suspicious access', description: 'Revokes unauthorized access; the change can be reviewed in security settings.' },
  rejectInstallation: { surface: 'settings', title: 'Reject installation', description: 'Prevents an unverified application from being installed or run.' },
  removeUnauthorizedApplication: { surface: 'settings', title: 'Remove unauthorized application', description: 'Removes an application that was not approved; it does not disable device protection.' },
  reviewAccountSecurity: { surface: 'settings', title: 'Review account security', description: 'Checks account status and security notices without changing credentials.' },
  changeCompromisedCredentials: { surface: 'settings', title: 'Change compromised credentials', description: 'Updates credentials through the trusted account settings flow.' },
  leaveAndReportSocialGroup: { surface: 'social', title: 'Leave and report group', description: 'Leaves the hostile group and reports its credible threat to the appropriate reviewer.' },
} as const satisfies Record<string, { surface: PhoneSurface; title: string; description: string }>

export type ProtectiveActionId = keyof typeof PROTECTIVE_ACTION_CATALOG

export interface ScenarioPhoneInteraction {
  readonly id: string
  readonly surface: PhoneSurface
  readonly control: PhoneInteractionControl
  readonly label: string
  readonly classification: 'correct' | 'incorrect'
  readonly actionType?: ProtectiveActionId
  readonly stepId?: string
  readonly wrongChoiceId?: string
  readonly expectedQuery?: string
  readonly expectedContact?: string
  readonly severity?: 1 | 2 | 3 | 4
  readonly stabilizes?: boolean
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
  readonly primaryInteractionId: string
  readonly parameters: readonly ActionParameter[]
  readonly steps: readonly ResolutionActionStep[]
  readonly interactions: readonly ScenarioPhoneInteraction[]
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

type NativeControlSpec = readonly [PhoneSurface, PhoneInteractionControl, string, string?, string?, boolean?, ProtectiveActionId?]
type IncorrectInteractionSpec = readonly [
  PhoneSurface,
  PhoneInteractionControl,
  string,
  0 | 2,
  1 | 2 | 3 | 4,
]

function phoneInteractions(
  stepCount: number,
  correct: readonly NativeControlSpec[],
  incorrect: readonly IncorrectInteractionSpec[],
  scenarioId: ScenarioId,
): ScenarioPhoneInteraction[] {
  if (stepCount !== correct.length) throw new Error(`${scenarioId}: each action step needs one native interaction`)
  return [
    ...correct.map(([surface, control, label, expectedQuery, expectedContact, stabilizes, actionType], index) => ({
      id: `${scenarioId.toLowerCase()}.correct-${index + 1}`,
      surface,
      control,
      label,
      classification: 'correct' as const,
      stepId: `step-${index + 1}`,
      ...(expectedQuery ? { expectedQuery } : {}),
      ...(expectedContact ? { expectedContact } : {}),
      ...(stabilizes ? { stabilizes } : {}),
      ...(actionType ? { actionType } : {}),
    })),
    ...incorrect.map(([surface, control, label, choiceIndex, severity], index) => {
      const choice = getEncounter(scenarioId)?.choices[choiceIndex]
      if (!choice || choice.isCorrect) throw new Error(`${scenarioId}: incorrect interaction must reference an authored incorrect choice`)
      return {
        id: `${scenarioId.toLowerCase()}.incorrect-${index + 1}`,
        surface,
        control,
        label,
        classification: 'incorrect' as const,
        wrongChoiceId: choice.id,
        severity,
      }
    }),
  ]
}

type SupportingActionSpec = readonly [PhoneSurface, PhoneInteractionControl, ProtectiveActionId]

function supportingInteractions(
  scenarioId: ScenarioId,
  definitions: readonly SupportingActionSpec[],
): ScenarioPhoneInteraction[] {
  return definitions.map(([surface, control, actionType]) => {
    const action = PROTECTIVE_ACTION_CATALOG[actionType]
    return {
      id: `${scenarioId.toLowerCase()}.support.${actionType}`,
      surface,
      control,
      label: action.title,
      actionType,
      classification: 'correct',
    }
  })
}

export const SCENARIO_REGISTRY = [
  bindAuthoredEncounter({
    scenarioId: 'MK-A1',
    npcIdentity: 'mika',
    action: {
      id: 'mk-a1.set-boundaries',
      authoredChoiceId: 'MK-A1-c2',
      primaryAction: 'Block the unverified account and keep private information protected.',
      surface: 'messages',
      primaryInteractionId: 'mk-a1.correct-1',
      parameters: [],
      steps: actionSteps(
        ['messages', 'Block the unverified account', 'The unverified account can no longer contact Mika.'],
        ['messages', 'Decline to share private details', 'No private information was shared.'],
        ['browser', 'Check the offer through an independent source', 'The offer was checked without using the sender’s link.'],
      ),
      interactions: [
        ...phoneInteractions(
        3,
        [
          ['messages', 'menu-item', 'Block account', undefined, undefined, undefined, 'blockMessageAccount'],
          ['messages', 'reply', 'Send: “I don’t share private details.”', undefined, undefined, true],
          ['browser', 'search', 'Search for the creator program', 'creator program'],
        ],
        [
          ['messages', 'menu-item', 'Move chat to another app', 0, 1],
          ['messages', 'reply', 'Send creator account credentials', 2, 4],
        ],
        'MK-A1',
        ),
        ...supportingInteractions('MK-A1', [['messages', 'menu-item', 'reportMessageAccount']]),
      ],
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
      primaryInteractionId: 'mk-a2.correct-2',
      parameters: [],
      steps: actionSteps(
        ['social', 'Save the threatening post', 'The post is preserved.'],
        ['social', 'Leave the group', 'You are no longer in the hostile group.'],
        ['social', 'Report the threat to the moderators', 'The threat has been reported through the platform.'],
      ),
      interactions: [
        ...phoneInteractions(
        3,
        [
          ['social', 'bookmark', 'Save post'],
          ['social', 'menu-item', 'Leave group', undefined, undefined, true, 'leaveSocialGroup'],
          ['social', 'menu-item', 'Report to moderators', undefined, undefined, undefined, 'reportSocialGroup'],
        ],
        [
          ['social', 'menu-item', 'Stay in group', 0, 1],
          ['social', 'reply', 'Post an endorsement', 2, 3],
        ],
        'MK-A2',
        ),
        ...supportingInteractions('MK-A2', [['social', 'menu-item', 'blockSocialAccount']]),
      ],
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
      primaryAction: 'Report the suspicious sponsorship email and review its claims independently.',
      surface: 'email',
      primaryInteractionId: 'mk-a3.correct-1',
      parameters: [],
      steps: actionSteps(
        ['email', 'Report the suspicious sponsorship email', 'The email was flagged for review; the sender was not blocked.'],
        ['browser', 'Verify the sponsor independently', 'The sponsor was checked outside the email.'],
        ['email', 'Decline the deadline pressure', 'The deadline no longer dictates the decision.'],
      ),
      interactions: [
        ...phoneInteractions(
        3,
        [
          ['email', 'menu-item', 'Report phishing email', undefined, undefined, undefined, 'reportPhishingEmail'],
          ['browser', 'search', 'Search agency name', 'agency', undefined, undefined, 'verifyWebsite'],
          ['email', 'reply', 'Send: “I’ll review the terms first.”', undefined, undefined, true],
        ],
        [
          ['email', 'menu-item', 'Accept partnership', 0, 1],
          ['email', 'reply', 'Send identity details', 2, 3],
        ],
        'MK-A3',
        ),
        ...supportingInteractions('MK-A3', [
          ['email', 'menu-item', 'deleteEmail'],
          ['email', 'menu-item', 'blockEmailSender'],
        ]),
      ],
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
      primaryAction: 'Report the suspicious email and review account status through an official channel.',
      surface: 'email',
      primaryInteractionId: 'mk-r1.correct-1',
      parameters: [],
      steps: actionSteps(
        ['email', 'Report the suspicious account warning', 'The email was flagged; the sender was not blocked or deleted.'],
        ['settings', 'Review account status in Security Center', 'Account status was checked through the phone settings.'],
      ),
      interactions: [
        ...phoneInteractions(
        2,
        [
          ['email', 'menu-item', 'Report phishing email', undefined, undefined, undefined, 'reportPhishingEmail'],
          ['settings', 'menu-item', 'View account status', undefined, undefined, true],
        ],
        [
          ['email', 'link', 'Open verification portal', 0, 4],
          ['email', 'reply', 'Reply with account details', 2, 1],
        ],
        'MK-R1',
        ),
        ...supportingInteractions('MK-R1', [['email', 'menu-item', 'deleteEmail']]),
      ],
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
      primaryInteractionId: 'mk-r2.correct-1',
      parameters: [],
      steps: actionSteps(
        ['wallet', 'Decline the deposit request', 'No deposit was sent.'],
        ['browser', 'Verify the company independently', 'The company was checked outside the payment request.'],
        ['messages', 'Keep the original request', 'The request remains available as a record.'],
      ),
      interactions: [
        ...phoneInteractions(
        3,
        [
          ['wallet', 'payment-decline', 'Decline request', undefined, undefined, true, 'declinePayment'],
          ['browser', 'search', 'Search company name', 'brand'],
          ['messages', 'preserve', 'Save conversation'],
        ],
        [
          ['wallet', 'payment-send', 'Send ₱1,500 deposit', 0, 3],
          ['wallet', 'payment-send', 'Send ₱500 deposit', 2, 2],
        ],
        'MK-R2',
        ),
        ...supportingInteractions('MK-R2', [
          ['wallet', 'menu-item', 'reportWalletRecipient'],
          ['wallet', 'menu-item', 'reviewTransactions'],
        ]),
      ],
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
      primaryAction: 'Report the suspected moderator account and keep the verification code private.',
      surface: 'social',
      primaryInteractionId: 'mk-r3.correct-1',
      parameters: [],
      steps: actionSteps(
        ['social', 'Report the compromised moderator account', 'The account was flagged for review; the verification code stayed private.'],
        ['contacts', 'Confirm the request with the moderator', 'The request was checked separately.'],
      ),
      interactions: [
        ...phoneInteractions(
        2,
        [
          ['social', 'menu-item', 'Report account', undefined, undefined, undefined, 'reportSocialAccount'],
          ['contacts', 'contact-call', 'Confirm the moderator request with Rafa', undefined, 'Rafa', true],
        ],
        [
          ['contacts', 'contact-message', 'Send the verification code', 0, 4],
          ['contacts', 'contact-message', 'Request more personal details', 2, 1],
        ],
        'MK-R3',
        ),
        ...supportingInteractions('MK-R3', [
          ['social', 'menu-item', 'blockSocialAccount'],
          ['social', 'menu-item', 'restrictSocialAccount'],
        ]),
      ],
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
      primaryInteractionId: 'mk-o1.correct-1',
      parameters: [],
      steps: actionSteps(
        ['email', 'Verify the sender and review the full contract', 'The sender and contract were checked before any account access was granted.'],
        ['browser', 'Verify the agency independently', 'The agency was checked outside its message.'],
        ['email', 'Keep the agreement unsigned for independent review', 'The agreement stays unsigned while it is reviewed.'],
      ),
      interactions: [
        ...phoneInteractions(
        3,
        [
          ['email', 'menu-item', 'Verify sender and review contract', undefined, undefined, true, 'verifyEmailSender'],
          ['browser', 'search', 'Search agency name', 'agency', undefined, undefined, 'verifyWebsite'],
          ['email', 'preserve', 'Archive offer'],
        ],
        [
          ['email', 'menu-item', 'Sign agreement', 0, 3],
          ['email', 'reply', 'Send account login', 2, 4],
        ],
        'MK-O1',
        ),
        ...supportingInteractions('MK-O1', [['email', 'menu-item', 'blockEmailSender']]),
      ],
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
      primaryAction: 'Refuse to run the unverified attachment and keep device protection enabled.',
      surface: 'messages',
      primaryInteractionId: 'mk-o2.correct-1',
      parameters: [],
      steps: actionSteps(
        ['messages', 'Do not open or run the file', 'The unverified file was not run.'],
        ['browser', 'Verify the recruiter independently', 'The recruiter was checked outside the message.'],
        ['email', 'Request a safe way to review the work', 'A safer review process was requested.'],
      ),
      interactions: [
        ...phoneInteractions(
        3,
        [
          ['messages', 'attachment', 'Refuse and remove unverified installer', undefined, undefined, true, 'refuseMessageAttachment'],
          ['browser', 'search', 'Search recruiter and software', 'recruiter'],
          ['email', 'reply', 'Send: “Please provide a safe review method.”'],
        ],
        [
          ['messages', 'attachment', 'Run installer', 0, 4],
          ['settings', 'security-toggle', 'Turn off device protection', 2, 4],
        ],
        'MK-O2',
        ),
        ...supportingInteractions('MK-O2', [
          ['messages', 'menu-item', 'reportMessageAccount'],
          ['email', 'menu-item', 'reportPhishingEmail'],
        ]),
      ],
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
      primaryInteractionId: 'rf-a1.correct-1',
      parameters: [],
      steps: actionSteps(
        ['messages', 'Decline unsupervised lab access', 'Restricted access remains protected.'],
        ['contacts', 'Verify Lance through a saved lab contact', 'Lance was checked through a trusted lab contact.'],
        ['messages', 'Share only public schedule details', 'Restricted schedules were not shared.'],
      ),
      interactions: [
        ...phoneInteractions(
        3,
        [
          ['messages', 'reply', 'Send: “I can’t share lab tools.”', undefined, undefined, true, 'restrictMessageAccess'],
          ['contacts', 'contact-call', 'Call saved lab contact', undefined, 'Ben Cruz', undefined, 'verifyContactIdentity'],
          ['messages', 'reply', 'Send public schedule only'],
        ],
        [
          ['messages', 'menu-item', 'Add Lance to support chat', 0, 1],
          ['social', 'reply', 'Post a public accusation', 2, 2],
        ],
        'RF-A1',
        ),
        ...supportingInteractions('RF-A1', [['messages', 'menu-item', 'refuseMessageRequest']]),
      ],
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
      primaryInteractionId: 'rf-a2.correct-3',
      parameters: [],
      steps: actionSteps(
        ['social', 'Preserve the threatening post', 'The post is preserved.'],
        ['social', 'Leave the group', 'You are no longer in the hostile group.'],
        ['social', 'Report the threat to the lab coordinator', 'The threat has been reported through the appropriate channel.'],
      ),
      interactions: [
        ...phoneInteractions(
        3,
        [
          ['social', 'bookmark', 'Save post'],
          ['social', 'menu-item', 'Leave group', undefined, undefined, true, 'leaveSocialGroup'],
          ['social', 'menu-item', 'Leave and report the group to the lab coordinator', undefined, undefined, undefined, 'leaveAndReportSocialGroup'],
        ],
        [
          ['social', 'menu-item', 'Join group experiment', 0, 4],
          ['social', 'reply', 'Challenge members publicly', 2, 2],
        ],
        'RF-A2',
        ),
      ],
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
      surface: 'browser',
      primaryInteractionId: 'rf-a3.correct-1',
      parameters: [],
      steps: actionSteps(
        ['browser', 'Verify the recruiter independently', 'The recruiter was checked outside the email.'],
        ['email', 'Request written terms and authorized scope', 'The terms and work scope were requested in writing.'],
        ['email', 'Archive the offer until terms are verified', 'Identity documents remain private until the terms are verified.'],
      ),
      interactions: [
        ...phoneInteractions(
        3,
        [
          ['browser', 'search', 'Search recruiter and employer', 'skyriver', undefined, undefined, 'verifyWebsite'],
          ['email', 'reply', 'Send: “Please send the contract and work scope.”'],
          ['email', 'preserve', 'Archive offer', undefined, undefined, true],
        ],
        [
          ['email', 'reply', 'Send ID and permit', 0, 3],
          ['email', 'link', 'Open private login page', 2, 4],
        ],
        'RF-A3',
        ),
        ...supportingInteractions('RF-A3', [['email', 'menu-item', 'verifyEmailSender']]),
      ],
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
      primaryInteractionId: 'rf-r1.correct-1',
      parameters: [],
      steps: actionSteps(
        ['browser', 'Type the official lab address and check the dashboard', 'The notice was checked through the official dashboard.'],
        ['email', 'Report the suspicious email', 'The suspicious email has been reported.'],
      ),
      interactions: [
        ...phoneInteractions(
        2,
        [
          ['browser', 'search', 'Enter official lab address', 'lab.sanestrella.local', undefined, true, 'navigateOfficialWebsite'],
          ['email', 'menu-item', 'Report message', undefined, undefined, undefined, 'reportPhishingEmail'],
        ],
        [
          ['email', 'link', 'Open recovery portal from message', 0, 4],
          ['email', 'reply', 'Reply with administrator password', 2, 4],
        ],
        'RF-R1',
        ),
      ],
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
      primaryInteractionId: 'rf-r2.correct-1',
      parameters: [],
      steps: actionSteps(
        ['wallet', 'Decline the personal payment request', 'No personal payment was sent.'],
        ['wallet', 'Choose the campus office’s verified payment channel', 'Payment is limited to the verified campus process.'],
      ),
      interactions: [
        ...phoneInteractions(
        2,
        [
          ['wallet', 'payment-decline', 'Decline request', undefined, undefined, true, 'declinePayment'],
          ['wallet', 'payment-decline', 'Choose campus office payment option'],
        ],
        [
          ['wallet', 'payment-send', 'Send ₱500 technician deposit', 0, 3],
          ['wallet', 'payment-send', 'Send smaller deposit', 2, 2],
        ],
        'RF-R2',
        ),
        ...supportingInteractions('RF-R2', [
          ['wallet', 'menu-item', 'reportWalletRecipient'],
          ['wallet', 'menu-item', 'reviewTransactions'],
        ]),
      ],
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
      primaryInteractionId: 'rf-r3.correct-1',
      parameters: [],
      steps: actionSteps(
        ['contacts', 'Call Ben using his saved number without sharing the reset code', 'Ben was reached through a known number; the reset code stayed private.'],
        ['email', 'Alert the lab coordinator', 'The coordinator has been alerted to the request.'],
      ),
      interactions: [
        ...phoneInteractions(
        2,
        [
          ['contacts', 'contact-call', 'Call Ben from saved contact', undefined, 'Ben Cruz', true, 'verifyContactIdentity'],
          ['email', 'reply', 'Send alert to lab coordinator'],
        ],
        [
          ['contacts', 'contact-message', 'Send reset code to Ben', 0, 4],
          ['contacts', 'contact-message', 'Ask Ben for his password', 2, 3],
        ],
        'RF-R3',
        ),
        ...supportingInteractions('RF-R3', [['contacts', 'menu-item', 'reportContactImpersonation']]),
      ],
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
      primaryAction: 'Refuse account sharing and request a standard interview process.',
      surface: 'email',
      primaryInteractionId: 'rf-o1.correct-1',
      parameters: [],
      steps: actionSteps(
        ['email', 'Decline account and document sharing', 'Accounts and lab documents remain private.'],
        ['browser', 'Verify the employer independently', 'The employer was checked outside the offer.'],
        ['email', 'Ask for an ordinary interview process', 'A standard interview was requested.'],
      ),
      interactions: [
        ...phoneInteractions(
        3,
        [
          ['email', 'reply', 'Send: “I won’t share account access.”', undefined, undefined, true, 'refuseEmailRequest'],
          ['browser', 'search', 'Search employer name', 'northstar', undefined, undefined, 'verifyWebsite'],
          ['email', 'reply', 'Send: “Please arrange a standard interview.”'],
        ],
        [
          ['messages', 'reply', 'Send account login', 0, 4],
          ['email', 'attachment', 'Upload lab report', 2, 3],
        ],
        'RF-O1',
        ),
        ...supportingInteractions('RF-O1', [['email', 'menu-item', 'blockEmailSender']]),
      ],
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
      primaryInteractionId: 'rf-o2.correct-1',
      parameters: [],
      steps: actionSteps(
        ['settings', 'Reject the unverified installer and keep protection enabled', 'The unverified installer was rejected while device protection stayed enabled.'],
        ['email', 'Do not run the unverified installer', 'The unverified installer was not run.'],
        ['email', 'Request a safer test environment', 'A safer test environment was requested.'],
      ),
      interactions: [
        ...phoneInteractions(
        3,
        [
          ['settings', 'security-toggle', 'Reject installation', undefined, undefined, true, 'rejectInstallation'],
          ['email', 'attachment', 'Remove installer without opening'],
          ['email', 'reply', 'Send: “Please provide a safe test environment.”'],
        ],
        [
          ['settings', 'security-toggle', 'Disable antivirus', 0, 4],
          ['email', 'attachment', 'Install on personal phone', 2, 3],
        ],
        'RF-O2',
        ),
        ...supportingInteractions('RF-O2', [['email', 'menu-item', 'reportPhishingEmail']]),
      ],
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
  const interactionIds = new Set<string>()
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
    const primaryInteraction = entry.action.interactions.find(item => item.id === entry.action.primaryInteractionId)
    if (!primaryInteraction || primaryInteraction.classification !== 'correct') {
      problems.push(`${entry.scenarioId}: primary action must reference a correct native interaction`)
    } else {
      if (primaryInteraction.surface !== entry.action.surface) {
        problems.push(`${entry.scenarioId}: primary action surface does not match its native interaction`)
      }
      if (!primaryInteraction.actionType) {
        problems.push(`${entry.scenarioId}: primary interaction must map to the shared protective-action catalog`)
      }
    }
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
    for (const step of entry.action.steps) {
      const correctForStep = entry.action.interactions.filter(
        interaction => interaction.classification === 'correct' && interaction.stepId === step.id,
      )
      if (correctForStep.length !== 1) {
        problems.push(`${entry.scenarioId}: action step ${step.id} must have exactly one native correct interaction`)
      }
    }
    for (const interaction of entry.action.interactions) {
      if (!interaction.id.trim() || interactionIds.has(interaction.id)) {
        problems.push(`${entry.scenarioId}: has an empty or duplicate phone interaction ID`)
      }
      interactionIds.add(interaction.id)
      if (!interaction.label.trim()) problems.push(`${entry.scenarioId}: has an empty phone interaction label`)
      if (interaction.actionType) {
        const catalogAction = PROTECTIVE_ACTION_CATALOG[interaction.actionType]
        if (!catalogAction || catalogAction.surface !== interaction.surface) {
          problems.push(`${entry.scenarioId}: protective action ${interaction.actionType} is not valid on ${interaction.surface}`)
        }
      }
      if (!supportedSurfaces.has(interaction.surface)) {
        problems.push(`${entry.scenarioId}: phone interaction uses unsupported surface ${interaction.surface}`)
      }
      if (interaction.control === 'search' && interaction.classification === 'correct' && !interaction.expectedQuery?.trim()) {
        problems.push(`${entry.scenarioId}: a correct browser search interaction must require a scenario-specific query`)
      }
      if (interaction.expectedQuery !== undefined && interaction.control !== 'search') {
        problems.push(`${entry.scenarioId}: expected browser query is set on a non-search interaction`)
      }
      if (interaction.expectedContact !== undefined && (
        interaction.control !== 'contact-call'
        || interaction.surface !== 'contacts'
        || !interaction.expectedContact.trim()
      )) {
        problems.push(`${entry.scenarioId}: expected contact is set on an invalid interaction`)
      }
      if (authoredEncounter && !npc?.apps.includes(interaction.surface)) {
        problems.push(`${entry.scenarioId}: NPC phone does not include interaction surface ${interaction.surface}`)
      }
      if (interaction.classification === 'correct') {
        if (interaction.stepId && !stepIds.has(interaction.stepId)) {
          problems.push(`${entry.scenarioId}: correct phone interaction references a missing action step`)
        }
        if (!interaction.stepId && interaction.id === entry.action.primaryInteractionId) {
          problems.push(`${entry.scenarioId}: the primary interaction must be linked to an action step`)
        }
        if (!interaction.stepId && !interaction.actionType) {
          problems.push(`${entry.scenarioId}: an optional supporting interaction must have a protective-action type`)
        }
        if (interaction.wrongChoiceId || interaction.severity !== undefined) {
          problems.push(`${entry.scenarioId}: correct phone interaction has incorrect-action metadata`)
        }
      } else {
        const wrongChoice = entry.encounter.choices.find(choice => choice.id === interaction.wrongChoiceId)
        if (interaction.stepId || !interaction.wrongChoiceId || !wrongChoice || wrongChoice.isCorrect) {
          problems.push(`${entry.scenarioId}: incorrect phone interaction must reference an authored incorrect choice`)
        }
        if (!Number.isInteger(interaction.severity) || interaction.severity! < 1 || interaction.severity! > 4) {
          problems.push(`${entry.scenarioId}: incorrect phone interaction severity must be between 1 and 4`)
        }
      }
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
