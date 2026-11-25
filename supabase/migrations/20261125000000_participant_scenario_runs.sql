-- Persistent five-scenario runs for the existing event-session foundation.

create table public.event_scenario_catalog (
  scenario_id text primary key
    check (scenario_id ~ '^(MK|RF)-(A1|A2|A3|R1|R2|R3|O1|O2)$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.event_scenario_catalog (scenario_id) values
  ('MK-A1'), ('MK-A2'), ('MK-A3'), ('MK-R1'),
  ('MK-R2'), ('MK-R3'), ('MK-O1'), ('MK-O2'),
  ('RF-A1'), ('RF-A2'), ('RF-A3'), ('RF-R1'),
  ('RF-R2'), ('RF-R3'), ('RF-O1'), ('RF-O2');

create table public.event_session_combinations (
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  combination_key text not null,
  use_count integer not null default 1 check (use_count > 0),
  orders_used smallint not null default 1 check (orders_used between 1 and 120),
  first_assigned_at timestamptz not null default now(),
  primary key (session_id, combination_key)
);

create table public.event_participant_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  player_id uuid not null,
  combination_key text not null,
  order_key text not null,
  status text not null default 'assigned'
    check (status in ('assigned', 'in_progress', 'completed')),
  progress jsonb not null default '{}'::jsonb
    check (jsonb_typeof(progress) = 'object' and octet_length(progress::text) <= 65536),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (session_id, player_id),
  unique (session_id, id),
  foreign key (session_id, player_id)
    references public.event_players(session_id, id)
    on delete cascade,
  foreign key (session_id, combination_key)
    references public.event_session_combinations(session_id, combination_key)
    on delete cascade,
  check ((status = 'assigned') = (started_at is null)),
  check (started_at is null or started_at >= created_at)
);

create table public.event_run_scenarios (
  run_id uuid not null references public.event_participant_runs(id) on delete cascade,
  scenario_id text not null references public.event_scenario_catalog(scenario_id),
  ordinal smallint not null check (ordinal between 1 and 5),
  primary key (run_id, scenario_id),
  unique (run_id, ordinal)
);

create table public.event_run_results (
  run_id uuid primary key references public.event_participant_runs(id) on delete cascade,
  result_data jsonb not null check (jsonb_typeof(result_data) = 'object'),
  submitted_at timestamptz not null default now()
);

create index event_participant_runs_session_idx
  on public.event_participant_runs(session_id, created_at);

create index event_run_scenarios_scenario_idx
  on public.event_run_scenarios(scenario_id);

alter table public.event_scenario_catalog enable row level security;
alter table public.event_session_combinations enable row level security;
alter table public.event_participant_runs enable row level security;
alter table public.event_run_scenarios enable row level security;
alter table public.event_run_results enable row level security;

revoke all on table
  public.event_scenario_catalog,
  public.event_session_combinations,
  public.event_participant_runs,
  public.event_run_scenarios,
  public.event_run_results
from public, anon, authenticated;

grant all on table
  public.event_scenario_catalog,
  public.event_session_combinations,
  public.event_participant_runs,
  public.event_run_scenarios,
  public.event_run_results
to service_role;

comment on column public.event_players.assigned_character is
  'Legacy character assignment; new event runs use persisted scenario IDs.';

create or replace function public.assert_five_scenarios_per_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_combination_key text;
  v_order_key text;
  v_count bigint;
  v_canonical_key text;
  v_actual_order text;
begin
  if tg_op = 'DELETE' then
    v_run_id := old.run_id;
  elsif tg_table_name = 'event_participant_runs' then
    v_run_id := new.id;
  else
    v_run_id := new.run_id;
  end if;

  select r.combination_key, r.order_key
    into v_combination_key, v_order_key
    from public.event_participant_runs as r
    where r.id = v_run_id;
  if not found then
    return null;
  end if;

  select
    count(*),
    string_agg(s.scenario_id, ',' order by s.scenario_id),
    string_agg(s.scenario_id, ',' order by s.ordinal)
    into v_count, v_canonical_key, v_actual_order
    from public.event_run_scenarios as s
    where s.run_id = v_run_id;

  if v_count <> 5 or v_canonical_key <> v_combination_key or v_actual_order <> v_order_key then
    raise exception using errcode = '23514', message = 'run_must_have_exactly_five_scenarios';
  end if;
  return null;
end;
$$;

create constraint trigger event_participant_runs_five_scenarios
  after insert or update on public.event_participant_runs
  deferrable initially deferred
  for each row execute function public.assert_five_scenarios_per_run();

create constraint trigger event_run_scenarios_five_scenarios
  after insert or update or delete on public.event_run_scenarios
  deferrable initially deferred
  for each row execute function public.assert_five_scenarios_per_run();

create or replace function public.allocate_event_participant_run(
  p_session_id uuid,
  p_player_id uuid,
  p_registration_id uuid
)
returns table (
  run_id uuid,
  run_status text,
  scenario_ids text[],
  run_progress jsonb,
  run_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
  v_player public.event_players%rowtype;
  v_run public.event_participant_runs%rowtype;
  v_scenario_set text[];
  v_ordered_scenarios text[];
  v_combination_key text;
  v_order_key text;
  v_combo_reused boolean := false;
  v_fresh_order boolean := false;
  v_index integer;
begin
  select s.*
    into v_session
    from public.event_sessions as s
    where s.id = p_session_id
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;
  if v_session.status <> 'active' then
    raise exception using errcode = '55000', message = 'session_not_active';
  end if;

  select p.*
    into v_player
    from public.event_players as p
    where p.session_id = p_session_id
      and p.id = p_player_id
      and p.registration_id = p_registration_id
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'player_not_found';
  end if;
  if v_player.completion_status = 'completed' then
    raise exception using errcode = '55000', message = 'player_completed';
  end if;

  select r.*
    into v_run
    from public.event_participant_runs as r
    where r.session_id = p_session_id
      and r.player_id = p_player_id;
  if found then
    return query
      select
        v_run.id,
        v_run.status,
        array(
          select s.scenario_id
          from public.event_run_scenarios as s
          where s.run_id = v_run.id
          order by s.ordinal
        ),
        v_run.progress,
        v_run.updated_at;
    return;
  end if;

  with recursive combinations(scenario_ids, last_id, scenario_count) as (
    select array[c.scenario_id], c.scenario_id, 1
      from public.event_scenario_catalog as c
      where c.active
    union all
    select combinations.scenario_ids || c.scenario_id, c.scenario_id, combinations.scenario_count + 1
      from combinations
      join public.event_scenario_catalog as c
        on c.active and c.scenario_id > combinations.last_id
      where combinations.scenario_count < 5
  )
  select combinations.scenario_ids
    into v_scenario_set
    from combinations
    where combinations.scenario_count = 5
      and not exists (
        select 1
        from public.event_session_combinations as used
        where used.session_id = p_session_id
          and used.combination_key = array_to_string(combinations.scenario_ids, ',')
      )
    order by random()
    limit 1;

  if v_scenario_set is null then
    select used.combination_key
      into v_combination_key
      from public.event_session_combinations as used
      where used.session_id = p_session_id
        and used.orders_used < 120
      order by used.use_count, random()
      limit 1;

    if found then
      v_combo_reused := true;
      v_scenario_set := string_to_array(v_combination_key, ',');
      v_fresh_order := true;
    else
      select used.combination_key
        into v_combination_key
        from public.event_session_combinations as used
        where used.session_id = p_session_id
        order by used.use_count, random()
        limit 1;
      if not found then
        raise exception using errcode = '22023', message = 'scenario_pool_unavailable';
      end if;
      v_combo_reused := true;
      v_scenario_set := string_to_array(v_combination_key, ',');
    end if;
  else
    v_combination_key := array_to_string(v_scenario_set, ',');
    v_fresh_order := true;
  end if;

  if v_fresh_order then
    with recursive permutations(scenario_ids) as (
      select array[]::text[]
      union all
      select permutations.scenario_ids || candidate.scenario_id
        from permutations
        cross join unnest(v_scenario_set) as candidate(scenario_id)
        where cardinality(permutations.scenario_ids) < 5
          and not candidate.scenario_id = any(permutations.scenario_ids)
    )
    select permutations.scenario_ids
      into v_ordered_scenarios
      from permutations
      where cardinality(permutations.scenario_ids) = 5
        and not exists (
          select 1
          from public.event_participant_runs as prior
          where prior.session_id = p_session_id
            and prior.combination_key = v_combination_key
            and prior.order_key = array_to_string(permutations.scenario_ids, ',')
        )
      order by random()
      limit 1;
  end if;

  if v_ordered_scenarios is null then
    select array_agg(candidate.scenario_id order by random())
      into v_ordered_scenarios
      from unnest(v_scenario_set) as candidate(scenario_id);
  end if;
  v_order_key := array_to_string(v_ordered_scenarios, ',');

  if v_combo_reused then
    update public.event_session_combinations as used
      set use_count = used.use_count + 1,
          orders_used = used.orders_used + case when v_fresh_order then 1 else 0 end
      where used.session_id = p_session_id
        and used.combination_key = v_combination_key;
  else
    insert into public.event_session_combinations (
      session_id, combination_key, use_count, orders_used
    ) values (
      p_session_id, v_combination_key, 1, 1
    );
  end if;

  insert into public.event_participant_runs (
    session_id, player_id, combination_key, order_key, status, started_at
  ) values (
    p_session_id, p_player_id, v_combination_key, v_order_key, 'in_progress', clock_timestamp()
  )
  returning * into v_run;

  for v_index in 1..5 loop
    insert into public.event_run_scenarios (run_id, scenario_id, ordinal)
      values (v_run.id, v_ordered_scenarios[v_index], v_index);
  end loop;

  update public.event_players as p
    set completion_status = 'in_progress'
    where p.id = p_player_id
      and p.session_id = p_session_id
      and p.completion_status = 'joined';

  return query
    select v_run.id, v_run.status, v_ordered_scenarios, v_run.progress, v_run.updated_at;
end;
$$;

create or replace function public.start_event_player(
  p_session_id uuid,
  p_player_id uuid,
  p_registration_id uuid
)
returns table (
  result_player_id uuid,
  result_completion_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
  v_player public.event_players%rowtype;
begin
  select s.*
    into v_session
    from public.event_sessions as s
    where s.id = p_session_id
    for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;
  if v_session.status <> 'active' then
    raise exception using errcode = '55000', message = 'session_not_active';
  end if;

  select p.*
    into v_player
    from public.event_players as p
    where p.session_id = p_session_id
      and p.id = p_player_id
      and p.registration_id = p_registration_id
    for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'player_not_found';
  end if;
  if v_player.completion_status = 'completed' then
    raise exception using errcode = '55000', message = 'player_completed';
  end if;

  perform public.allocate_event_participant_run(
    p_session_id,
    p_player_id,
    p_registration_id
  );

  update public.event_players as p
    set completion_status = 'in_progress'
    where p.id = v_player.id
      and p.completion_status = 'joined'
    returning * into v_player;

  return query select v_player.id, v_player.completion_status;
end;
$$;

create or replace function public.save_event_run_progress(
  p_session_id uuid,
  p_player_id uuid,
  p_registration_id uuid,
  p_progress jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
  v_player public.event_players%rowtype;
  v_updated_at timestamptz;
begin
  if p_progress is null
    or jsonb_typeof(p_progress) <> 'object'
    or octet_length(p_progress::text) > 65536
  then
    raise exception using errcode = '22023', message = 'invalid_run_progress';
  end if;

  select s.*
    into v_session
    from public.event_sessions as s
    where s.id = p_session_id
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;
  if v_session.status <> 'active' then
    raise exception using errcode = '55000', message = 'session_not_active';
  end if;

  select p.*
    into v_player
    from public.event_players as p
    where p.session_id = p_session_id
      and p.id = p_player_id
      and p.registration_id = p_registration_id
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'player_not_found';
  end if;
  if v_player.completion_status = 'completed' then
    raise exception using errcode = '55000', message = 'player_completed';
  end if;

  update public.event_participant_runs as r
    set progress = p_progress,
        status = 'in_progress',
        started_at = coalesce(r.started_at, clock_timestamp()),
        updated_at = clock_timestamp()
    where r.session_id = p_session_id
      and r.player_id = p_player_id
    returning r.updated_at into v_updated_at;
  if not found then
    raise exception using errcode = 'P0002', message = 'run_not_found';
  end if;
  return v_updated_at;
end;
$$;

create or replace function public.reset_event_session(p_session_id uuid)
returns table (
  reset_session_id uuid,
  reset_status text,
  reset_player_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
  v_player_count integer;
begin
  select s.*
    into v_session
    from public.event_sessions as s
    where s.id = p_session_id
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;

  delete from public.event_results as r where r.session_id = p_session_id;
  delete from public.event_participant_runs as r where r.session_id = p_session_id;
  delete from public.event_session_combinations as c where c.session_id = p_session_id;
  update public.event_players as p
    set completion_status = 'joined',
        completed_at = null
    where p.session_id = p_session_id;
  update public.event_sessions as s
    set status = 'waiting',
        started_at = null,
        ended_at = null,
        organizer_state = '{}'::jsonb
    where s.id = p_session_id;

  select count(*)::integer into v_player_count
    from public.event_players as p
    where p.session_id = p_session_id;

  return query select p_session_id, 'waiting'::text, v_player_count;
end;
$$;

revoke all on function public.assert_five_scenarios_per_run()
  from public, anon, authenticated;
revoke all on function public.allocate_event_participant_run(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.start_event_player(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.save_event_run_progress(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.reset_event_session(uuid)
  from public, anon, authenticated;

grant execute on function public.allocate_event_participant_run(uuid, uuid, uuid)
  to service_role;
grant execute on function public.start_event_player(uuid, uuid, uuid)
  to service_role;
grant execute on function public.save_event_run_progress(uuid, uuid, uuid, jsonb)
  to service_role;
grant execute on function public.reset_event_session(uuid)
  to service_role;
