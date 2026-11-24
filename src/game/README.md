# Game engine (`src/game`)

All run state lives here. Screens read it through `useGame()` and change it only through `game.actions`. No screen keeps its own copy of progress.

## Files

| File | What it does |
| --- | --- |
| `types.ts` | The shared types: `Character`, `Encounter`, `Artifact`, `DecisionOption`, `Consequence`, `Feedback`, `GameState`, `GamePhase`. This is the contract between the engine and the screens. |
| `engine.ts` | The reducer and state machine. Actions that aren't allowed in the current phase are ignored. |
| `scoring.ts` | GDD section 9 scoring, survival rating, per-category results, horror stage. Tune the numbers in `SCORING`. |
| `random.ts` | Seeded RNG and Fisher–Yates shuffle, so a seed replays the same run. |
| `storage.ts` | Saves to `localStorage` after every change. A refresh restores the run; only "Play again" starts a new one. |
| `useGame.ts` | The React hook screens use. |
| `useGameEffects.ts` | Connects the engine to the phone: horror stage from progress, glitches on consequences and at the reveal, hint timers, encounter pacing. Called once in `App.tsx`. |
| `reveal.ts` | Builds the Project Blackout directory for the final screen, in the same layout for every encounter order. |
| `content/` | One file per character, plus `index.ts` that lists them and checks them with `validateContent()`. |

## Phases

```
MAIN_MENU -> CHARACTER_ASSIGNMENT -> PHONE_IDLE -> ENCOUNTER_INTRO -> INVESTIGATION <-> DECISION
          -> CONSEQUENCE -> ENCOUNTER_COMPLETE -> (PHONE_IDLE for the next one | FINAL_REVEAL after 8) -> RESULTS
RESULTS --Play again--> CHARACTER_ASSIGNMENT (new character, new order)
```

| Phase | Screen should show | Call next |
| --- | --- | --- |
| `MAIN_MENU` | Title screen | `actions.startRun()` |
| `CHARACTER_ASSIGNMENT` | Profile card from `game.character` | `actions.enterPhone()` |
| `PHONE_IDLE` | Normal phone, free exploration | `actions.triggerEncounter()` (from your opening/timer logic) |
| `ENCOUNTER_INTRO` | Notification from `game.encounter.trigger` | `actions.beginInvestigation()` when the player opens it |
| `INVESTIGATION` | `game.encounter.thread` and tappable `artifacts` | `actions.inspect(id)`, `actions.useHint()`, `actions.openDecision()` |
| `DECISION` | Decision sheet with `game.choices` (already shuffled) | `actions.choose(id)` or `actions.backToInvestigation()` |
| `CONSEQUENCE` | Outcome, `encounter.feedback`, `game.lastDecision.score` | `actions.continue()` |
| `ENCOUNTER_COMPLETE` | (short transition) | `actions.nextEncounter()` |
| `FINAL_REVEAL` | Project Blackout directory, using `state.blackoutClues` | `actions.showResults()` |
| `RESULTS` | Score, `game.rating`, `game.categoryResults` | `actions.playAgain()` |

Use `game.can('CHOOSE')` and similar to disable buttons that wouldn't do anything.

## Things screens read

- `game.horrorStage`: NORMAL, UNSETTLED, COMPROMISED or BLACKOUT, from progress plus mistakes.
- `state.consequences`: soft consequences to show (a pressure message, a glitch, an antagonist line, money gone, a security warning).
- `state.walletBalance` and `state.accountSecurity`: for Wallet and Settings.
- `game.hintsShown`: hints that have appeared, newest last. They appear by themselves after 10 s with no new evidence, then every 10 s, and stop once all key evidence is found. Show the newest one; if it has `highlightArtifactId`, make that evidence glow. `game.nextHintAt` says when the next one is due.
- `game.reveal`: during `FINAL_REVEAL` and `RESULTS`, everything the Project Blackout screen needs: `currentProfile`, `status` lines, the 8 `fragments` (unrecovered ones have `recovered: false` and placeholder text), `finalLines` and `closingLine`.

## Pacing and horror

`useGameEffects` handles these, so screens don't need timers for them:

- The first encounter arrives 15 s after the player enters the phone, then 5 s after each one ends (`PACING` in `useGameEffects.ts`). In dev mode this is off unless you tick **Auto pace** in the ENGINE panel.
- The horror stage (NORMAL, UNSETTLED, COMPROMISED, BLACKOUT) follows `game.horrorStage` while a run is active, so the old 30-second timer no longer sets it.
- Wrong answers with a `glitch`, `antagonist` or `account_compromise` consequence glitch the screen, and so does entering the final reveal. Restoring a save after a refresh doesn't replay them.

## Adding a character

1. Copy `content/mika.ts`, change the ids (`MK-` becomes e.g. `JN-`), and write all 8 encounters.
2. Add it to `CHARACTERS` in `content/index.ts`.
3. Run `npm test`. `validateContent()` fails if anything is missing, such as a second correct answer, a clue that needs an unknown artifact, or an archetype appearing twice.

## Testing

- `npm test` runs `tests/engine.test.ts` with Node's built-in test runner (Node 22.18 or newer).
- `npm run dev`, then open the game with `?dev=1`. The ENGINE panel on the right lets you set a seed, step through phases, inspect evidence, pick answers (the correct one is marked) and jump to any encounter.
