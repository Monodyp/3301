begin;

select plan(15);

create temporary table _priority5a_context (
  session_id uuid not null,
  registration_one uuid not null,
  registration_two uuid not null,
  player_one uuid,
  player_two uuid,
  exhaustion_session_id uuid not null,
  exhaustion_registration_id uuid not null,
  exhaustion_registration_two uuid not null,
  exhaustion_player_id uuid,
  exhaustion_player_two uuid
);

insert into _priority5a_context (
  session_id, registration_one, registration_two,
  exhaustion_session_id, exhaustion_registration_id, exhaustion_registration_two
) values (
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
);

insert into public.event_sessions (id, name)
select session_id, 'Priority 5A test session'
from _priority5a_context;

with registered as (
  select c.session_id, r.player_id
  from _priority5a_context as c
  cross join lateral public.register_event_player(
    c.session_id, c.registration_one, 'Same Nickname'
  ) as r
)
update _priority5a_context as c
set player_one = registered.player_id
from registered
where c.session_id = registered.session_id;

with registered as (
  select c.session_id, r.player_id
  from _priority5a_context as c
  cross join lateral public.register_event_player(
    c.session_id, c.registration_two, 'Same Nickname'
  ) as r
)
update _priority5a_context as c
set player_two = registered.player_id
from registered
where c.session_id = registered.session_id;

select is(
  (select count(*) from public.event_players p, _priority5a_context c
   where p.session_id = c.session_id),
  2::bigint,
  'same display nickname can register as two distinct participants'
);

select is(
  (select count(distinct p.id) from public.event_players p, _priority5a_context c
   where p.session_id = c.session_id),
  2::bigint,
  'each participant has a unique database ID'
);

select * from public.set_event_session_status(
  (select session_id from _priority5a_context), 'active'
);
select * from public.start_event_player(
  (select session_id from _priority5a_context),
  (select player_one from _priority5a_context),
  (select registration_one from _priority5a_context)
);
select * from public.start_event_player(
  (select session_id from _priority5a_context),
  (select player_two from _priority5a_context),
  (select registration_two from _priority5a_context)
);

select is(
  (select count(*) from public.event_participant_runs r, _priority5a_context c
   where r.session_id = c.session_id),
  2::bigint,
  'each participant receives one persisted run'
);

select is(
  (select count(*) from public.event_run_scenarios s
   join public.event_participant_runs r on r.id = s.run_id
   join _priority5a_context c on c.session_id = r.session_id),
  10::bigint,
  'each run contains exactly five assignment rows'
);

select is(
  (select min(scenario_count) from (
    select count(distinct s.scenario_id) as scenario_count
    from public.event_run_scenarios s
    join public.event_participant_runs r on r.id = s.run_id
    join _priority5a_context c on c.session_id = r.session_id
    group by r.id
  ) as counts),
  5::bigint,
  'each participant assignment contains five unique scenarios'
);

select is(
  (select count(distinct r.combination_key)
   from public.event_participant_runs r, _priority5a_context c
   where r.session_id = c.session_id),
  2::bigint,
  'participants receive different combinations while unused combinations remain'
);

select * from public.start_event_player(
  (select session_id from _priority5a_context),
  (select player_one from _priority5a_context),
  (select registration_one from _priority5a_context)
);

select is(
  (select count(*) from public.event_participant_runs r, _priority5a_context c
   where r.session_id = c.session_id and r.player_id = c.player_one),
  1::bigint,
  'restarting a participant preserves the original run'
);

select public.save_event_run_progress(
  (select session_id from _priority5a_context),
  (select player_one from _priority5a_context),
  (select registration_one from _priority5a_context),
  '{"completedScenarioCount":2}'::jsonb
);

select is(
  (select r.progress->>'completedScenarioCount'
   from public.event_participant_runs r, _priority5a_context c
   where r.session_id = c.session_id and r.player_id = c.player_one),
  '2',
  'participant progress is persisted on the existing run'
);

select ok(
  not has_table_privilege('anon', 'public.event_participant_runs', 'select'),
  'anonymous clients cannot read participant runs directly'
);

