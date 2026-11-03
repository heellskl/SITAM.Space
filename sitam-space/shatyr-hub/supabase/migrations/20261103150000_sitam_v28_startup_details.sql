/* ════════════════════════════════════════════════════════════════════════════
   SITAM SPACE v28 — Startups: project card with details (requested 2026-11-03)
   • projects.logo_url: the startup's logo or photo (uploaded by the author to their own folder in "avatars").
   • project_startup_people: mentors / trackers (v27) who work with a startup, chosen when the project is proposed.
   • submit_startup(…, p_github_url, p_logo_url, p_people): new version without technologies; the old one stays
     for older pages. Safe to run more than once.
   ════════════════════════════════════════════════════════════════════════════ */
alter table public.projects add column if not exists logo_url text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'projects_logo_url_https') then
    alter table public.projects add constraint projects_logo_url_https check (logo_url is null or logo_url ~* '^https://');
  end if;
end $$;

create table if not exists public.project_startup_people (
  project_id uuid not null references public.projects(id) on delete cascade,
  person_id uuid not null references public.startup_people(id) on delete cascade,
  primary key (project_id, person_id)
);
create index if not exists project_startup_people_person_idx on public.project_startup_people (person_id);
alter table public.project_startup_people enable row level security;
drop policy if exists "Startup mentors: visible with the project" on public.project_startup_people;
-- visible when the project itself is visible to the reader (projects keeps its own rules)
create policy "Startup mentors: visible with the project" on public.project_startup_people for select to anon, authenticated
  using (exists (select 1 from public.projects p where p.id = project_id));
revoke all on public.project_startup_people from anon, authenticated, public;
grant select on public.project_startup_people to anon, authenticated;

create or replace function public.submit_startup(p_title text, p_summary text, p_demo_url text, p_stage text,
  p_github_url text, p_logo_url text, p_people uuid[])
returns public.projects language plpgsql security definer set search_path = public as $$
declare v_role text := public.my_role_text(); v_row public.projects; v_name text;
        v_url text := nullif(btrim(coalesce(p_demo_url, '')), '');
        v_git text := nullif(btrim(coalesce(p_github_url, '')), '');
        v_logo text := nullif(btrim(coalesce(p_logo_url, '')), '');
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if v_role is null or v_role in ('partner', 'alumni') then raise exception 'NOT_ALLOWED: SDU accounts only'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 2 and 120 then raise exception 'INVALID: the project name is required'; end if;
  if char_length(btrim(coalesce(p_summary, ''))) not between 20 and 1000 then raise exception 'INVALID: describe the idea and the solution (20+ characters)'; end if;
  if p_stage not in ('idea', 'prototype', 'mvp') then raise exception 'INVALID: choose the stage'; end if;
  if v_url is not null and v_url !~* '^https://' then raise exception 'INVALID: the link must start with https://'; end if;
  if v_git is not null and v_git !~* '^https://(www\.)?github\.com/' then raise exception 'INVALID: the GitHub link must start with https://github.com/'; end if;
  if v_logo is not null and v_logo !~* '^https://' then raise exception 'INVALID: upload the logo again'; end if;
  if cardinality(coalesce(p_people, '{}')) > 10 then raise exception 'INVALID: choose up to 10 mentors and trackers'; end if;
  if (select count(*) from public.projects where owner_id = auth.uid() and moderation = 'pending') >= 5 then
    raise exception 'TOO_MANY: wait until your pending submissions are reviewed';
  end if;
  select nullif(btrim(concat_ws(' ', first_name, last_name)), '') into v_name from public.profiles where id = auth.uid();
  insert into public.projects (lab_id, owner_id, kind, status, title, summary, tags, authors, year, demo_url, github_url, logo_url, stage, moderation, submitted_at)
  values (null, auth.uid(), 'startup', 'ongoing', btrim(p_title), btrim(p_summary), '{}',
          case when v_name is null then '{}' else array[v_name] end, extract(year from now())::int, v_url, v_git, v_logo, p_stage,
          case when public.is_admin() then 'approved' else 'pending' end, now())
  returning * into v_row;
  insert into public.project_startup_people (project_id, person_id)
  select v_row.id, sp.id from public.startup_people sp where sp.id = any(coalesce(p_people, '{}'))
  on conflict do nothing;
  return v_row;
end;
$$;
revoke execute on function public.submit_startup(text, text, text, text, text, text, uuid[]) from anon, public;
grant execute on function public.submit_startup(text, text, text, text, text, text, uuid[]) to authenticated;
