# 3301

3301 is a browser-based cybersecurity survival game built with React, TypeScript, and Vite. Individual gameplay remains on each device; when configured, participants can join a shared seminar session and wait for the organizer to activate it.

## Local development

```sh
npm install
npm run dev
```

Supabase credentials are not required for local single-player development. Without them, `npm run dev` opens clearly labeled local practice. Event registrations use the Supabase session API when configured; results are not submitted in this phase.

Run the existing checks with:

```sh
npm test
npm run build
npm run lint
```

## Event deployment foundation

Deployment and event setup are documented in [docs/deployment.md](./docs/deployment.md). Database migrations are in [supabase/migrations/](./supabase/migrations); the session Edge Function is in [supabase/functions/session-api/](./supabase/functions/session-api).

Participant joining, five-scenario progress, result submission, and the organizer dashboard with session-specific leaderboards and session archiving are implemented. Character balancing and further game-engine synchronization remain future work.
