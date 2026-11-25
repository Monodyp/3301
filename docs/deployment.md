# 3301 deployment and event-data foundation

## Current state

The game is a React 19, TypeScript, and Vite single-page application. Its current gameplay engine persists a player's individual run in browser `localStorage`. Event participants join shared sessions through a Supabase Edge Function. The backend now assigns and persists five scenario IDs per participant and exposes a progress API; the existing character-based game engine has not yet been restructured to consume those assignments or synchronize its save automatically.

Session joining and lifecycle operations are implemented. The app does not submit scores or show a shared leaderboard. Do not treat a local result as a submitted seminar result.

## Selected architecture

- **Frontend:** Cloudflare Pages serves the static Vite build (`npm run build`, output directory `dist`). No application server is needed for the current client.
- **Database:** Supabase Postgres stores event sessions, participants, five-scenario runs and assignments, progress snapshots, and result records.
- **Trusted API:** The `session-api` Supabase Edge Function performs public session lookup, registration, start authorization, run retrieval, and progress saves, plus organizer-only creation, lifecycle changes, and reset. It uses the service-role key server-side; the browser never writes directly to event tables.
- **Local game:** `npm run dev` continues to run the existing single-player workflow without Supabase credentials or connectivity. With credentials configured, use `?mode=local` or **Use local practice** to choose local play.

This separates static phone gameplay from the privileged event-data path and avoids introducing a second application server. Neither provider has been configured or deployed by this change.

## Database schema

Apply all migrations in order with `supabase db push`:

- `event_sessions`: UUID, display name, `waiting` / `active` / `completed` status, creation/start/end timestamps, organizer-controlled JSON state, and a participant cap (default 60, configurable up to 200).
- `event_players`: UUID and session foreign key, display nickname, optional assigned character, join time, completion status, completion time, and per-session registration UUID. Nicknames are intentionally **not unique**; player identity is the database UUID.
- `event_results`: UUID, same-session player relationship, final score, correct-answer count, elapsed milliseconds, survival rating, category-performance JSON object, and submission timestamp. A unique `(session_id, player_id)` constraint permits at most one final result per player per event session. Database checks constrain the current score range (0–1080) and require the survival rating to match the correct-answer count.
- `event_scenario_catalog`: the 16 current Mika/Rafa encounter IDs (`MK-A1` through `MK-O2` and `RF-A1` through `RF-O2`). These IDs identify the assigned scenario; `assigned_character` is retained only as a legacy column and is not used by the new assignment system.
- `event_session_combinations`: tracks the unordered five-scenario combinations already allocated in each session (4,368 possible combinations with the current catalog), plus the number of uses and distinct orders.
- `event_participant_runs` and `event_run_scenarios`: one immutable run per participant/session, with exactly five unique scenario IDs in randomized order. Deferred database constraints verify the exact count, uniqueness, combination key, and order. The run's JSON progress is capped at 64 KiB.
- `event_run_results`: a JSON result envelope for future scoring integration. The existing eight-answer `event_results` scoring contract is retained unchanged; no new scoring or submission behavior is implemented.

The second migration adds capacity and registration identity plus atomic database functions for participant registration, start authorization, and session status changes. Registration locks the session row while checking status and capacity, so concurrent joins cannot exceed the limit. The third migration adds an allocator that locks the session row for the full selection-and-reservation transaction. Concurrent starts therefore cannot reserve the same unused combination. The allocator chooses an unused five-scenario set at random; only after the session's combinations are exhausted does it reuse a set, choosing a different unused ordering while one remains. Repeated starts return the participant's existing run. The same browser's registration UUID is idempotent within a session; clearing browser storage can create a new participant, so this prevents refresh/retry duplicates rather than proving a person's identity. Foreign keys cascade when an event or player is removed. Indexes support administration and result ordering.

## Access control and score integrity

Row-level security is enabled on all event tables. There are no participant policies, and direct table privileges are revoked from `anon` and `authenticated`; clients cannot query or mutate player rows or organizer state. The Edge Function returns only a session summary and the participant's own status. Its privileged key bypasses RLS and must never be embedded in the Vite app, committed, or exposed in browser logs.

