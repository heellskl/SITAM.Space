-- SITAM SPACE — update an ALREADY SET UP database to v16 (safe to run more than once).
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

-- ════════ 20261030100000_sitam_v16_ask_sitam ════════
/* SITAM SPACE v16 — "Ask SITAM" (RAG MVP)
   ───────────────────────────────────────
   One knowledge table for the assistant instead of an embedding column in every table:
   a lab, a researcher, a paper, a project, an event, a vacancy or an FAQ answer each becomes one row of
   public.ai_documents (title, text, link, embedding). One index, one search function, and private data can never
   leak in by accident — only what public.ai_sources produces is indexed.

   • extension vector (pgvector); embeddings: 384 numbers = Supabase AI model "gte-small" (free, runs inside Edge Functions).
   • public.ai_sources (view): the PUBLIC text of every item. Never: CVs, phones, e-mails, applications, lab Internal.
   • public.ai_pending_documents(limit): what is new or changed since the last indexing (by md5 of the text).
   • public.ai_upsert_document / ai_remove_stale: used by the Edge Function "ai-index" (service role only).
   • public.match_documents(query_embedding, match_count, min_similarity): vector search (cosine).
   • public.ai_usage + ai_take_quota(): daily limit of questions per person (default 30).
   Re-runnable. */

create extension if not exists vector with schema extensions;

/* ───────────── knowledge table ───────────── */
create table if not exists public.ai_documents (
  id bigint generated always as identity primary key,
  source_type text not null check (source_type in ('lab', 'researcher', 'publication', 'project', 'event', 'external_event', 'opportunity', 'partner', 'faq')),
  source_id text not null,
  title text not null,
  url text not null,
  content text not null,
  content_hash text not null,
  embedding extensions.vector(384),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);
create index if not exists ai_documents_embedding_idx on public.ai_documents
  using hnsw (embedding extensions.vector_cosine_ops);
alter table public.ai_documents enable row level security;
-- the whole table is public knowledge; only the server (service role) writes it
drop policy if exists "AI documents are public" on public.ai_documents;
create policy "AI documents are public" on public.ai_documents for select using (true);
revoke insert, update, delete on public.ai_documents from anon, authenticated;
grant select on public.ai_documents to anon, authenticated;

/* ───────────── FAQ (same text as the FAQ page) ───────────── */
create table if not exists public.ai_faq (
  id serial primary key,
  question text not null unique,
  answer text not null
);
alter table public.ai_faq enable row level security;
drop policy if exists "FAQ is public" on public.ai_faq;
create policy "FAQ is public" on public.ai_faq for select using (true);
grant select on public.ai_faq to anon, authenticated;
revoke insert, update, delete on public.ai_faq from anon, authenticated;
insert into public.ai_faq (question, answer) values
  ('How do I become a lab head?', 'Lab heads are assigned by the SITAM coordinator. Register and sign in once, then ask the coordinator to assign you to your lab. A student or a teacher can be a lab head; your account type does not change.'),
  ('What can a lab head do?', 'Only for your own lab: edit all lab information, add and remove members (search registered users), create, edit and delete lab projects and events. Everyone else sees the lab read-only.'),
  ('How is my account type set?', 'You choose it when you register: Student, Teacher or Industry partner. Students and teachers register with their SDU e-mail.'),
  ('How do I join a lab?', 'A lab head adds you to the lab after you have signed in at least once. Labs also post Lab cases on the Opportunities page.'),
  ('How do I register and sign in?', 'Open Register, choose Student, Teacher or Industry partner, fill in the form and you are signed in right away. Next time sign in with your e-mail and password. Forgot the password? Use “E-mail me a sign-in link” on the Sign in page.'),
  ('I am a teacher. How do I offer a topic or position to students?', 'After the SITAM office verifies your account, open your profile → “Post an opportunity”. It appears on the Opportunities page automatically, and you see every applicant with contacts and CV in Manage → Applications.'),
  ('Where do lab events, projects and vacancies appear?', 'Everywhere at once. When a lab head adds an event, a project or a vacancy on the lab page, it automatically shows up in Events, Projects or Opportunities.'),
  ('How do I join a laboratory?', 'Labs post Lab Cases and Research Cases on the Opportunities page. Apply there — the CV from your registration is attached automatically, and you can replace it for a single application. Lab heads review applications in their inbox.'),
  ('Can I use a different CV for one application?', 'Yes. When you apply, keep the CV from your profile or upload another PDF for that application only. Your profile CV stays unchanged.'),
  ('I head a lab and I am also a student. Can I apply to company vacancies?', 'Yes. Roles are additive: lab-head rights let you manage your lab, and your student account can still apply anywhere except to your own lab’s listings.'),
  ('How do lab heads update their lab page and projects?', 'On the Labs page open your lab: Edit, Add member, New project and New event appear only for its heads.'),
  ('When and where are the events?', 'Research events run on Tuesdays at 17:00 and Industry events on Thursdays at 17:00, in Room C1.2. An event can be hosted by several labs, companies or projects together. Register in one click to get a QR ticket.'),
  ('Where do the publication numbers come from?', 'From the Scopus export: publications, citations, h-index and research topics per professor. Click a researcher to see all of their papers.'),
  ('Who sees my data?', 'Your applications and CV are visible only to you and to the people reviewing that specific opportunity. Attendee lists are visible only to event organizers. Your name, role and e-mail are visible to signed-in members so they can write to you; your phone is not shown.')
