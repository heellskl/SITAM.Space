-- SITAM SPACE — update to v23 (Startup Hub; made-up sample events removed). Safe to run more than once.
-- Run it AFTER update-to-v20.sql. Supabase → SQL Editor → New query → paste this whole file → Run.
create schema if not exists sitam_meta;
create table if not exists sitam_meta.applied_migrations (version text primary key, name text not null, applied_at timestamptz not null default now());

-- ════════ 20261103100000_sitam_v23_startups ════════
/* ════════════════════════════════════════════════════════════════════════════
   SITAM SPACE v23 — Startup Hub + made-up events removed (approved by the user 2026-11-02)
   • Removes the made-up sample events (description contains "[sample]"); their hosts and registrations go with them.
     Opportunities, companies and competitions are NOT touched.
   • projects.stage: idea / prototype / mvp for student startups.
   • submit_startup: SDU accounts (not partners, not alumni) propose a startup → SITAM moderation (pending) →
     the coordinator approves it in Manage → Moderation (moderate_project); then everybody sees it on /startups.
   Safe to run more than once.
   ════════════════════════════════════════════════════════════════════════════ */

delete from public.events where description like '%[sample]%';

alter table public.projects add column if not exists stage text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'projects_stage_valid') then
    alter table public.projects add constraint projects_stage_valid check (stage is null or stage in ('idea', 'prototype', 'mvp'));
  end if;
end $$;

create or replace function public.submit_startup(p_title text, p_summary text, p_demo_url text, p_stage text, p_tags text[])
returns public.projects language plpgsql security definer set search_path = public as $$
declare v_role text := public.my_role_text(); v_row public.projects; v_name text; v_url text := nullif(btrim(coalesce(p_demo_url, '')), '');
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if v_role is null or v_role in ('partner', 'alumni') then raise exception 'NOT_ALLOWED: SDU accounts only'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 2 and 120 then raise exception 'INVALID: the project name is required'; end if;
  if char_length(btrim(coalesce(p_summary, ''))) not between 20 and 1000 then raise exception 'INVALID: describe the idea and the solution (20+ characters)'; end if;
  if p_stage not in ('idea', 'prototype', 'mvp') then raise exception 'INVALID: choose the stage'; end if;
  if v_url is not null and v_url !~* '^https://' then raise exception 'INVALID: the link must start with https://'; end if;
  if (select count(*) from public.projects where owner_id = auth.uid() and moderation = 'pending') >= 5 then
    raise exception 'TOO_MANY: wait until your pending submissions are reviewed';
  end if;
  select nullif(btrim(concat_ws(' ', first_name, last_name)), '') into v_name from public.profiles where id = auth.uid();
  insert into public.projects (lab_id, owner_id, kind, status, title, summary, tags, authors, year, demo_url, stage, moderation, submitted_at)
  values (null, auth.uid(), 'startup', 'ongoing', btrim(p_title), btrim(p_summary),
          coalesce((select array_agg(distinct left(btrim(t), 40)) from unnest(coalesce(p_tags, '{}')) t where btrim(t) <> ''), '{}'),
          case when v_name is null then '{}' else array[v_name] end, extract(year from now())::int, v_url, p_stage,
          case when public.is_admin() then 'approved' else 'pending' end, now())
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.submit_startup(text, text, text, text, text[]) from anon, public;
grant execute on function public.submit_startup(text, text, text, text, text[]) to authenticated;

insert into sitam_meta.applied_migrations (version, name) values ('20261103100000', 'sitam_v23_startups') on conflict do nothing;
