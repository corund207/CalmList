-- Accounts, AI-agent access, account deletion and service statistics. Safe to run more than once.

/* ─── Personal access tokens for AI agents (MCP) ─────────────────────────── */
-- The app generates a random token in the browser and stores only its SHA-256 hash here.
-- The MCP endpoint looks the hash up with the service role and then acts only on that user's rows.

create table if not exists public.calmlist_api_tokens (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  name         text        not null check (char_length(name) between 1 and 60),
  token_hash   text        not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  hint         text        not null check (char_length(hint) <= 12),
  timezone     text        not null default 'UTC' check (char_length(timezone) <= 64),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists calmlist_api_tokens_user on public.calmlist_api_tokens (user_id);

alter table public.calmlist_api_tokens enable row level security;

drop policy if exists "calmlist tokens read own" on public.calmlist_api_tokens;
create policy "calmlist tokens read own" on public.calmlist_api_tokens
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "calmlist tokens create own" on public.calmlist_api_tokens;
create policy "calmlist tokens create own" on public.calmlist_api_tokens
  for insert to authenticated with check (user_id = (select auth.uid()));

-- At most 20 tokens per person. A trigger, because a policy that counts its own table recurses.
create or replace function public.calmlist_token_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.calmlist_api_tokens where user_id = new.user_id) >= 20 then
    raise exception 'token limit reached (20)';
  end if;
  return new;
end;
$$;

drop trigger if exists calmlist_token_limit on public.calmlist_api_tokens;
create trigger calmlist_token_limit before insert on public.calmlist_api_tokens
  for each row execute function public.calmlist_token_limit();

drop policy if exists "calmlist tokens delete own" on public.calmlist_api_tokens;
create policy "calmlist tokens delete own" on public.calmlist_api_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.calmlist_api_tokens from anon;
grant select, insert, delete on public.calmlist_api_tokens to authenticated;

/* ─── Right to erasure ───────────────────────────────────────────────────── */
-- Deletes the signed-in account. Items and tokens go with it through ON DELETE CASCADE.

create or replace function public.calmlist_delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.calmlist_delete_account() from public, anon;
grant execute on function public.calmlist_delete_account() to authenticated;

/* ─── Service status (no personal data) ──────────────────────────────────── */

create table if not exists public.calmlist_status_checks (
  id         bigint      generated always as identity primary key,
  checked_at timestamptz not null default now(),
  component  text        not null check (component in ('api', 'auth', 'realtime', 'app')),
  ok         boolean     not null,
  latency_ms integer     check (latency_ms >= 0)
);

create index if not exists calmlist_status_checks_time on public.calmlist_status_checks (checked_at desc);

-- Only the service role reads or writes checks: RLS on, no policies.
alter table public.calmlist_status_checks enable row level security;
revoke all on public.calmlist_status_checks from anon, authenticated;

/** Aggregate numbers for the public status page. Counts only; never identifies anyone. */
create or replace function public.calmlist_service_stats()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'users_total',  (select count(*) from auth.users),
    'active_1d',    (select count(*) from auth.users where last_sign_in_at > now() - interval '1 day'),
    'active_7d',    (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'active_30d',   (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'syncing_7d',   (select count(distinct user_id) from public.calmlist_items where updated_at > now() - interval '7 days'),
    'uptime_24h',   (select round(100.0 * avg(ok::int), 3) from public.calmlist_status_checks where checked_at > now() - interval '1 day'),
    'uptime_7d',    (select round(100.0 * avg(ok::int), 3) from public.calmlist_status_checks where checked_at > now() - interval '7 days'),
    'uptime_30d',   (select round(100.0 * avg(ok::int), 3) from public.calmlist_status_checks where checked_at > now() - interval '30 days'),
    'latency_p50',  (select percentile_cont(0.5) within group (order by latency_ms) from public.calmlist_status_checks where checked_at > now() - interval '1 day' and ok),
    'checks_30d',   (select count(*) from public.calmlist_status_checks where checked_at > now() - interval '30 days'),
    'last_check',   (select max(checked_at) from public.calmlist_status_checks),
    'last_ok',      (select ok from public.calmlist_status_checks order by checked_at desc limit 1),
    'db_version',   current_setting('server_version')
  );
$$;

revoke all on function public.calmlist_service_stats() from public, anon, authenticated;
grant execute on function public.calmlist_service_stats() to service_role;

-- Keep 90 days of checks.
create or replace function public.calmlist_prune_status()
returns void language sql security definer set search_path = '' as $$
  delete from public.calmlist_status_checks where checked_at < now() - interval '90 days';
$$;
revoke all on function public.calmlist_prune_status() from public, anon, authenticated;
grant execute on function public.calmlist_prune_status() to service_role;