on conflict (question) do update set answer = excluded.answer;

/* ───────────── what the assistant may know (public data only) ───────────── */
create or replace view public.ai_sources with (security_invoker = false) as
  -- laboratories and student communities
  select 'lab'::text as source_type, l.id::text as source_id, l.name as title, '/labs/' || l.slug as url,
         concat_ws(E'\n',
           (case when l.kind = 'community' then 'Student community: ' else 'Laboratory: ' end) || l.name,
           nullif(l.description, ''),
           case when cardinality(l.focus) > 0 then 'Focus: ' || array_to_string(l.focus, ', ') end,
           case when l.direction is not null then 'Direction: ' || l.direction end,
           case when cardinality(l.tags) > 0 then 'Research areas: ' || array_to_string(l.tags, ', ') end,
           case when cardinality(coalesce(l.skills, '{}')) > 0 then 'Skills: ' || array_to_string(l.skills, ', ') end,
           case when nullif(l.equipment, '') is not null then 'Equipment: ' || l.equipment end,
           case when nullif(l.location, '') is not null then 'Location: ' || l.location end,
           (select 'Heads: ' || string_agg(m.full_name, ', ' order by m.sort_order) from public.lab_members m
             where m.lab_id = l.id and m.role::text in ('lead', 'co_lead')),
           case when cardinality(l.ongoing_projects) > 0 then 'Ongoing projects: ' || array_to_string(l.ongoing_projects, '; ') end,
           case when cardinality(l.completed_projects) > 0 then 'Completed projects: ' || array_to_string(l.completed_projects, '; ') end,
           case when cardinality(l.awards) > 0 then 'Awards: ' || array_to_string(l.awards, '; ') end,
           case when cardinality(l.current_partners) > 0 then 'Partners: ' || array_to_string(l.current_partners, '; ') end,
           case when cardinality(coalesce(l.upcoming_activities, '{}')) > 0 then 'Upcoming: ' || array_to_string(l.upcoming_activities, '; ') end
         ) as content
    from public.labs l
  union all
  -- researchers (Scopus): no e-mail
  select 'researcher', p.id::text, p.full_name, '/research/' || p.username,
         concat_ws(E'\n',
           'Researcher: ' || p.full_name,
           nullif(concat_ws(', ', p.job_title, p.degree), ''),
           format('Scopus: %s works, %s citations, h-index %s', p.total_works, p.total_citations, p.h_index),
           case when cardinality(p.keywords) > 0 then 'Keywords: ' || array_to_string(p.keywords, ', ') end,
           (select 'Research topics: ' || string_agg(t->>'topic_name', '; ') from jsonb_array_elements(p.topics) t),
           (select 'Recent papers: ' || string_agg(x.title, '; ') from (
              select pb.title from public.publication_authors pa join public.publications pb on pb.id = pa.publication_id
               where pa.professor_id = p.id order by pb.year desc nulls last limit 8) x)
         )
    from public.professors p
  union all
  -- publications
  select 'publication', pb.id::text, pb.title,
         '/research?tab=search&q=' || left(regexp_replace(pb.title, '[^A-Za-z0-9 ]', ' ', 'g'), 80),
         concat_ws(E'\n',
           'Paper: ' || pb.title,
           nullif(concat_ws(', ', pb.venue, pb.year::text, pb.type), ''),
           (select 'Authors (SDU): ' || string_agg(pr.full_name, ', ') from public.publication_authors pa
              join public.professors pr on pr.id = pa.professor_id where pa.publication_id = pb.id),
           case when cardinality(pb.keywords) > 0 then 'Keywords: ' || array_to_string(pb.keywords, ', ') end,
           format('Citations: %s%s', pb.citations, case when pb.is_open_access then ', open access' else '' end)
         )
    from public.publications pb
  union all
  -- projects (published only)
  select 'project', pr.id::text, pr.title, '/labs?tab=projects',
         concat_ws(E'\n',
           initcap(pr.kind::text) || ': ' || pr.title,
           nullif(pr.summary, ''),
           (select 'Lab: ' || l.name from public.labs l where l.id = coalesce(pr.lab_id, pr.related_lab_id)),
           case when cardinality(pr.authors) > 0 then 'Team: ' || array_to_string(pr.authors, ', ') end,
           case when cardinality(pr.tags) > 0 then 'Tags: ' || array_to_string(pr.tags, ', ') end,
           'Status: ' || pr.status::text || coalesce(', ' || pr.year::text, '')
         )
    from public.projects pr where pr.moderation = 'approved'
  union all
  -- SDU events (published)
  select 'event', e.id::text, e.title, '/events/' || e.id,
         concat_ws(E'\n',
           (case when e.kind::text = 'industrial' then 'Industry event: ' else 'Research event: ' end) || e.title,
           'When: ' || to_char(e.starts_at at time zone 'Asia/Almaty', 'DD Mon YYYY HH24:MI') || ' (Almaty), room ' || e.room,
           case when e.speaker is not null then 'Speaker: ' || e.speaker || coalesce(', ' || e.speaker_role, '') end,
           nullif(e.description, ''),
           (select 'Hosted by: ' || string_agg(coalesce(l.name, c.name), ', ') from public.event_hosts h
              left join public.labs l on l.id = h.lab_id left join public.companies c on c.id = h.company_id where h.event_id = e.id)
         )
    from public.events e where e.is_published
  union all
  -- competitions, hackathons, conferences outside SITAM
  select 'external_event', x.id::text, x.title, '/events',
         concat_ws(E'\n',
           initcap(x.kind::text) || ': ' || x.title,
           case when x.organizer is not null then 'Organizer: ' || x.organizer end,
           case when x.starts_on is not null then 'Dates: ' || x.starts_on::text || coalesce(' – ' || x.ends_on::text, '') else 'Year: ' || x.year::text end,
           case when x.location is not null then 'Where: ' || x.location end,
           nullif(x.description, ''),
           (select 'SITAM labs taking part: ' || string_agg(l.name || coalesce(' (' || el.result || ')', ''), '; ')
              from public.external_event_labs el join public.labs l on l.id = el.lab_id where el.event_id = x.id)
         )
    from public.external_events x
  union all
  -- open vacancies, internships and cases
  select 'opportunity', o.id::text, o.title, '/opportunities?open=' || o.id,
         concat_ws(E'\n',
           initcap(o.category::text) || coalesce(' ' || o.industrial_type::text, '') || ' case: ' || o.title,
           o.description,
           case when cardinality(o.requirements) > 0 then 'Requirements: ' || array_to_string(o.requirements, '; ') end,
           case when cardinality(o.tags) > 0 then 'Tags: ' || array_to_string(o.tags, ', ') end,
           case when o.deadline is not null then 'Deadline: ' || o.deadline::text end,
           nullif(concat_ws(', ', o.duration, o.work_format, case when o.paid then 'paid' end, o.compensation), '')
         )
    from public.opportunities o where o.is_active and (o.deadline is null or o.deadline >= current_date)
  union all
  -- industry partners
  select 'partner', ip.id::text, ip.name, '/opportunities?view=partners',
         concat_ws(E'\n',
           'Industry partner: ' || ip.name || coalesce(' (' || ip.short_name || ')', ''),
           case when ip.ceo is not null then 'CEO / Head: ' || ip.ceo end,
           case when ip.founded_year is not null then 'Founded: ' || ip.founded_year end,
           case when cardinality(ip.upcoming_projects) > 0 then 'Upcoming projects: ' || array_to_string(ip.upcoming_projects, '; ') end,
           case when cardinality(ip.completed_projects) > 0 then 'Completed projects: ' || array_to_string(ip.completed_projects, '; ') end
         )
    from public.industry_partners ip
  union all
  select 'faq', f.id::text, f.question, '/faq', 'FAQ — ' || f.question || E'\n' || f.answer
    from public.ai_faq f;
