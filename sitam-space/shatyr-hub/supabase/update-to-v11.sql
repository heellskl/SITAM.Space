-- SITAM SPACE — update an ALREADY SET UP database to v11 (safe to run more than once).
-- Supabase → SQL Editor → New query → paste this whole file → Run.
create schema if not exists sitam_meta;
create table if not exists sitam_meta.applied_migrations (version text primary key, name text not null, applied_at timestamptz not null default now());

-- ════════ 20261025100000_sitam_v11_labs_events ════════
/* SITAM SPACE v11 — lab focus & direction, past team members, upcoming activities, event posters
   ────────────────────────────────────────────────────────────────────────────────────────────
   • Lab focus is now 3 categories in this order: Industry & Commercial Projects · Research · Education
     ("Courses" and the old "Academic / Education" become "Education").
   • labs.direction: the second lab filter (AI & Data Science, Cloud & Cybersecurity, Robotics & IoT,
     Multimedia & Digital, Mathematics & Fundamental Sciences).
   • labs.upcoming_activities: what the lab plans next (shown on the lab page).
   • lab_members.is_past + graduation_year: past team members with the year they graduated.
   • Event posters: events.poster_url (SDU events) and external_events.poster_url (competitions, hackathons…).
   Re-runnable. */

/* ───────────── focus ───────────── */
update public.labs set focus = array_replace(array_replace(focus, 'Courses', 'Education'), 'Academic / Education', 'Education')
 where focus && array['Courses', 'Academic / Education'];
-- one entry per category, in the agreed order
update public.labs l set focus = coalesce((
  select array_agg(f order by case f when 'Industry & Commercial Projects' then 1 when 'Research' then 2 when 'Education' then 3 else 4 end, f)
    from (select distinct unnest(l.focus) as f) d), '{}')
 where cardinality(focus) > 0;

/* ───────────── direction ───────────── */
alter table public.labs add column if not exists direction text
  check (direction is null or direction in ('AI & Data Science', 'Cloud & Cybersecurity', 'Robotics & IoT', 'Multimedia & Digital', 'Mathematics & Fundamental Sciences'));
update public.labs set direction = d.direction
  from (values
    ('ai-lab', 'AI & Data Science'), ('computer-vision', 'AI & Data Science'), ('data-analytics-lab', 'AI & Data Science'), ('statistics', 'AI & Data Science'),
    ('cloud-computing', 'Cloud & Cybersecurity'), ('distributed-systems-and-computing-lab', 'Cloud & Cybersecurity'), ('cybersecurity-laboratory', 'Cloud & Cybersecurity'),
    ('cisco-networking-academy', 'Cloud & Cybersecurity'), ('fortinet', 'Cloud & Cybersecurity'), ('redhat-laboratory', 'Cloud & Cybersecurity'),
    ('robotics-lab', 'Robotics & IoT'), ('iot-laboratory', 'Robotics & IoT'), ('microelectronics-chip-lab', 'Robotics & IoT'),
    ('multimedia-studio-f06', 'Multimedia & Digital'), ('multimedia-3d-lab-1109', 'Multimedia & Digital'), ('multimedia-lab', 'Multimedia & Digital'),
    ('applied-mathematics', 'Mathematics & Fundamental Sciences'), ('analysis', 'Mathematics & Fundamental Sciences'), ('algebra', 'Mathematics & Fundamental Sciences'),
    ('physics-lab', 'Mathematics & Fundamental Sciences'), ('mcm-lab', 'Mathematics & Fundamental Sciences')
  ) as d(slug, direction)
 where labs.slug = d.slug and labs.direction is null;

/* ───────────── upcoming activities ───────────── */
alter table public.labs add column if not exists upcoming_activities text[] not null default '{}';

/* ───────────── past team members ───────────── */
alter table public.lab_members add column if not exists is_past boolean not null default false;
alter table public.lab_members add column if not exists graduation_year int check (graduation_year is null or graduation_year between 1990 and 2100);
-- heads edit these two through the lab form (column grants, like the other team fields)
grant insert (is_past, graduation_year) on public.lab_members to authenticated;
grant update (is_past, graduation_year) on public.lab_members to authenticated;

/* ───────────── event posters ───────────── */
alter table public.events add column if not exists poster_url text check (poster_url is null or poster_url ~* '^https?://');
alter table public.external_events add column if not exists poster_url text check (poster_url is null or poster_url ~* '^https?://');