The participant-facing Edge Function actions are `lookup`, `join`, `start`, `get-run`, and `save-progress`. `lookup` returns the participant's own run, assignment order, and progress when the matching participant identity is supplied. `join` validates the session and nickname, then invokes atomic registration. `start` requires an active session and creates the run and its assignment in the same database transaction. `get-run` and `save-progress` both require the matching session, participant ID, and registration ID; clients cannot supply or change their scenario assignment. The browser polls the participant's session status every four seconds; it cannot start through the UI until the organizer activates the session. A `completed` session cannot accept new registrations or start players.

Organizer actions `create`, `set-status`, and `reset` require `Authorization: Bearer <ORGANIZER_ACCESS_TOKEN>`. Only `waiting -> active -> completed` transitions are accepted. Reset additionally requires `confirmSessionId` to exactly match `sessionId`; it returns the session to `waiting`, preserves participant registrations/nicknames, and deletes that session's runs, progress, combination reservations, and results. Reset is destructive and cannot be undone. There is no organizer dashboard in this phase; the organizer can call the function manually or use a future authorized interface. The organizer token must be a long random secret stored only in Supabase Function secrets.

Score submission remains unimplemented. Registration UUIDs are only for idempotent join/start checks, not score credentials. A later score API must independently validate answer records and recompute scores; browser-supplied totals and timestamps are not authoritative.

## Environment variables

The repository includes `.env.example`:

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Frontend | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend | Public/publishable API key used to invoke the Edge Function; not a service-role key |
| `ORGANIZER_ACCESS_TOKEN` | Supabase Function secret | Required for organizer session creation and lifecycle changes |
| `CORS_ALLOWED_ORIGINS` | Supabase Function secret/local env | Comma-separated exact browser origins allowed to call the function |

Both frontend values are required for event joining and optional for local practice. Values prefixed `VITE_` are included in browser builds and must contain only public configuration. The Edge Function uses Supabase's server-side `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; do not create `VITE_SUPABASE_SERVICE_ROLE_KEY` or put privileged keys in any frontend `.env` file. `.env` and other environment files are ignored by git; examples are retained.

## Local development and database setup

### Play the existing single-player game

```sh
npm install
npm run dev
```

No Supabase project, credentials, or container runtime is required. `npm install` installs the Supabase client dependency, but no connection is made unless event mode is enabled with configuration.

### Apply the database migration

1. Create a Supabase project in the account that will own the seminar data.
2. Install/use the Supabase CLI, authenticate, and link this repository to that project. `supabase db push` applies both migrations:

   ```sh
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

3. Configure local Function variables by copying `supabase/functions/.env.example` to `supabase/functions/.env` and replacing the organizer token with a random local-only value. For the browser, create a root `.env.local` with the local Supabase URL and publishable key shown by the CLI.
4. Run `npx supabase start` and `npx supabase functions serve session-api` if you want to test the local backend. Local Function testing requires the Supabase CLI and Docker; it is not needed to run or test local practice.
5. Run `npx supabase test db` to execute the database tests in `supabase/tests/priority5a.test.sql`.
6. To exercise concurrent API starts, configure `TEST_SUPABASE_URL`, `TEST_SUPABASE_PUBLISHABLE_KEY`, and `TEST_ORGANIZER_ACCESS_TOKEN` for a disposable local Supabase stack. In PowerShell, enable the integration test and run it with:

   ```powershell
   $env:RUN_PRIORITY5A_INTEGRATION = '1'
   npm test
   ```

   The integration test creates and resets a session; it does not delete the test session row. Do not point it at a production project.
7. Verify the migration and functions against local Supabase before using the same workflow with a hosted project.

`supabase/config.toml` identifies the local CLI project. Starting the optional local Supabase stack requires the Supabase CLI and Docker; it is not needed to run or test the game UI.

## Production deployment

1. Configure a Cloudflare Pages project from the repository. Use Node.js 22.18 or newer, the repository root as the project root, `npm run build` as the build command, and `dist` as the output directory.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as Pages build environment variables. Production builds default to the event-joining screen; `?mode=local` explicitly opens local practice.
3. Link the Supabase CLI to the intended project and run `npx supabase db push`.
4. Set server-only secrets and deploy the function:

   ```sh
   npx supabase secrets set --project-ref <project-ref> ORGANIZER_ACCESS_TOKEN=<long-random-secret> CORS_ALLOWED_ORIGINS=https://<your-pages-domain>
   npx supabase functions deploy session-api
   ```

5. Create a session using the organizer-only `create` action and distribute the returned UUID, optionally as `https://<your-pages-domain>/?session=<uuid>`. After participants have joined, call `set-status` with `active`; later call it with `completed`. For example:

   ```sh
   curl --request POST "$SUPABASE_URL/functions/v1/session-api" \
     --header "apikey: $SUPABASE_PUBLISHABLE_KEY" \
     --header "Authorization: Bearer $ORGANIZER_ACCESS_TOKEN" \
     --header "Content-Type: application/json" \
     --data '{"action":"create","name":"3301 Seminar"}'
   ```

   To activate or complete the created session, send `{"action":"set-status","sessionId":"<returned-uuid>","status":"active"}` or replace `active` with `completed`. Keep the organizer token in the organizer's shell or secret manager, never in the browser or a shared URL.