revoke all on public.ai_sources from anon, authenticated, public;

/* ───────────── indexing helpers (Edge Function "ai-index", service role) ───────────── */
create or replace function public.ai_pending_documents(p_limit int default 50)
returns table (source_type text, source_id text, title text, url text, content text, content_hash text)
language sql stable security definer set search_path = public, extensions as $$
  select s.source_type, s.source_id, s.title, s.url, left(s.content, 4000), md5(s.title || s.url || s.content)
    from public.ai_sources s
    left join public.ai_documents d on d.source_type = s.source_type and d.source_id = s.source_id
   where d.id is null or d.content_hash <> md5(s.title || s.url || s.content) or d.embedding is null
   limit greatest(1, least(p_limit, 200))
$$;

create or replace function public.ai_upsert_document(p_source_type text, p_source_id text, p_title text, p_url text,
                                                     p_content text, p_hash text, p_embedding extensions.vector(384))
returns void language sql security definer set search_path = public, extensions as $$
  insert into public.ai_documents (source_type, source_id, title, url, content, content_hash, embedding, updated_at)
  values (p_source_type, p_source_id, p_title, p_url, p_content, p_hash, p_embedding, now())
  on conflict (source_type, source_id) do update
    set title = excluded.title, url = excluded.url, content = excluded.content, content_hash = excluded.content_hash,
        embedding = excluded.embedding, updated_at = now()
