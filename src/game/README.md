# Game engine (`src/game`)

All run state lives here. Screens read it through `useGame()` and change it only through `game.actions`. No screen keeps its own copy of progress.

## Files

| File | What it does |
| --- | --- |
| `types.ts` | The shared types: `Character`, `Encounter`, `Artifact`, `DecisionOption`, `Consequence`, `Feedback`, `GameState`, `GamePhase`. This is the contract between the engine and the screens. |
| `engine.ts` | The reducer and state machine. Actions that aren't allowed in the current phase are ignored. It is the only authority for narrative progression. |
| `narrative.ts` | The narrative controller the reducer uses: encounter unlocking, scenario progress, phone-event matching and `checkDecision()`, the single rule for whether a decision may open. |
| `attacks.ts` | Scripted cyberattack progression: every incident is an attack, in encounter order, whatever the player decides. Own state (`GameState.attacks`), escalation tiers (Anomaly, Intrusion, Compromise, Escalation). |
| `scoring.ts` | GDD section 9 scoring, survival rating, per-category results, horror stage. Tune the numbers in `SCORING`. |
| `random.ts` | Seeded RNG and Fisher–Yates shuffle, so a seed replays the same run. |
| `storage.ts` | Saves to `localStorage` after every change. A refresh restores the run; only "Play again" starts a new one. |
| `useGame.ts` | The React hook screens use. |
| `useGameEffects.ts` | Idle-based hint timer and glitches on wrong answers. Called once in `App.tsx`. |
| `content/` | One file per character, plus `index.ts` that lists them and checks them with `validateContent()`. `scenarios.ts` maps every encounter onto scenario definitions and checks them with `validateNarrative()`. |

## Phases

```
Local practice:
MAIN_MENU -> CHARACTER_ASSIGNMENT -> PHONE_IDLE -> ENCOUNTER_INTRO -> INVESTIGATION <-> DECISION
          -> CONSEQUENCE -> ENCOUNTER_COMPLETE -> (PHONE_IDLE for the next one | RESULTS after 8)
Event:
JOIN_SESSION -> PHONE_IDLE -> ENCOUNTER_INTRO -> INVESTIGATION -> CONSEQUENCE
             -> ENCOUNTER_COMPLETE -> (PHONE_IDLE for the next one | RESULTS after 5)
```

Practice retains its character assignment and decision sheet. Event runs use the backend's ordered five-scenario assignment; Mika and Rafa remain story characters, not player identities. In event investigation, the assigned protective-action control appears only in its associated phone application and dispatches a typed action to the reducer. `CONSEQUENCE`, `ENCOUNTER_COMPLETE`, and `RESULTS` retain the shared result and progression screens.

## Narrative progression

Each encounter has two narrative scenarios (`content/scenarios.ts`), built from its existing content:

- `<id>-S1` Incident: starts when the trigger notification arrives. Done when the player opens the incident itself (the conversation, email, post or call screen).
- `<id>-S2` Investigation: practice decisions still require the authored narrative and evidence. Event protective actions are independent of clue collection and do not require completing the legacy decision quiz.

Screens never move the story themselves. They report what the player did with `actions.reportPhoneEvent({ kind, app, target })`, using `PHONE_TARGETS` for the target. The engine ignores any event that is not a required action of the active scenario, so opening an unrelated app or conversation changes nothing.

The practice decision opens only if `checkDecision()` passes: right character, active encounter, active scenario, all actions done, narrative presented, evidence found, not yet submitted. `OPEN_DECISION` and `CHOOSE` both check it in the reducer. Event resolution uses the central scenario registry and requires the assigned action's full sequence. A restored save is re-checked by `reconcileNarrative()`.

### Clue discovery

Clue details are not rendered as evidence cards. The app screen associated with each artifact reports `CLUE_VISIBLE` while that surface remains in view and `CLUE_HIDDEN` when it closes or leaves view. More than `CLUE_DWELL_MS` (3 s) of uninterrupted foreground viewing silently discovers a clue; leaving earlier resets its timer. Only clues belonging to the active encounter can be discovered. Discovered clues persist in the local run save, while unfinished dwell timers restart after refresh. In event runs, clue collection informs the existing score bonus but never gates the protective action.

### Cyberattacks

Every encounter's incident is a scripted cyberattack (`ATTACK_DEFINITIONS` in `attacks.ts`). Attack N is the run's Nth incident:

- **Trigger:** its incident is delivered, and every earlier attack is resolved.
- **Resolution:** its decision is submitted, correct or not.

So the next attack arrives after the previous decision's feedback, when the engine delivers the next incident. Decisions change the outcome (score, feedback, consequences), never whether the next attack comes. The reducer calls `advanceAttacks()` after every action; it reads narrative state only (`encounterLifecycle`, `submittedDecisionIds`), never decision results or consequences.

App.tsx shows each attack once, as the incident's own authored notification styled by tier, then records it with `ATTACK_NOTIFIED` (only the next unshown attack is accepted). Notifications wait while feedback or a decision is on screen; all attacks are listed under Settings → Security Center with their status.

Encounters run one at a time in the shuffled queue. The next one unlocks only when every earlier one is resolved and any `requiresEncounters` are resolved; the shuffle never overrides those dependencies.

## Things screens read

- `game.horrorStage`: NORMAL, UNSETTLED, COMPROMISED or BLACKOUT, from progress plus mistakes.
- `state.consequences`: soft consequences to show (a pressure message, a glitch, an antagonist line, money gone, a security warning).
- `state.walletBalance` and `state.accountSecurity`: for Wallet and Settings.
- `game.hintsShown`: hints that have appeared, newest last. They appear by themselves after 10 s with no new evidence, then every 10 s, and stop once all key evidence is found. Show the newest one; if it has `highlightArtifactId`, make that evidence glow. `game.nextHintAt` says when the next one is due.

## Hints and glitches

`useGameEffects` (called once in `App.tsx`) handles these:

- Hints appear by themselves after 10 s with no new evidence, then every 10 s, and stop once all key evidence is found. Action feedback is transient and fades after five seconds.
- Wrong answers with a `glitch`, `antagonist` or `account_compromise` consequence glitch the screen. Restoring a save after a refresh doesn't replay them.

Horror stage is handled directly in `App.tsx`. There is no idle timer for encounters: the next incident arrives when the engine unlocks it.

## Adding a character

1. Copy `content/mika.ts`, change the ids (`MK-` becomes e.g. `JN-`), and write all 8 encounters.
2. Add it to `CHARACTERS` in `content/index.ts`.
3. Add an entry per encounter to `NARRATIVE_SPECS` in `content/scenarios.ts`.
4. Run `npm test`. `validateContent()` fails if anything is missing, such as a second correct answer, a clue that needs an unknown artifact, or an archetype appearing twice.

## Testing

- `npm test` runs the tests in `tests/` with Node's built-in test runner (Node 22.18 or newer). `tests/narrative.test.ts` holds practice decision-isolation regression tests, `tests/clues.test.ts` passive discovery, `tests/engine.test.ts` action resolution and run progress, `tests/attacks.test.ts` attack notifications, and `tests/gameplay.test.ts` compares authored content with `tests/fixtures/gameplay-baseline.json`.
- `npm run dev`, then open the game with `?dev=1`. The ENGINE panel on the right lets you set a seed, step through phases, perform the active scenario's required actions, inspect evidence, pick answers (the correct one is marked) and jump to any encounter. It goes through the same reducer checks, so it cannot open a decision early.
