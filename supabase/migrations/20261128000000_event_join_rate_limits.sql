create table public.event_join_rate_limit_attempts (
  attempt_id uuid primary key,
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  attempted_at timestamptz not null,
  expires_at timestamptz not null
);

alter table public.event_join_rate_limit_attempts enable row level security;

create index event_join_rate_limit_attempts_client_expiry_idx
  on public.event_join_rate_limit_attempts (client_hash, expires_at);

create index event_join_rate_limit_attempts_code_expiry_idx
  on public.event_join_rate_limit_attempts (code_hash, expires_at);

create index event_join_rate_limit_attempts_expiry_idx
  on public.event_join_rate_limit_attempts (expires_at);

revoke all on table public.event_join_rate_limit_attempts
  from public, anon, authenticated, service_role;

create or replace function public.record_event_join_code_attempt(
  p_attempt_id uuid,
  p_client_hash text,
  p_code_hash text,
  p_join_code text,
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns table (allowed boolean, failure_recorded boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, pg_catalog.clock_timestamp());
  v_is_joinable boolean := false;
  v_client_15m bigint;
  v_client_24h bigint;
  v_code_15m bigint;
  v_code_24h bigint;
begin
  if p_attempt_id is null
    or p_client_hash is null
    or p_client_hash !~ '^[0-9a-f]{64}$'
    or p_code_hash is null
    or p_code_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'invalid_join_rate_limit_attempt';
  end if;

  delete from public.event_join_rate_limit_attempts
    where expires_at <= v_now;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('join-rate-client:' || p_client_hash, 3301)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('join-rate-code:' || p_code_hash, 3301)
  );

  if p_join_code ~ '^[0-9]{4}$' then
    select exists (
      select 1
      from public.event_sessions as session
      where session.join_code = p_join_code
        and session.status = 'waiting'
        and (
          select count(*)
          from public.event_players as player
          where player.session_id = session.id
        ) < session.max_players
    ) into v_is_joinable;
  end if;

  if v_is_joinable then
    return query select true, false;
    return;
  end if;

  select
    count(*) filter (where attempted_at > v_now - interval '15 minutes'),
    count(*)
    into v_client_15m, v_client_24h
    from public.event_join_rate_limit_attempts
    where client_hash = p_client_hash
      and expires_at > v_now
      and attempted_at > v_now - interval '24 hours';

  select
    count(*) filter (where attempted_at > v_now - interval '15 minutes'),
    count(*)
    into v_code_15m, v_code_24h
    from public.event_join_rate_limit_attempts
    where code_hash = p_code_hash
      and expires_at > v_now
      and attempted_at > v_now - interval '24 hours';

  if v_client_15m >= 120
    or v_client_24h >= 1000
    or v_code_15m >= 10
    or v_code_24h >= 60
  then
    return query select false, false;
    return;
  end if;

  insert into public.event_join_rate_limit_attempts (
    attempt_id, client_hash, code_hash, attempted_at, expires_at
  )
  values (
    p_attempt_id, p_client_hash, p_code_hash, v_now, v_now + interval '24 hours'
  );

  return query select true, true;
end;
$$;

revoke all on function public.record_event_join_code_attempt(uuid, text, text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.record_event_join_code_attempt(uuid, text, text, text, timestamptz)
  to service_role;
