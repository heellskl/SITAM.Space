-- SITAM SPACE — update an ALREADY SET UP database to v15 (safe to run more than once).
-- Supabase → SQL Editor → New query → paste this whole file → Run.
create schema if not exists sitam_meta;
create table if not exists sitam_meta.applied_migrations (version text primary key, name text not null, applied_at timestamptz not null default now());

-- ════════ 20261027100000_sitam_v12_industry_communities ════════
/* SITAM SPACE v12 — communities, "Commercial Projects", two e-mails, event location / organizer, industry partners
   ────────────────────────────────────────────────────────────────────────────────────────────────────────────
   • labs.kind: 'lab' or 'community'. Communities live on the Labs page (tab "Communities") and work like labs
     (own page, heads, team). Only the coordinator turns a lab into a community or back (trigger labs_kind_guard).
     Seeded: AWS Student Builders Group, Competitive Programming Team, SDU Official Hackathon Team.
   • Lab focus "Industry & Commercial Projects" is renamed "Commercial Projects" (order: Commercial Projects · Research · Education).
   • profiles.personal_email: a second, personal e-mail next to the SDU e-mail; shown to signed-in users (public_people).
   • external_events.location_type ('sdu' | 'outside' | 'online') and external_events.cohosted (SDU co-hosts it),
     set with set_external_event_place() by the author or the coordinator. SDU events: "Online" when the room says so.
   • industry_partners: partner companies shown on the Industry page. Everyone reads; only the coordinator edits.
   Re-runnable. */

/* ───────────── communities ───────────── */
alter table public.labs add column if not exists kind text not null default 'lab' check (kind in ('lab', 'community'));

create or replace function public.labs_kind_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind is distinct from old.kind and not public.is_admin() then
    raise exception 'NOT_ALLOWED: only the SITAM coordinator can turn a lab into a community';
  end if;
  return new;
end;
$$;
drop trigger if exists labs_kind_guard on public.labs;
create trigger labs_kind_guard before update of kind on public.labs for each row execute function public.labs_kind_guard();
revoke execute on function public.labs_kind_guard() from anon, authenticated, public;

insert into public.labs (slug, name, kind, focus, description, location)
values
  ('aws-student-builders-group', 'AWS Student Builders Group', 'community', '{}',
   'Student community around Amazon Web Services: cloud workshops, study groups for AWS certifications and hands-on builder sessions.', 'SDU University'),
  ('competitive-programming-team', 'Competitive Programming Team', 'community', '{}',
   'SDU students who train together for programming olympiads and contests (ICPC and others).', 'SDU University'),
  ('sdu-official-hackathon-team', 'SDU Official Hackathon Team', 'community', '{}',
   'The official SDU team for hackathons: students who build prototypes in teams and represent the university at hackathons.', 'SDU University')
on conflict (slug) do update set kind = 'community';

/* ───────────── focus: "Commercial Projects" ───────────── */
update public.labs set focus = array_replace(focus, 'Industry & Commercial Projects', 'Commercial Projects')
 where 'Industry & Commercial Projects' = any(focus);
update public.labs l set focus = coalesce((
  select array_agg(f order by case f when 'Commercial Projects' then 1 when 'Research' then 2 when 'Education' then 3 else 4 end, f)
    from (select distinct unnest(l.focus) as f) d), '{}')
 where cardinality(focus) > 0;

