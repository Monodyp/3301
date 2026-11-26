alter table public.event_sessions
  add column join_code text;

alter table public.event_sessions
  add constraint event_sessions_join_code_key unique (join_code),
  add constraint event_sessions_join_code_format_check
    check (join_code ~ '^[0-9]{4}$');

do $$
declare
  v_session record;
  v_session_count bigint;
  v_start integer;
  v_offset integer;
  v_code text;
  v_assigned boolean;
begin
  select count(*) into v_session_count from public.event_sessions;
  if v_session_count > 10000 then
    raise exception using errcode = '54000', message = 'join_code_space_exhausted';
  end if;

  for v_session in
    select id from public.event_sessions order by created_at, id
  loop
    v_start := pg_catalog.floor(pg_catalog.random() * 10000)::integer;
    v_assigned := false;

    for v_offset in 0..9999 loop
      v_code := pg_catalog.lpad(((v_start + v_offset) % 10000)::text, 4, '0');
      begin
        update public.event_sessions
          set join_code = v_code
          where id = v_session.id;
        v_assigned := true;
      exception when unique_violation then
        v_assigned := false;
      end;
      if v_assigned then
        exit;
      end if;
    end loop;

    if not v_assigned then
      raise exception using errcode = '54000', message = 'join_code_space_exhausted';
    end if;
  end loop;
end;
$$;

alter table public.event_sessions
  alter column join_code set not null;

create or replace function public.assign_event_session_join_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start integer;
  v_offset integer;
  v_code text;
begin
  if tg_op = 'UPDATE' then
    if new.join_code is distinct from old.join_code then
      raise exception using errcode = '55000', message = 'join_code_immutable';
    end if;
    return new;
  end if;

  if new.join_code is not null then
    raise exception using errcode = '22023', message = 'join_code_managed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(3301, 20261127);
  v_start := pg_catalog.floor(pg_catalog.random() * 10000)::integer;

  for v_offset in 0..9999 loop
    v_code := pg_catalog.lpad(((v_start + v_offset) % 10000)::text, 4, '0');
    if not exists (
      select 1
      from public.event_sessions as session
      where session.join_code = v_code
    ) then
      new.join_code := v_code;
      return new;
    end if;
  end loop;

  raise exception using errcode = '54000', message = 'join_code_space_exhausted';
end;
$$;

create trigger assign_event_session_join_code_before_insert
  before insert or update of join_code on public.event_sessions
  for each row execute function public.assign_event_session_join_code();

revoke all on function public.assign_event_session_join_code()
  from public, anon, authenticated;
grant execute on function public.assign_event_session_join_code()
  to service_role;
