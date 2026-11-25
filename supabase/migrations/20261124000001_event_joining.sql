alter table public.event_sessions
  add column max_players integer not null default 60
  check (max_players between 1 and 200);

alter table public.event_players
  add column registration_id uuid not null default gen_random_uuid();

alter table public.event_players
  add constraint event_players_session_registration_id_key
  unique (session_id, registration_id);

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

  if v_player.completion_status = 'joined' then
    update public.event_players as p
      set completion_status = 'in_progress'
      where p.id = v_player.id
      returning * into v_player;
  end if;

  return query
    select v_player.id, v_player.completion_status;
end;
$$;

create or replace function public.set_event_session_status(
  p_session_id uuid,
  p_next_status text
)
returns table (
  session_id uuid,
  session_name text,
  session_status text,
  session_max_players integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
begin
  if p_next_status is null or p_next_status not in ('active', 'completed') then
    raise exception using errcode = '22023', message = 'invalid_session_update';
  end if;

  select s.*
    into v_session
    from public.event_sessions as s
    where s.id = p_session_id
    for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;

  if v_session.status = p_next_status then
    return query
      select v_session.id, v_session.name, v_session.status, v_session.max_players;
    return;
  end if;

  if not (
    (v_session.status = 'waiting' and p_next_status = 'active')
    or (v_session.status = 'active' and p_next_status = 'completed')
  )
  then
    raise exception using errcode = '55000', message = 'invalid_status_transition';
  end if;

  if p_next_status = 'active' then
    update public.event_sessions as s
      set status = 'active', started_at = clock_timestamp()
      where s.id = p_session_id
      returning * into v_session;
  else
    update public.event_sessions as s
      set status = 'completed', ended_at = clock_timestamp()
      where s.id = p_session_id
      returning * into v_session;
  end if;

  return query
    select v_session.id, v_session.name, v_session.status, v_session.max_players;
end;
$$;

revoke all on function public.register_event_player(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.start_event_player(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.set_event_session_status(uuid, text)
  from public, anon, authenticated;

grant execute on function public.register_event_player(uuid, uuid, text)
  to service_role;
grant execute on function public.start_event_player(uuid, uuid, uuid)
  to service_role;
grant execute on function public.set_event_session_status(uuid, text)
  to service_role;
