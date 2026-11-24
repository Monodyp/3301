-- Event infrastructure foundation for 3301.
-- Participant-facing reads and writes must go through a trusted server function.

create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'completed')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  organizer_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(organizer_state) = 'object'),
  check (
    (status = 'waiting' and started_at is null and ended_at is null)
    or (
      status = 'active'
      and started_at is not null
      and started_at >= created_at
      and ended_at is null
    )
    or (
      status = 'completed'
      and started_at is not null
      and started_at >= created_at
      and ended_at is not null
      and ended_at >= started_at
    )
  )
);

create table public.event_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 32),
  assigned_character text,
  joined_at timestamptz not null default now(),
  completion_status text not null default 'joined'
    check (completion_status in ('joined', 'in_progress', 'completed')),
  completed_at timestamptz,
  unique (session_id, id),
  check ((completion_status = 'completed') = (completed_at is not null)),
  check (completed_at is null or completed_at >= joined_at),
  check (
    assigned_character is null
    or char_length(btrim(assigned_character)) between 1 and 64
  )
);

create table public.event_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  player_id uuid not null,
  final_score integer not null check (final_score between 0 and 1080),
  correct_answers smallint not null check (correct_answers between 0 and 8),
  completion_time_ms integer not null check (completion_time_ms >= 0),
  survival_rating text not null check (
    survival_rating in (
      'FULLY SECURED',
      'MOSTLY SECURED',
      'PARTIALLY COMPROMISED',
      'CRITICAL',
      'BLACKED OUT'
    )
  ),
  category_performance jsonb not null
    check (jsonb_typeof(category_performance) = 'object'),
  submitted_at timestamptz not null default now(),
  unique (session_id, player_id),
  check (
    (correct_answers = 8 and survival_rating = 'FULLY SECURED')
    or (correct_answers between 6 and 7 and survival_rating = 'MOSTLY SECURED')
    or (correct_answers between 4 and 5 and survival_rating = 'PARTIALLY COMPROMISED')
    or (correct_answers between 2 and 3 and survival_rating = 'CRITICAL')
    or (correct_answers between 0 and 1 and survival_rating = 'BLACKED OUT')
  ),
  foreign key (session_id, player_id)
    references public.event_players(session_id, id)
    on delete cascade
);

create index event_sessions_status_created_at_idx
  on public.event_sessions(status, created_at desc);

create index event_players_session_joined_at_idx
  on public.event_players(session_id, joined_at);

create index event_results_session_leaderboard_idx
  on public.event_results(session_id, final_score desc, completion_time_ms asc);

alter table public.event_sessions enable row level security;
alter table public.event_players enable row level security;
alter table public.event_results enable row level security;

-- No policies are defined for anon or authenticated: RLS therefore denies
-- participant access. The privileged server function is the only app path.
revoke all on table
  public.event_sessions,
  public.event_players,
  public.event_results
from public, anon, authenticated;

grant all on table
  public.event_sessions,
  public.event_players,
  public.event_results
to service_role;