-- SDU events: the people who manage the event set its poster
create or replace function public.set_event_poster(p_event uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_event(p_event) then raise exception 'NOT_ALLOWED: only the organizers of this event can change its poster'; end if;
  if p_url is not null and p_url !~* '^https?://' then raise exception 'BAD_INPUT: the poster must be an https:// link'; end if;
  update public.events set poster_url = nullif(trim(p_url), '') where id = p_event;
end;
$$;

-- external events: the author or the coordinator
create or replace function public.set_external_event_poster(p_event uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_external_event(p_event) then raise exception 'NOT_ALLOWED: only the person who added this event or the coordinator can change its poster'; end if;
  if p_url is not null and p_url !~* '^https?://' then raise exception 'BAD_INPUT: the poster must be an https:// link'; end if;
  update public.external_events set poster_url = nullif(trim(p_url), '') where id = p_event;
end;
$$;

revoke execute on function public.set_event_poster(uuid, text) from anon, public;
revoke execute on function public.set_external_event_poster(uuid, text) from anon, public;
grant execute on function public.set_event_poster(uuid, text) to authenticated;
grant execute on function public.set_external_event_poster(uuid, text) to authenticated;

insert into sitam_meta.applied_migrations (version, name) values ('20261025100000', 'sitam_v11_labs_events') on conflict do nothing;

-- ════════ access for the website roles ════════
-- SITAM SPACE — fix "You do not have permission to do this" on a new Supabase project.
-- New Supabase projects can be created WITHOUT the usual default access for the website roles (anon, authenticated).
-- Then the site cannot read labs, research, events… and shows "You do not have permission to do this".
-- This file gives the standard Supabase access back and then re-applies every restriction of the SITAM migrations,
-- so the site's rules (who may write what) stay exactly as designed. Row-level security keeps protecting the rows.
-- Run: Supabase → SQL Editor → New query → paste → Run. Safe to run more than once.

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- the SITAM restrictions, in migration order
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (first_name, last_name, course, major, department, position, bio, links, cv_filename) on public.profiles to authenticated;
revoke update on public.companies from authenticated;
grant update (name, website, description, logo_url) on public.companies to authenticated;
revoke insert on public.opportunities from anon, authenticated;
revoke insert, update, delete on public.opportunity_hosts from anon, authenticated;
revoke insert, update, delete on public.applications from anon, authenticated;
revoke insert on public.events from anon, authenticated;
revoke insert, update, delete on public.event_hosts from anon, authenticated;
revoke insert, update, delete on public.event_registrations from anon, authenticated;
revoke select on public.professors from anon, authenticated;
grant select (id, username, first_name, last_name, full_name, job_title, degree, photo_url, orcid_url, scopus_id, scholar_url,               h_index, i10_index, total_citations, total_works, keywords, topics, profile_id, updated_at)   on public.professors to anon, authenticated;
grant select on public.event_stats, public.research_yearly to anon, authenticated;
grant update (phone) on public.profiles to authenticated;
revoke update on public.projects from authenticated;
grant update (kind, status, title, summary, tags, authors, year, github_url, demo_url, paper_url, sort_order, lab_id) on public.projects to authenticated;
revoke insert on public.projects from anon, authenticated;
grant insert (lab_id, kind, status, title, summary, tags, authors, year, github_url, demo_url, paper_url, sort_order) on public.projects to authenticated;
revoke execute on function public.refresh_professor_metrics(uuid) from anon, authenticated, public;
revoke insert, update on public.lab_members from anon, authenticated;
grant insert (lab_id, full_name, title, role, term, sort_order) on public.lab_members to authenticated;
grant update (full_name, title, role, term, sort_order) on public.lab_members to authenticated;
grant delete on public.lab_members to authenticated;
revoke execute on function public.add_lab_member(uuid, text, text, text, text) from anon, public;
grant execute on function public.add_lab_member(uuid, text, text, text, text) to authenticated;
revoke execute on function public.my_context() from anon, public;
grant execute on function public.my_context() to authenticated;
grant execute on function public.is_lab_head(uuid) to authenticated;
revoke insert, update, delete on public.lab_head_requests from anon, authenticated;
grant select on public.lab_head_requests to authenticated;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;
grant select (email) on public.professors to authenticated;
revoke all on public.coordinator_emails from anon, authenticated;
grant update (faculty, group_name, avatar_url) on public.profiles to authenticated;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;
revoke execute on function public.my_context() from anon, public;
grant execute on function public.my_context() to authenticated;
revoke execute on function public.submit_project(text, text, text, text[], text[], int, text, text, text, text, text) from anon, public;
grant execute on function public.submit_project(text, text, text, text[], text[], int, text, text, text, text, text) to authenticated;
grant select on public.event_series, public.external_events, public.external_event_labs, public.external_event_people to anon, authenticated;
revoke insert, update, delete on public.event_series, public.external_events, public.external_event_labs, public.external_event_people from anon, authenticated;
revoke execute on function public.save_external_event(uuid, text, text, text, text, text, date, date, text, boolean, uuid) from anon, public;
revoke execute on function public.delete_external_event(uuid) from anon, public;
revoke execute on function public.save_event_participation(uuid, uuid, jsonb, text, text, text, uuid, text) from anon, public;
revoke execute on function public.remove_event_participation(uuid, uuid) from anon, public;
grant execute on function public.save_external_event(uuid, text, text, text, text, text, date, date, text, boolean, uuid) to authenticated;
grant execute on function public.delete_external_event(uuid) to authenticated;
grant execute on function public.save_event_participation(uuid, uuid, jsonb, text, text, text, uuid, text) to authenticated;
grant execute on function public.remove_event_participation(uuid, uuid) to authenticated;
grant execute on function public.name_key(text) to anon, authenticated;
grant insert (is_past, graduation_year) on public.lab_members to authenticated;
grant update (is_past, graduation_year) on public.lab_members to authenticated;
revoke execute on function public.set_event_poster(uuid, text) from anon, public;
revoke execute on function public.set_external_event_poster(uuid, text) from anon, public;
grant execute on function public.set_event_poster(uuid, text) to authenticated;
grant execute on function public.set_external_event_poster(uuid, text) to authenticated;