6. Test session creation, joining, capacity, refresh, lifecycle transitions, and completion against the hosted project before the seminar. No production deployment or database connection has been performed as part of this work.

## Priority 5B organizer dashboard

Apply the Priority 5B migration with `supabase db push`; deploy the updated function afterward. The migration adds:

- `event_admin_sessions`: short-lived opaque organizer sessions. It stores only a SHA-256 token hash, never the organizer bearer secret.
- `event_run_scenario_progress`: persisted scenario delivery/resolution state and evidence summaries.
- `event_run_action_records`: evidence and protective-action audit records.
- `event_run_five_scenario_results`: separate five-scenario result records. They do not alter the legacy eight-answer `event_results` table.

Open the dashboard at `/admin`. Enter the `ORGANIZER_ACCESS_TOKEN` once. The Edge Function validates it, returns an opaque 12-hour session token, and stores only a token hash in Postgres. The frontend keeps the opaque token in `sessionStorage`, never the organizer bearer secret or Supabase service-role key.

The dashboard provides real overview/session/participant/analytics/result data where the player engine has already supplied progress. Participant assignment and generic progress data are functional; evidence, incident-action, and final-result display remains dependent on player-side integration that has not been implemented in this phase.

The `submit-result` contract validates that each result has exactly five unique assigned scenarios, rejects duplicate submissions and invalid participant/session identities, and recomputes the existing time/clue scoring formula. It currently cannot independently verify a submitted `correct` choice because the migration does not yet contain the 16 encounter choice-authority catalog. Browser correctness values must not be considered cryptographically authoritative until that choice catalog is added. This is a documented security limitation, not an independent scoring system.

## Vercel environment

No new frontend environment variable is required for the dashboard. It uses the existing public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

The existing hosted Supabase secrets remain:

- `ORGANIZER_ACCESS_TOKEN`
- `CORS_ALLOWED_ORIGINS`

The Vercel application must not receive `SUPABASE_SERVICE_ROLE_KEY` or `ORGANIZER_ACCESS_TOKEN`.

## Deployment commands

```sh
npx supabase db push
npx supabase secrets set --project-ref <project-ref> ORGANIZER_ACCESS_TOKEN=<long-random-secret> CORS_ALLOWED_ORIGINS=https://<your-vercel-domain>
npx supabase functions deploy session-api
npm run build
```

Do not run destructive reset operations against production while a seminar is active.

## Not included in this phase

The in-world five-scenario player restructuring, choice-authority catalog, live participant gameplay submission, and leaderboard calculation from verified browser-independent decisions remain future work. Local practice and the existing phone interface are unchanged.
