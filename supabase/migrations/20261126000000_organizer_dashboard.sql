-- Organizer dashboard sessions and five-scenario run monitoring.

create table public.event_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token_hash text not null unique check (char_length(session_token_hash) = 64),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= created_at)
);

create index event_admin_sessions_expiry_idx
  on public.event_admin_sessions(expires_at)
  where revoked_at is null;

create table public.event_run_scenario_progress (
  run_id uuid not null references public.event_participant_runs(id) on delete cascade,
  scenario_id text not null references public.event_scenario_catalog(scenario_id),
  ordinal smallint not null check (ordinal between 1 and 5),
  state text not null default 'assigned'
    check (state in ('assigned', 'delivered', 'investigating', 'resolved', 'completed')),
  delivered_at timestamptz,
  started_at timestamptz,
  resolved_at timestamptz,
  completed_at timestamptz,
  resolution_correct boolean,
  evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence) = 'array'),
  incorrect_actions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(incorrect_actions) = 'array'),
  score_impact integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (run_id, scenario_id),
  unique (run_id, ordinal)
);

create table public.event_run_action_records (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.event_participant_runs(id) on delete cascade,
  scenario_id text not null,
  action_id text not null check (char_length(btrim(action_id)) between 1 and 120),
  action_kind text not null
    check (action_kind in ('evidence', 'protective_action', 'incident_resolution', 'scenario_complete')),
  correct boolean,
  occurred_at timestamptz not null default now(),
  unique (run_id, action_id),
  foreign key (run_id, scenario_id)
    references public.event_run_scenario_progress(run_id, scenario_id)
    on delete cascade
);

create index event_run_action_records_run_time_idx
  on public.event_run_action_records(run_id, occurred_at);

create table public.event_run_five_scenario_results (
  run_id uuid primary key references public.event_participant_runs(id) on delete cascade,
  final_score integer not null check (final_score between 0 and 675),
  correct_resolutions smallint not null check (correct_resolutions between 0 and 5),
  incorrect_actions smallint not null check (incorrect_actions between 0 and 100),
  evidence_collected smallint not null check (evidence_collected between 0 and 100),
  completion_time_ms integer not null check (completion_time_ms >= 0),
  survival_rating text not null
    check (survival_rating in (
      'FULLY SECURED',
      'MOSTLY SECURED',
      'PARTIALLY COMPROMISED',
      'CRITICAL',
      'BLACKED OUT'
    )),
  submitted_at timestamptz not null default now()
);

create index event_run_five_scenario_results_score_idx
  on public.event_run_five_scenario_results(final_score desc, completion_time_ms asc);

alter table public.event_admin_sessions enable row level security;
alter table public.event_run_scenario_progress enable row level security;
alter table public.event_run_action_records enable row level security;
alter table public.event_run_five_scenario_results enable row level security;

revoke all on table
  public.event_admin_sessions,
  public.event_run_scenario_progress,
  public.event_run_action_records,
  public.event_run_five_scenario_results
from public, anon, authenticated;

grant all on table
  public.event_admin_sessions,
  public.event_run_scenario_progress,
  public.event_run_action_records,
  public.event_run_five_scenario_results
to service_role;

create or replace function public.initialize_event_run_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  v_run_id := case
    when tg_table_name = 'event_participant_runs' then new.id
    else new.run_id
  end;
  insert into public.event_run_scenario_progress (run_id, scenario_id, ordinal)
  select v_run_id, s.scenario_id, s.ordinal
  from public.event_run_scenarios as s
  where s.run_id = v_run_id
  on conflict (run_id, scenario_id) do nothing;
  return new;
end;
$$;

create trigger initialize_event_run_progress_after_insert
  after insert on public.event_participant_runs
  for each row execute function public.initialize_event_run_progress();

create trigger initialize_event_run_progress_after_scenario_insert
  after insert on public.event_run_scenarios
  for each row execute function public.initialize_event_run_progress();

revoke all on function public.initialize_event_run_progress()
  from public, anon, authenticated;
grant execute on function public.initialize_event_run_progress()
  to service_role;

