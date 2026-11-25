create or replace function public.sync_event_result_incorrect_actions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.event_run_five_scenario_results as result
    set incorrect_actions = least(
      100,
      (
        select count(*)::integer
        from public.event_run_action_records as action
        where action.run_id = new.run_id
          and action.action_kind = 'protective_action'
          and action.correct = false
      )
    )
    where result.run_id = new.run_id;
  return new;
end;
$$;

create trigger sync_event_result_incorrect_actions_after_insert
  after insert on public.event_run_five_scenario_results
  for each row execute function public.sync_event_result_incorrect_actions();

revoke all on function public.sync_event_result_incorrect_actions()
  from public, anon, authenticated;
grant execute on function public.sync_event_result_incorrect_actions()
  to service_role;