/* ───────────── second (personal) e-mail ───────────── */
alter table public.profiles add column if not exists personal_email text
  check (personal_email is null or personal_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
grant update (personal_email) on public.profiles to authenticated;

create or replace view public.public_people as
  select p.id, p.first_name, p.last_name, p.role::text as role, p.email, p.course, p.major, p.department, p.position, p.bio,
         p.faculty, p.group_name, p.avatar_url, p.personal_email
    from public.profiles p;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;

/* ───────────── external events: location and organizer ───────────── */
alter table public.external_events add column if not exists location_type text not null default 'outside'
  check (location_type in ('sdu', 'outside', 'online'));
alter table public.external_events add column if not exists cohosted boolean not null default false;

-- known editions held at SDU together with a partner
update public.external_events set location_type = 'sdu', cohosted = true
 where (title ilike 'Freedom Ecosystem Challenge%' or title ilike 'SDU Winter GameJam%') and location_type = 'outside' and not cohosted;
update public.external_events set location_type = 'online'
 where location_type = 'outside' and location ~* '(^|\W)(online|zoom|remote)(\W|$)';

create or replace function public.set_external_event_place(p_event uuid, p_location_type text, p_cohosted boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_external_event(p_event) then raise exception 'NOT_ALLOWED: only the person who added this event or the coordinator can change it'; end if;
  if p_location_type not in ('sdu', 'outside', 'online') then raise exception 'BAD_INPUT: location must be At SDU, Outside SDU or Online'; end if;
  update public.external_events set location_type = p_location_type, cohosted = coalesce(p_cohosted, false), updated_at = now() where id = p_event;
end;
$$;
revoke execute on function public.set_external_event_place(uuid, text, boolean) from anon, public;
grant execute on function public.set_external_event_place(uuid, text, boolean) to authenticated;

/* ───────────── industry partners ───────────── */
create table if not exists public.industry_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  short_name text check (short_name is null or char_length(short_name) <= 40),
  logo_url text check (logo_url is null or logo_url ~* '^https?://'),
  website text check (website is null or website ~* '^https?://'),
  ceo text check (ceo is null or char_length(ceo) <= 160),
  founded_year int check (founded_year is null or founded_year between 1800 and 2100),
  sdu_alumni text[] not null default '{}',
  upcoming_projects text[] not null default '{}',
  completed_projects text[] not null default '{}',
  lab_ids uuid[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists industry_partners_name_ci on public.industry_partners (lower(name));
alter table public.industry_partners enable row level security;
drop policy if exists "Partners are public" on public.industry_partners;
create policy "Partners are public" on public.industry_partners for select using (true);
drop policy if exists "Coordinator manages partners" on public.industry_partners;
create policy "Coordinator manages partners" on public.industry_partners for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.industry_partners to anon, authenticated;
grant insert, update, delete on public.industry_partners to authenticated;

-- partners the labs named in their forms; CEO, year and alumni are filled in by the coordinator
insert into public.industry_partners (name, short_name, lab_ids, sort_order)
select v.name, v.short_name,
       coalesce((select array_agg(l.id) from public.labs l where l.slug = any(v.slugs)), '{}'), v.ord
  from (values
    ('Freedom Holding Corp.', 'Freedom', array['data-analytics-lab'], 1),
    ('Alash Electronics', 'Alash', array['robotics-lab'], 2),
    ('USTEM Foundation', 'USTEM', array['robotics-lab'], 3),
    ('qcloudy', 'qcloudy', array['ai-lab'], 4),
    ('Institute of Mathematics and Mathematical Modeling', 'IMMM', array['mcm-lab'], 5)
  ) as v(name, short_name, slugs, ord)
on conflict ((lower(name))) do nothing;

insert into sitam_meta.applied_migrations (version, name) values ('20261027100000', 'sitam_v12_industry_communities') on conflict do nothing;

-- ════════ 20261027120000_sitam_v12_1_lab_tags ════════
/* SITAM SPACE v12.1 — one shared list of research areas, skills and equipment
   ───────────────────────────────────────────────────────────────────────────
   What one lab types becomes a suggestion for every other lab (the site reads labs.tags, labs.skills,
   labs.equipment). The coordinator keeps the list clean:
   • admin_rename_lab_tag(kind, old, new) renames a tag in every lab, or merges it into an existing one
     ("pytorch" → "PyTorch"); with new = null it removes the tag everywhere.
   kind: 'area' (labs.tags) · 'skill' (labs.skills) · 'equipment' (labs.equipment, a comma separated text).
   Re-runnable. */

create or replace function public.admin_rename_lab_tag(p_kind text, p_old text, p_new text)
returns int language plpgsql security definer set search_path = public as $$
declare v_old text := lower(trim(coalesce(p_old, ''))); v_new text := nullif(left(trim(coalesce(p_new, '')), 60), ''); n int;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED: only the SITAM coordinator manages the tag list'; end if;
  if p_kind not in ('area', 'skill', 'equipment') then raise exception 'BAD_INPUT: kind must be area, skill or equipment'; end if;
  if v_old = '' then raise exception 'BAD_INPUT: choose the tag to change'; end if;

  if p_kind = 'equipment' then
    update public.labs l set equipment = nullif((
      select string_agg(x, ', ' order by o) from (
        select distinct on (lower(x)) x, o from (
          select case when lower(trim(e)) = v_old then v_new else trim(e) end as x, o
            from regexp_split_to_table(l.equipment, '\s*[\n,;]+\s*') with ordinality as t(e, o)) s
         where x is not null and x <> '' order by lower(x), o) d), '')
     where exists (select 1 from regexp_split_to_table(l.equipment, '\s*[\n,;]+\s*') e where lower(trim(e)) = v_old);
  elsif p_kind = 'area' then
    update public.labs l set tags = coalesce((
      select array_agg(x order by o) from (
        select distinct on (lower(x)) x, o from (
          select case when lower(trim(e)) = v_old then v_new else e end as x, o from unnest(l.tags) with ordinality as t(e, o)) s
         where x is not null order by lower(x), o) d), '{}')
     where exists (select 1 from unnest(l.tags) e where lower(trim(e)) = v_old);
  else
    update public.labs l set skills = coalesce((
      select array_agg(x order by o) from (
        select distinct on (lower(x)) x, o from (
          select case when lower(trim(e)) = v_old then v_new else e end as x, o from unnest(l.skills) with ordinality as t(e, o)) s
         where x is not null order by lower(x), o) d), '{}')
     where exists (select 1 from unnest(l.skills) e where lower(trim(e)) = v_old);
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.admin_rename_lab_tag(text, text, text) from anon, public;
grant execute on function public.admin_rename_lab_tag(text, text, text) to authenticated;

insert into sitam_meta.applied_migrations (version, name) values ('20261027120000', 'sitam_v12_1_lab_tags') on conflict do nothing;

-- ════════ 20261028100000_sitam_v13_photos_academic_plan ════════
/* SITAM SPACE v13 — event photos and the Academic Year Plan
   ─────────────────────────────────────────────────────────
   • events.photo_urls: photos of an SDU event, uploaded to Supabase Storage (bucket lab-assets) by the organizers
     and set with set_event_photos() (same people as the poster: can_manage_event).
   • academic_plans + academic_plan_items: the school's Academic Year Plan shown on /academic-plan as a timeline
     (Fall · Spring · Summer), with filters For Students / For Researchers / For Industry Partners and the official PDF.
     Everyone reads; only the SITAM coordinator writes.
   • Storage bucket "documents" (public, PDF ≤ 20 MB) for the official plan PDF; only the coordinator uploads.
   Re-runnable. */

/* ───────────── event photos ───────────── */
alter table public.events add column if not exists photo_urls text[] not null default '{}';

create or replace function public.set_event_photos(p_event uuid, p_urls text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_event(p_event) then raise exception 'NOT_ALLOWED: only the organizers of this event can change its photos'; end if;
  if cardinality(coalesce(p_urls, '{}')) > 80 then raise exception 'BAD_INPUT: up to 80 photos per event'; end if;
  if exists (select 1 from unnest(coalesce(p_urls, '{}')) u where u !~* '^https?://') then raise exception 'BAD_INPUT: photos must be https:// links'; end if;
  update public.events set photo_urls = coalesce(p_urls, '{}') where id = p_event;
end;
$$;
revoke execute on function public.set_event_photos(uuid, text[]) from anon, public;
grant execute on function public.set_event_photos(uuid, text[]) to authenticated;

/* ───────────── Academic Year Plan ───────────── */
create table if not exists public.academic_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 120),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  pdf_url text check (pdf_url is null or pdf_url ~* '^https?://'),
  intro text check (intro is null or char_length(intro) <= 2000),
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists academic_plans_one_current on public.academic_plans (is_current) where is_current;

create table if not exists public.academic_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.academic_plans(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 160),
  kind text not null default 'other'
    check (kind in ('grant_deadline', 'poster_day', 'conference', 'hackathon', 'report_deadline', 'seminar', 'other')),
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  audiences text[] not null default array['students', 'researchers', 'industry']
    check (audiences <@ array['students', 'researchers', 'industry']),
  description text check (description is null or char_length(description) <= 2000),
  url text check (url is null or url ~* '^https?://'),
  lab_id uuid references public.labs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists academic_plan_items_plan on public.academic_plan_items (plan_id, starts_on);

alter table public.academic_plans enable row level security;
alter table public.academic_plan_items enable row level security;
drop policy if exists "Plans are public" on public.academic_plans;
create policy "Plans are public" on public.academic_plans for select using (true);
drop policy if exists "Coordinator manages plans" on public.academic_plans;
create policy "Coordinator manages plans" on public.academic_plans for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Plan items are public" on public.academic_plan_items;
create policy "Plan items are public" on public.academic_plan_items for select using (true);
drop policy if exists "Coordinator manages plan items" on public.academic_plan_items;
create policy "Coordinator manages plan items" on public.academic_plan_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.academic_plans, public.academic_plan_items to anon, authenticated;
grant insert, update, delete on public.academic_plans, public.academic_plan_items to authenticated;

-- the current academic year, empty: the coordinator adds the dates (events from the Events page are shown on it automatically)
insert into public.academic_plans (title, starts_on, ends_on, is_current)
select 'Academic Year 2026–2027', date '2026-09-01', date '2027-08-31', true
 where not exists (select 1 from public.academic_plans);

/* ───────────── storage: official documents (PDF) ───────────── */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', true, 20971520, array['application/pdf'])
on conflict (id) do nothing;
drop policy if exists "Coordinator uploads documents" on storage.objects;
drop policy if exists "Coordinator updates documents" on storage.objects;
drop policy if exists "Coordinator deletes documents" on storage.objects;
create policy "Coordinator uploads documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_admin());
create policy "Coordinator updates documents" on storage.objects for update to authenticated
  using (bucket_id = 'documents' and public.is_admin());
create policy "Coordinator deletes documents" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_admin());

insert into sitam_meta.applied_migrations (version, name) values ('20261028100000', 'sitam_v13_photos_academic_plan') on conflict do nothing;

-- ════════ 20261029100000_sitam_v15_submission_affiliation ════════
/* SITAM SPACE v15 — "Submit your research / project": link the submission to a lab OR a researcher
   ─────────────────────────────────────────────────────────────────────────────────────────────────
   • projects.related_lab_id: the lab the student worked with (no foreign key on purpose: projects already
     has lab_id → labs, a second link would make the site's "labs(name, slug)" lookups ambiguous).
   • projects.supervisor_id → professors: the researcher (supervisor) the work was done with.
   • set_submission_affiliation(project, lab, researcher): the author of a submission sets one of the two
     (or none). It does not make the work a lab project — lab heads still manage only their lab's own projects.
   Re-runnable. */

alter table public.projects add column if not exists related_lab_id uuid;
alter table public.projects add column if not exists supervisor_id uuid references public.professors(id) on delete set null;
do $$ begin
  alter table public.projects add constraint projects_one_affiliation check (related_lab_id is null or supervisor_id is null);
exception when duplicate_object then null; end $$;

create or replace function public.set_submission_affiliation(p_project uuid, p_lab uuid, p_supervisor uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if not exists (select 1 from public.projects where id = p_project and owner_id = auth.uid() and lab_id is null) and not public.is_admin() then
    raise exception 'NOT_ALLOWED: only the author of this submission can change it';
  end if;
  if p_lab is not null and p_supervisor is not null then raise exception 'BAD_INPUT: choose a lab or a researcher, not both'; end if;
  if p_lab is not null and not exists (select 1 from public.labs where id = p_lab) then raise exception 'NOT_FOUND: lab'; end if;
  if p_supervisor is not null and not exists (select 1 from public.professors where id = p_supervisor) then raise exception 'NOT_FOUND: researcher'; end if;
  update public.projects set related_lab_id = p_lab, supervisor_id = p_supervisor where id = p_project;
end;
$$;
revoke execute on function public.set_submission_affiliation(uuid, uuid, uuid) from anon, public;
grant execute on function public.set_submission_affiliation(uuid, uuid, uuid) to authenticated;

insert into sitam_meta.applied_migrations (version, name) values ('20261029100000', 'sitam_v15_submission_affiliation') on conflict do nothing;

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
grant select (id, username, first_name, last_name, full_name, job_title, degree, photo_url, orcid_url, scopus_id, scholar_url, h_index, i10_index, total_citations, total_works, keywords, topics, profile_id, updated_at) on public.professors to anon, authenticated;
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
revoke execute on function public.labs_kind_guard() from anon, authenticated, public;
grant update (personal_email) on public.profiles to authenticated;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;
revoke execute on function public.set_external_event_place(uuid, text, boolean) from anon, public;
grant execute on function public.set_external_event_place(uuid, text, boolean) to authenticated;
grant select on public.industry_partners to anon, authenticated;
grant insert, update, delete on public.industry_partners to authenticated;
revoke execute on function public.admin_rename_lab_tag(text, text, text) from anon, public;
grant execute on function public.admin_rename_lab_tag(text, text, text) to authenticated;
revoke execute on function public.set_event_photos(uuid, text[]) from anon, public;
grant execute on function public.set_event_photos(uuid, text[]) to authenticated;
grant select on public.academic_plans, public.academic_plan_items to anon, authenticated;
grant insert, update, delete on public.academic_plans, public.academic_plan_items to authenticated;
revoke execute on function public.set_submission_affiliation(uuid, uuid, uuid) from anon, public;
grant execute on function public.set_submission_affiliation(uuid, uuid, uuid) to authenticated;