create or replace function public.submit_event_run_five_scenario_result(
  p_session_id uuid,
  p_player_id uuid,
  p_registration_id uuid,
  p_decision_records jsonb,
  p_completion_time_ms integer
)
returns table (
  run_id uuid,
  final_score integer,
  correct_resolutions smallint,
  incorrect_actions smallint,
  evidence_collected smallint,
  completion_time_ms integer,
  survival_rating text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.event_participant_runs%rowtype;
  v_record_count integer;
  v_correct_resolutions integer := 0;
  v_incorrect_actions integer := 0;
  v_evidence_collected integer := 0;
  v_final_score integer := 0;
  v_survival text;
  v_record jsonb;
  v_scenario_id text;
  v_choice_is_correct boolean;
  v_seconds_taken numeric;
  v_inspected_evidence integer;
  v_total_evidence integer;
  v_hints_used integer;
  v_time_bonus integer;
  v_clue_bonus integer;
begin
  if p_decision_records is null
    or jsonb_typeof(p_decision_records) <> 'array'
    or jsonb_array_length(p_decision_records) <> 5
    or p_completion_time_ms is null
    or p_completion_time_ms < 0
  then
    raise exception using errcode = '22023', message = 'invalid_five_scenario_result';
  end if;

  select r.*
    into v_run
    from public.event_participant_runs as r
    join public.event_players as p
      on p.session_id = r.session_id
      and p.id = r.player_id
    where r.session_id = p_session_id
      and r.player_id = p_player_id
      and p.registration_id = p_registration_id
    for update of r;
  if not found then
    raise exception using errcode = 'P0002', message = 'player_not_found';
  end if;

  if exists (
    select 1 from public.event_run_five_scenario_results
    where run_id = v_run.id
  ) then
    raise exception using errcode = '55000', message = 'duplicate_five_scenario_result';
  end if;

  for v_record in select value from jsonb_array_elements(p_decision_records)
  loop
    v_scenario_id := v_record->>'scenarioId';
    v_choice_is_correct := (v_record->>'correct')::boolean;
    v_seconds_taken := greatest(0, least(86400, coalesce((v_record->>'secondsTaken')::numeric, 0)));
    v_inspected_evidence := greatest(0, least(100, coalesce((v_record->>'inspectedKeyEvidence')::integer, 0)));
    v_total_evidence := greatest(0, least(100, coalesce((v_record->>'totalKeyEvidence')::integer, 0)));
    v_hints_used := greatest(0, least(100, coalesce((v_record->>'hintsUsed')::integer, 0)));

    if v_scenario_id is null
      or v_choice_is_correct is null
      or not exists (
        select 1
        from public.event_run_scenarios as s
        where s.run_id = v_run.id
          and s.scenario_id = v_scenario_id
      )
      or v_total_evidence > 100
      or v_inspected_evidence > v_total_evidence
    then
      raise exception using errcode = '22023', message = 'invalid_decision_record';
    end if;

    if v_choice_is_correct then
      v_correct_resolutions := v_correct_resolutions + 1;
      if v_seconds_taken <= 15 then
        v_time_bonus := 25;
      elsif v_seconds_taken >= 45 then
        v_time_bonus := 0;
      else
        v_time_bonus := round(25 * (45 - v_seconds_taken) / 30);
      end if;
      v_clue_bonus := 0;
      if v_total_evidence > 0 then
        v_clue_bonus := greatest(
          0,
          round(10 * least(1, v_inspected_evidence::numeric / v_total_evidence)) - v_hints_used * 3
        );
      end if;
      v_final_score := v_final_score + 100 + v_time_bonus + v_clue_bonus;
    else
      v_incorrect_actions := v_incorrect_actions + 1;
    end if;
    v_evidence_collected := v_evidence_collected + v_inspected_evidence;
  end loop;

  select count(distinct record->>'scenarioId')
    into v_record_count
    from jsonb_array_elements(p_decision_records) as record;
  if v_record_count <> 5 then
    raise exception using errcode = '22023', message = 'duplicate_decision_scenario';
  end if;

  if v_correct_resolutions >= 5 then
    v_survival := 'FULLY SECURED';
  elsif v_correct_resolutions >= 4 then
    v_survival := 'MOSTLY SECURED';
  elsif v_correct_resolutions >= 3 then
    v_survival := 'PARTIALLY COMPROMISED';
  elsif v_correct_resolutions >= 2 then
    v_survival := 'CRITICAL';
  else
    v_survival := 'BLACKED OUT';
  end if;

  insert into public.event_run_five_scenario_results (
    run_id,
    final_score,
    correct_resolutions,
    incorrect_actions,
    evidence_collected,
    completion_time_ms,
    survival_rating
  ) values (
    v_run.id,
    v_final_score,
    v_correct_resolutions,
    v_incorrect_actions,
    least(v_evidence_collected, 100),
    p_completion_time_ms,
    v_survival
  );

  update public.event_participant_runs
    set status = 'completed',
        updated_at = clock_timestamp()
    where id = v_run.id;

  update public.event_players
    set completion_status = 'completed',
        completed_at = clock_timestamp()
    where session_id = p_session_id
      and id = p_player_id;

  return query select
    v_run.id,
    v_final_score,
    v_correct_resolutions::smallint,
    v_incorrect_actions::smallint,
    least(v_evidence_collected, 100)::smallint,
    p_completion_time_ms,
    v_survival;
end;
$$;

revoke all on function public.submit_event_run_five_scenario_result(uuid, uuid, uuid, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.submit_event_run_five_scenario_result(uuid, uuid, uuid, jsonb, integer)
  to service_role;