select ok(
  not has_function_privilege('anon', 'public.reset_event_session(uuid)', 'execute'),
  'anonymous clients cannot reset sessions directly'
);

select * from public.reset_event_session(
  (select session_id from _priority5a_context)
);

select is(
  (select s.status from public.event_sessions s, _priority5a_context c
   where s.id = c.session_id),
  'waiting',
  'authorized reset returns the session to waiting'
);

select is(
  (select count(*) from public.event_participant_runs r, _priority5a_context c
   where r.session_id = c.session_id),
  0::bigint,
  'reset clears assignments and persisted progress'
);

insert into public.event_sessions (id, name)
select exhaustion_session_id, 'Priority 5A exhaustion test'
from _priority5a_context;

with registered as (
  select c.exhaustion_session_id, r.player_id
  from _priority5a_context as c
  cross join lateral public.register_event_player(
    c.exhaustion_session_id, c.exhaustion_registration_id, 'Exhaustion Test'
  ) as r
)
update _priority5a_context as c
set exhaustion_player_id = registered.player_id
from registered
where c.exhaustion_session_id = registered.exhaustion_session_id;

with registered as (
  select c.exhaustion_session_id, r.player_id
  from _priority5a_context as c
  cross join lateral public.register_event_player(
    c.exhaustion_session_id, c.exhaustion_registration_two, 'Second Exhaustion Test'
  ) as r
)
update _priority5a_context as c
set exhaustion_player_two = registered.player_id
from registered
where c.exhaustion_session_id = registered.exhaustion_session_id;

with recursive combinations(scenario_ids, last_id, scenario_count) as (
  select array[c.scenario_id], c.scenario_id, 1
  from public.event_scenario_catalog c
  where c.active
  union all
  select combinations.scenario_ids || c.scenario_id,
         c.scenario_id,
         combinations.scenario_count + 1
  from combinations
  join public.event_scenario_catalog c
    on c.active and c.scenario_id > combinations.last_id
  where combinations.scenario_count < 5
)
insert into public.event_session_combinations (
  session_id, combination_key, use_count, orders_used
)
select c.exhaustion_session_id,
       array_to_string(combinations.scenario_ids, ','),
       1,
       120
from combinations
cross join _priority5a_context c
where combinations.scenario_count = 5;

select * from public.set_event_session_status(
  (select exhaustion_session_id from _priority5a_context), 'active'
);
select * from public.start_event_player(
  (select exhaustion_session_id from _priority5a_context),
  (select exhaustion_player_id from _priority5a_context),
  (select exhaustion_registration_id from _priority5a_context)
);
update public.event_session_combinations as combinations
set orders_used = 119
where combinations.session_id = (select exhaustion_session_id from _priority5a_context)
  and combinations.combination_key = (
    select run.combination_key
    from public.event_participant_runs as run, _priority5a_context as context
    where run.session_id = context.exhaustion_session_id
      and run.player_id = context.exhaustion_player_id
  );
select * from public.start_event_player(
  (select exhaustion_session_id from _priority5a_context),
  (select exhaustion_player_two from _priority5a_context),
  (select exhaustion_registration_two from _priority5a_context)
);

select is(
  (select count(*) from public.event_session_combinations c, _priority5a_context x
   where c.session_id = x.exhaustion_session_id),
  4368::bigint,
  'the five-scenario combination space is exhausted before any set is reused'
);

select is(
  (select count(*) from public.event_session_combinations c, _priority5a_context x
   where c.session_id = x.exhaustion_session_id and c.use_count > 1),
  1::bigint,
  'a combination is reused only after all combinations have been reserved'
);

select is(
  (select count(*)
   from public.event_participant_runs first_run
   join public.event_participant_runs second_run
     on second_run.session_id = first_run.session_id
    and second_run.combination_key = first_run.combination_key
    and second_run.order_key <> first_run.order_key
   join _priority5a_context c on c.exhaustion_session_id = first_run.session_id
   where first_run.player_id = c.exhaustion_player_id
     and second_run.player_id = c.exhaustion_player_two),
  1::bigint,
  'reused combinations receive a different order when an unused order remains'
);

select * from finish();
rollback;