$$;

-- items that were deleted or became private (e.g. a closed vacancy) leave the index
create or replace function public.ai_remove_stale()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.ai_documents d
   where not exists (select 1 from public.ai_sources s where s.source_type = d.source_type and s.source_id = d.source_id);
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.ai_index_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'indexed', (select count(*) from public.ai_documents where embedding is not null),
    'pending', (select count(*) from public.ai_pending_documents(200)),
    'last_update', (select max(updated_at) from public.ai_documents))
$$;

/* ───────────── vector search ───────────── */
create or replace function public.match_documents(query_embedding extensions.vector(384), match_count int default 8,
                                                  min_similarity float default 0.2, filter_types text[] default null)
returns table (id bigint, source_type text, source_id text, title text, url text, content text, similarity float)
language sql stable security definer set search_path = public, extensions as $$
  select d.id, d.source_type, d.source_id, d.title, d.url, d.content, 1 - (d.embedding <=> query_embedding) as similarity
    from public.ai_documents d
   where d.embedding is not null
     and (filter_types is null or cardinality(filter_types) = 0 or d.source_type = any(filter_types))
     and 1 - (d.embedding <=> query_embedding) >= min_similarity
   order by d.embedding <=> query_embedding
   limit greatest(1, least(match_count, 20))
$$;

/* ───────────── daily limit of questions ───────────── */
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  questions int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
drop policy if exists "Own AI usage" on public.ai_usage;
create policy "Own AI usage" on public.ai_usage for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

-- +1 question for this person today; false when the daily limit is reached
create or replace function public.ai_take_quota(p_user uuid, p_limit int default 30)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.ai_usage (user_id, day, questions) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set questions = public.ai_usage.questions + 1
  returning questions into n;
  return n <= p_limit;
end;
$$;

/* only the server (service role key inside the Edge Functions) runs these */
revoke execute on function public.ai_pending_documents(int) from anon, authenticated, public;
revoke execute on function public.ai_upsert_document(text, text, text, text, text, text, extensions.vector) from anon, authenticated, public;
revoke execute on function public.ai_remove_stale() from anon, authenticated, public;
revoke execute on function public.ai_take_quota(uuid, int) from anon, authenticated, public;
revoke execute on function public.match_documents(extensions.vector, int, float, text[]) from anon, public;
grant execute on function public.match_documents(extensions.vector, int, float, text[]) to authenticated;
grant execute on function public.ai_index_status() to authenticated;
grant execute on function public.ai_pending_documents(int), public.ai_upsert_document(text, text, text, text, text, text, extensions.vector),
  public.ai_remove_stale(), public.ai_take_quota(uuid, int), public.match_documents(extensions.vector, int, float, text[]), public.ai_index_status() to service_role;

