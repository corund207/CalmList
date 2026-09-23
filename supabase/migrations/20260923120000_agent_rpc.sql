-- AI-agent (MCP) access through personal access tokens. Safe to run more than once.
-- The MCP endpoint calls these with the public anon key: the token is the only credential,
-- and the database itself turns it into a user and scopes every read and write to that user.
-- The endpoint never holds a key that can see other people's data.

/** The user a raw token belongs to, or null. Also records when the token was last used. */
create or replace function public.calmlist_token_user(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then
    return null;
  end if;
  update public.calmlist_api_tokens
     set last_used_at = now()
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  returning user_id into v_user;
  return v_user;
end;
$$;

revoke all on function public.calmlist_token_user(text) from public, anon, authenticated;

/** Everything the token's owner has, plus their chosen timezone. */
create or replace function public.calmlist_agent_read(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.calmlist_token_user(p_token);
begin
  if v_user is null then
    raise exception 'invalid token' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'timezone', (select timezone from public.calmlist_api_tokens where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'data', data))
        from public.calmlist_items
       where user_id = v_user and data is not null and kind in ('projects', 'sections', 'labels', 'filters', 'tasks')
    ), '[]'::jsonb)
  );
end;
$$;

/** Upserts changes ([{kind, id, data}], data null deletes) into the token owner's account only. */
create or replace function public.calmlist_agent_write(p_token text, p_changes jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.calmlist_token_user(p_token);
  v_count integer;
begin
  if v_user is null then
    raise exception 'invalid token' using errcode = '28000';
  end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 200 then
    raise exception 'changes must be an array of at most 200 items';
  end if;
  insert into public.calmlist_items (user_id, kind, id, data)
  select v_user, c->>'kind', c->>'id', nullif(c->'data', 'null'::jsonb)
    from jsonb_array_elements(p_changes) c
   where c->>'kind' in ('projects', 'sections', 'labels', 'tasks', 'comments', 'events')
  on conflict (user_id, kind, id) do update set data = excluded.data;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.calmlist_agent_read(text) from public;
revoke all on function public.calmlist_agent_write(text, jsonb) from public;
grant execute on function public.calmlist_agent_read(text) to anon, authenticated;
grant execute on function public.calmlist_agent_write(text, jsonb) to anon, authenticated;
