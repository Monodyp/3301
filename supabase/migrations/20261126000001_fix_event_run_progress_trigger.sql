create or replace function public.initialize_event_run_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  if tg_table_name = 'event_participant_runs' then
    v_run_id := new.id;
  elsif tg_table_name = 'event_run_scenarios' then
    v_run_id := new.run_id;
  else
    raise exception 'Unexpected trigger table: %', tg_table_name;
  end if;

  insert into public.event_run_scenario_progress
    (run_id, scenario_id, ordinal)
  select v_run_id, s.scenario_id, s.ordinal
  from public.event_run_scenarios as s
  where s.run_id = v_run_id
  on conflict (run_id, scenario_id) do nothing;

  return new;
end;
$$;