insert into sitam_meta.applied_migrations (version, name) values ('20261030100000', 'sitam_v16_ask_sitam') on conflict do nothing;

-- ════════ 20261030120000_sitam_v16_1_ask_scope ════════
/* SITAM SPACE v16.1 — Ask SITAM: search only the kind of page the person asks about
   ("which lab…" → labs only, "who can supervise…" → researchers, …). match_documents gets filter_types.
   Re-runnable. */

drop function if exists public.match_documents(extensions.vector, int, float);
create or replace function public.match_documents(query_embedding extensions.vector(384), match_count int default 8,
                                                  min_similarity float default 0.2, filter_types text[] default null)
returns table (id bigint, source_type text, source_id text, title text, url text, content text, similarity float)
language sql stable security definer set search_path = public, extensions as $$
  select d.id, d.source_type, d.source_id, d.title, d.url, d.content, 1 - (d.embedding <=> query_embedding) as similarity
    from public.ai_documents d
   where d.embedding is not null
     and (filter_types is null or cardinality(filter_types) = 0 or d.source_type = any(filter_types))
     and 1 - (d.embedding <=> query_embedding) >= min_similarity
   order by d.embedding <=> query_embedding
   limit greatest(1, least(match_count, 20))
$$;
revoke execute on function public.match_documents(extensions.vector, int, float, text[]) from anon, public;
grant execute on function public.match_documents(extensions.vector, int, float, text[]) to authenticated, service_role;

insert into sitam_meta.applied_migrations (version, name) values ('20261030120000', 'sitam_v16_1_ask_scope') on conflict do nothing;

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
revoke insert, update, delete on public.ai_documents from anon, authenticated;
grant select on public.ai_documents to anon, authenticated;
grant select on public.ai_faq to anon, authenticated;
revoke insert, update, delete on public.ai_faq from anon, authenticated;
revoke all on public.ai_sources from anon, authenticated, public;
revoke insert, update, delete on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
revoke execute on function public.ai_pending_documents(int) from anon, authenticated, public;
revoke execute on function public.ai_upsert_document(text, text, text, text, text, text, extensions.vector) from anon, authenticated, public;
revoke execute on function public.ai_remove_stale() from anon, authenticated, public;
revoke execute on function public.ai_take_quota(uuid, int) from anon, authenticated, public;
revoke execute on function public.match_documents(extensions.vector, int, float, text[]) from anon, public;
grant execute on function public.match_documents(extensions.vector, int, float, text[]) to authenticated;
grant execute on function public.ai_index_status() to authenticated;
grant execute on function public.ai_pending_documents(int), public.ai_upsert_document(text, text, text, text, text, text, extensions.vector), public.ai_remove_stale(), public.ai_take_quota(uuid, int), public.match_documents(extensions.vector, int, float, text[]), public.ai_index_status() to service_role;
revoke execute on function public.match_documents(extensions.vector, int, float, text[]) from anon, public;
grant execute on function public.match_documents(extensions.vector, int, float, text[]) to authenticated, service_role;
-- v17: account safety (guarded: this file may run before v17 exists)
do $$ begin
  if to_regprocedure('public.ai_refund_quota(uuid)') is not null then
    revoke execute on function public.ai_refund_quota(uuid) from anon, authenticated, public;
    grant execute on function public.ai_refund_quota(uuid) to service_role;
  end if;
  if to_regclass('public.account_claims') is not null then
    revoke insert, update, delete on public.account_claims from anon, authenticated;
  end if;
  if to_regprocedure('public.decide_account_claim(uuid, boolean)') is not null then
    revoke execute on function public.account_claims_inbox(), public.decide_account_claim(uuid, boolean),
      public.company_join_requests(), public.decide_company_member(uuid, uuid, boolean) from anon, public;
  end if;
end $$;
revoke insert, update, delete on public.company_members from anon, authenticated;
