-- CalmList sync schema for Supabase (hosted or self-hosted).
-- Every record a user owns is one JSON document. Deleted records stay as tombstones
-- (data = null) so other devices hear about them. Safe to run more than once.

create sequence if not exists public.calmlist_rev;

create table if not exists public.calmlist_items (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('projects', 'sections', 'labels', 'filters', 'tasks', 'comments', 'events')),
  id         text        not null check (char_length(id) between 1 and 64),
  data       jsonb       check (data is null or pg_column_size(data) < 65536),
  rev        bigint      not null default 0, -- set by the trigger below
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

create index if not exists calmlist_items_user_rev on public.calmlist_items (user_id, rev);

-- Each write takes the next revision, so clients can ask for "everything after rev N".
create or replace function public.calmlist_bump()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.rev := nextval('public.calmlist_rev');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists calmlist_bump on public.calmlist_items;
create trigger calmlist_bump
  before insert or update on public.calmlist_items
  for each row execute function public.calmlist_bump();

-- Row level security: people only ever see and change their own rows.
alter table public.calmlist_items enable row level security;

drop policy if exists "calmlist read own" on public.calmlist_items;
create policy "calmlist read own" on public.calmlist_items
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "calmlist insert own" on public.calmlist_items;
create policy "calmlist insert own" on public.calmlist_items
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "calmlist update own" on public.calmlist_items;
create policy "calmlist update own" on public.calmlist_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "calmlist delete own" on public.calmlist_items;
create policy "calmlist delete own" on public.calmlist_items
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.calmlist_items from anon;
grant select, insert, update, delete on public.calmlist_items to authenticated;

-- Live updates between devices.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'calmlist_items') then
    alter publication supabase_realtime add table public.calmlist_items;
  end if;
end;
$$;
