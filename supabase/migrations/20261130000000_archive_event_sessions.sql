alter table public.event_sessions
  drop constraint event_sessions_status_check,
  add constraint event_sessions_status_check
    check (status in ('waiting', 'active', 'completed', 'archived'));

alter table public.event_sessions
  drop constraint event_sessions_check,
  add constraint event_sessions_lifecycle_check
    check (
      status = 'archived'
      or (
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

create or replace function public.archive_event_session(p_session_id uuid)
returns table (session_id uuid, already_archived boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select s.status
    into v_status
    from public.event_sessions as s
    where s.id = p_session_id
    for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;

  if v_status = 'archived' then
    return query select p_session_id, true;
    return;
  end if;

  update public.event_sessions as s
    set status = 'archived'
    where s.id = p_session_id;

  return query select p_session_id, false;
end;
$$;

revoke all on function public.archive_event_session(uuid)
  from public, anon, authenticated;
grant execute on function public.archive_event_session(uuid)
  to service_role;

create or replace function public.prevent_archived_event_session_reopen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception using errcode = '55000', message = 'session_archived';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_archived_event_session_reopen()
  from public, anon, authenticated, service_role;

create trigger prevent_archived_event_session_reopen_before_update
  before update of status on public.event_sessions
  for each row execute function public.prevent_archived_event_session_reopen();

create or replace function public.register_event_player(
  p_session_id uuid,
  p_registration_id uuid,
  p_nickname text
)
returns table (
  player_id uuid,
  player_nickname text,
  completion_status text,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
  v_player public.event_players%rowtype;
  v_player_count bigint;
begin
  if p_registration_id is null
    or p_nickname is null
    or char_length(btrim(p_nickname)) not between 1 and 32
    or p_nickname ~ '[[:cntrl:]]'
  then
    raise exception using errcode = '22023', message = 'invalid_registration';
  end if;

  select s.*
    into v_session
    from public.event_sessions as s
    where s.id = p_session_id
    for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;

  if v_session.status = 'archived' then
    raise exception using errcode = '55000', message = 'session_not_open';
  end if;

  select p.*
    into v_player
    from public.event_players as p
    where p.session_id = p_session_id
      and p.registration_id = p_registration_id;

  if found then
    return query
      select v_player.id, v_player.nickname, v_player.completion_status, false;
    return;
  end if;

  if v_session.status <> 'waiting' then
    raise exception using errcode = '55000', message = 'session_not_open';
  end if;

  select count(*)
    into v_player_count
    from public.event_players as p
    where p.session_id = p_session_id;

  if v_player_count >= v_session.max_players then
    raise exception using errcode = 'P0001', message = 'session_full';
  end if;

  insert into public.event_players (session_id, registration_id, nickname)
    values (p_session_id, p_registration_id, btrim(p_nickname))
    returning * into v_player;

  return query
    select v_player.id, v_player.nickname, v_player.completion_status, true;
end;
$$;

revoke all on function public.register_event_player(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.register_event_player(uuid, uuid, text)
  to service_role;
