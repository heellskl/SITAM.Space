-- SITAM SPACE — baseline schema (v2).
--
-- Replaces the earlier prototype tables in the Lovable database
-- (applications, event_registrations, profiles, saved_labs, user_roles) — they
-- were empty apart from three test accounts, which are back-filled below.
--
-- Model in one picture
--   profiles ─┬─ lab_members ── labs ── lab_internal (private form answers)
--             ├─ company_members ── companies (partner sign-up, admin-verified)
--             ├─ applications ──> opportunities ── opportunity_hosts ──> labs | companies | projects
--             ├─ event_registrations ──> events ── event_hosts ──> labs | companies | projects
--             └─ saved_labs
--   projects ──> labs (lab projects only: research / startup, ongoing / completed)
--   professors ── publication_authors ── publications (Scopus export)
--   partner_requests (public B2B form)
--
-- Rules
--   • Roles are additive: base role in profiles.role; lab head / company powers come from memberships.
--   • Students & professors sign up with @sdu.edu.kz (incl. sub-domains). Partners may use any e-mail,
--     but their company must be verified by an admin before they can publish opportunities.
--   • Writes with business rules go through SECURITY DEFINER functions.

/* ═════════════════════════════ 0. remove prototype objects ═════════════════════════════ */

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.has_role(uuid, public.app_role) cascade;
drop table if exists public.applications cascade;
drop table if exists public.event_registrations cascade;
drop table if exists public.saved_labs cascade;
drop table if exists public.user_roles cascade;
drop table if exists public.profiles cascade;
drop type if exists public.app_role cascade;
drop policy if exists "own cv read" on storage.objects;
drop policy if exists "own cv insert" on storage.objects;
drop policy if exists "own cv update" on storage.objects;
drop policy if exists "own cv delete" on storage.objects;

/* ═════════════════════════════ 1. helpers & types ═════════════════════════════ */

create or replace function public.is_sdu_email(p_email text)
returns boolean language sql immutable as $$
  select coalesce(lower(trim(p_email)) ~ '^[^@\s]+@([a-z0-9-]+\.)*sdu\.edu\.kz$', false)
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

create type public.app_role as enum ('student', 'teacher', 'partner', 'admin');
create type public.lab_role as enum ('lead', 'co_lead', 'student_lead', 'deputy_student_lead', 'member', 'research_assistant', 'former_lead');
create type public.project_kind as enum ('research', 'startup');
create type public.project_status as enum ('ongoing', 'completed');
create type public.opportunity_category as enum ('industrial', 'lab', 'research');
create type public.industrial_type as enum ('vacancy', 'internship', 'project');
create type public.application_status as enum ('submitted', 'in_review', 'shortlisted', 'accepted', 'rejected', 'withdrawn');
create type public.event_kind as enum ('research', 'industrial');
create type public.registration_status as enum ('registered', 'checked_in', 'cancelled');
create type public.partner_request_type as enum ('rnd', 'mvp', 'hiring', 'sponsorship');

/* ═════════════════════════════ 2. people & organisations ═════════════════════════════ */

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'student',
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  course smallint check (course between 1 and 6),
  major text check (char_length(major) <= 100),
  department text check (char_length(department) <= 100),
  position text check (char_length(position) <= 100),         -- partner's job title
  staff_verified boolean not null default false,              -- professors: verified by admin
  cv_path text,
  cv_filename text check (char_length(cv_filename) <= 160),
  cv_uploaded_at timestamptz,
  bio text check (char_length(bio) <= 1000),
  links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  website text check (website is null or website ~* '^https?://'),
  description text check (char_length(description) <= 2000),
  logo_url text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index companies_name_ci on public.companies (lower(name));

create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

/* ═════════════════════════════ 3. labs (fields = lab-head form / labs.json) ═════════════════════════════ */

create table public.labs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  name text not null check (char_length(name) between 2 and 120),
  year_founded int check (year_founded between 1990 and 2100),
  founders text[] not null default '{}',
  description text not null default '' check (char_length(description) <= 5000),
  focus text[] not null default '{}',                      -- Research / Academic / Education / Industry & Commercial Projects / other
  logo_url text,
  website text check (website is null or website ~* '^https?://'),
  social_links jsonb not null default '[]'::jsonb,         -- [{platform, url}]
  location text not null default '' check (char_length(location) <= 120),
  equipment text check (char_length(equipment) <= 4000),
  tags text[] not null default '{}',
  completed_projects text[] not null default '{}',         -- free-text answers; structured rows live in projects
  ongoing_projects text[] not null default '{}',
  organized_events text[] not null default '{}',
  seminars text[] not null default '{}',
  courses text[] not null default '{}',
  external_events text[] not null default '{}',
  notable_alumni text[] not null default '{}',
  alumni_contributors text[] not null default '{}',
  current_partners text[] not null default '{}',
  prospective_partners text[] not null default '{}',
  grants text[] not null default '{}',
  awards text[] not null default '{}',
  orgs_kz text[] not null default '{}',
  orgs_global text[] not null default '{}',
  events_kz text[] not null default '{}',
  events_global text[] not null default '{}',
  photo_urls text[] not null default '{}',
  photo_archive_link text check (photo_archive_link is null or photo_archive_link ~* '^https?://'),
  visitor_walkthrough text check (char_length(visitor_walkthrough) <= 5000),
  live_demo text check (char_length(live_demo) <= 5000),
  demo_stand text check (char_length(demo_stand) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create trigger labs_touch before update on public.labs for each row execute function public.touch_updated_at();

-- Private form answers: never on the public page.
create table public.lab_internal (
  lab_id uuid primary key references public.labs(id) on delete cascade,
  presenters text[] not null default '{}',                -- names + languages + contacts
  goals text[] not null default '{}',
  required_support text[] not null default '{}',
  resource_gaps text[] not null default '{}',
  subscriptions text check (char_length(subscriptions) <= 4000),
  action_plan_link text check (action_plan_link is null or action_plan_link ~* '^https?://'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create trigger lab_internal_touch before update on public.lab_internal for each row execute function public.touch_updated_at();

create table public.lab_members (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 120),
  title text check (char_length(title) <= 200),
  role public.lab_role not null default 'member',
  term text check (char_length(term) <= 40),
  can_edit boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index lab_members_lab_idx on public.lab_members(lab_id);
create index lab_members_user_idx on public.lab_members(user_id);
create unique index lab_members_user_once on public.lab_members(lab_id, user_id) where user_id is not null;

create table public.lab_member_contacts (
  member_id uuid primary key references public.lab_members(id) on delete cascade,
  email text check (email is null or email = lower(email)),
  contact text check (char_length(contact) <= 200)
);
create index lab_member_contacts_email_idx on public.lab_member_contacts(email);

create table public.saved_labs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lab_id uuid not null references public.labs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, lab_id)
);

/* ═════════════════════════════ 4. lab projects ═════════════════════════════ */

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  kind public.project_kind not null default 'research',
  status public.project_status not null default 'ongoing',
  title text not null check (char_length(title) between 2 and 200),
  summary text check (char_length(summary) <= 2000),
  tags text[] not null default '{}',
  authors text[] not null default '{}',
  year int check (year between 1990 and 2100),
  github_url text check (github_url is null or github_url ~* '^https://'),
  demo_url text check (demo_url is null or demo_url ~* '^https://'),   -- the lab decides whether to share a demo
  paper_url text check (paper_url is null or paper_url ~* '^https://'),
  sort_order int not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_lab_idx on public.projects(lab_id);
create unique index projects_lab_title on public.projects(lab_id, lower(title));
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();

/* ═════════════════════════════ 5. opportunities & applications ═════════════════════════════ */

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  category public.opportunity_category not null,
  industrial_type public.industrial_type,
  title text not null check (char_length(title) between 3 and 160),
  description text not null check (char_length(description) between 10 and 4000),
  requirements text[] not null default '{}',
  tags text[] not null default '{}',
  deadline date,
  duration text check (char_length(duration) <= 60),
  paid boolean not null default false,
  compensation text check (char_length(compensation) <= 120),
  work_format text check (work_format in ('onsite', 'hybrid', 'remote')),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint industrial_needs_type check ((category = 'industrial') = (industrial_type is not null))
);
create trigger opportunities_touch before update on public.opportunities for each row execute function public.touch_updated_at();

-- Who offers it. One row per host; an opportunity can have several
-- (e.g. a company case run together with a lab).
create table public.opportunity_hosts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  lab_id uuid references public.labs(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  constraint one_host_per_row check (num_nonnulls(lab_id, company_id, project_id) = 1)
);
create index opportunity_hosts_opp_idx on public.opportunity_hosts(opportunity_id);
create unique index opportunity_hosts_unique on public.opportunity_hosts(opportunity_id, coalesce(lab_id, company_id, project_id));

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  note text not null check (char_length(note) between 20 and 2000),
  cv_path text not null,                          -- profile CV by default, or a CV uploaded for this application
  status public.application_status not null default 'submitted',
  reviewer_note text check (char_length(reviewer_note) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index applications_applicant_idx on public.applications(applicant_id);
create index applications_opp_idx on public.applications(opportunity_id);
create unique index applications_once on public.applications(applicant_id, opportunity_id) where status <> 'withdrawn';
create trigger applications_touch before update on public.applications for each row execute function public.touch_updated_at();

/* ═════════════════════════════ 6. events ═════════════════════════════ */

create table public.events (
  id uuid primary key default gen_random_uuid(),
  kind public.event_kind not null,
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '' check (char_length(description) <= 3000),
  starts_at timestamptz not null,
  room text not null default 'C1.2',
  speaker text check (char_length(speaker) <= 120),
  speaker_role text check (char_length(speaker_role) <= 160),
  tags text[] not null default '{}',
  capacity int not null default 60 check (capacity between 1 and 2000),
  organizer_id uuid references public.profiles(id) on delete set null default auth.uid(),
  reported_attendance int check (reported_attendance >= 0),
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
create index events_starts_idx on public.events(starts_at);

-- Everyone who runs the event: a lab introducing a company, a lab's project day, etc.
create table public.event_hosts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  lab_id uuid references public.labs(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  constraint one_host_per_row check (num_nonnulls(lab_id, company_id, project_id) = 1)
);
create index event_hosts_event_idx on public.event_hosts(event_id);
create unique index event_hosts_unique on public.event_hosts(event_id, coalesce(lab_id, company_id, project_id));

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticket_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  status public.registration_status not null default 'registered',
  registered_at timestamptz not null default now(),
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles(id) on delete set null,
  unique (event_id, user_id)
);
create index event_registrations_user_idx on public.event_registrations(user_id);

/* ═════════════════════════════ 7. research publications ═════════════════════════════ */

create table public.professors (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username ~ '^[a-z0-9._-]{2,80}$'),
  first_name text not null default '',
  last_name text not null default '',
  full_name text not null,
  job_title text,
  degree text,
  email text,                                        -- not exposed publicly (column grant below)
  photo_url text,
  orcid_url text,
  scopus_id text,
  scholar_url text,
  h_index int not null default 0,
  i10_index int not null default 0,
  total_citations int not null default 0,
  total_works int not null default 0,
  keywords text[] not null default '{}',
  topics jsonb not null default '[]'::jsonb,         -- [{topic_name, subfield, field, domain, works_count}]
  profile_id uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  year int check (year between 1950 and 2100),
  type text,
  doi text,
  venue text,
  publisher text,
  citations int not null default 0 check (citations >= 0),
  is_open_access boolean not null default false,
  url text,
  scopus_eid text unique,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now()
);
create unique index publications_doi on public.publications(lower(doi)) where doi is not null;

create table public.publication_authors (
  publication_id uuid not null references public.publications(id) on delete cascade,
  professor_id uuid not null references public.professors(id) on delete cascade,
  primary key (publication_id, professor_id)
);
create index publication_authors_prof_idx on public.publication_authors(professor_id);

/* ═════════════════════════════ 8. B2B requests ═════════════════════════════ */

create table public.partner_requests (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  company_name text not null check (char_length(company_name) between 2 and 120),
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  contact_email text not null check (contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  request_type public.partner_request_type not null,
  has_budget boolean not null,
  budget_range text check (char_length(budget_range) <= 60),
  tech_stack text not null check (char_length(tech_stack) between 2 and 200),
  description text not null check (char_length(description) between 20 and 2000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'matched', 'closed')),
  assigned_lab_id uuid references public.labs(id) on delete set null,
  internal_note text check (char_length(internal_note) <= 2000),
  created_at timestamptz not null default now()
);

/* ═════════════════════════════ 9. permission functions ═════════════════════════════ */

create or replace function public.my_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' or (role = 'teacher' and staff_verified) from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_lab_manager(p_lab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.lab_members m where m.lab_id = p_lab and m.user_id = auth.uid() and m.can_edit
  )
$$;

create or replace function public.is_lab_manager_path(p_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_folder ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.is_lab_manager(p_folder::uuid) else false end
$$;

-- Company members can act for the company only after an admin verified it.
create or replace function public.is_company_member(p_company uuid, p_require_verified boolean default true)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.company_members c join public.companies co on co.id = c.company_id
    where c.company_id = p_company and c.user_id = auth.uid() and (co.verified or not p_require_verified)
  )
$$;

create or replace function public.is_project_manager(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.projects p where p.id = p_project and public.is_lab_manager(p.lab_id))
$$;

-- "Can act as this host": lab manager / verified company member / manager of the project's lab.
create or replace function public.can_act_as_host(p_lab uuid, p_company uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_lab is not null and public.is_lab_manager(p_lab))
      or (p_company is not null and public.is_company_member(p_company))
      or (p_project is not null and public.is_project_manager(p_project))
$$;

create or replace function public.can_manage_opportunity(p_opp uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.opportunities o where o.id = p_opp and o.created_by = auth.uid())
      or exists (select 1 from public.opportunity_hosts h where h.opportunity_id = p_opp
                 and public.can_act_as_host(h.lab_id, h.company_id, h.project_id))
$$;

create or replace function public.can_manage_event(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff()
      or exists (select 1 from public.events e where e.id = p_event and e.organizer_id = auth.uid())
      or exists (select 1 from public.event_hosts h where h.event_id = p_event
                 and public.can_act_as_host(h.lab_id, h.company_id, h.project_id))
$$;

create or replace function public.can_review_application(p_app uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.applications a where a.id = p_app and public.can_manage_opportunity(a.opportunity_id))
$$;

-- A reviewer may open exactly the CV file attached to a live application they review.
create or replace function public.can_view_cv(p_object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.applications a
    where a.cv_path = p_object_name and a.status <> 'withdrawn' and public.can_review_application(a.id)
  )
$$;

/* ═════════════════════════════ 10. sign-up gate & profile creation ═════════════════════════════ */

create or replace function public.enforce_signup_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role text := coalesce(new.raw_user_meta_data->>'role', 'student');
begin
  if tg_op = 'UPDATE' then
    -- an existing SDU account may not move to a non-SDU address
    if public.is_sdu_email(old.email) and not public.is_sdu_email(new.email) then
      raise exception 'SITAM_EMAIL_DOMAIN: SDU accounts must keep an @sdu.edu.kz e-mail' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if v_role = 'partner' or public.is_sdu_email(new.email) then
    return new;
  end if;
  raise exception 'SITAM_EMAIL_DOMAIN: students and professors must register with an @sdu.edu.kz e-mail'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists enforce_signup_email on auth.users;
create trigger enforce_signup_email
  before insert or update of email on auth.users
  for each row execute function public.enforce_signup_email();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role public.app_role;
  v_company uuid;
  v_company_name text := nullif(trim(left(coalesce(v_meta->>'company', ''), 120)), '');
begin
  v_role := case
    when v_meta->>'role' = 'partner' then 'partner'::public.app_role
    when v_meta->>'role' = 'teacher' and public.is_sdu_email(new.email) then 'teacher'::public.app_role
    else 'student'::public.app_role
  end;

  insert into public.profiles (id, role, first_name, last_name, email, course, major, department, position)
  values (
    new.id, v_role,
    left(coalesce(v_meta->>'first_name', ''), 100),
    left(coalesce(v_meta->>'last_name', ''), 100),
    lower(coalesce(new.email, '')),
    case when v_role = 'student' and v_meta->>'course' ~ '^[1-6]$' then (v_meta->>'course')::smallint end,
    case when v_role = 'student' then left(v_meta->>'major', 100) end,
    case when v_role = 'teacher' then left(v_meta->>'department', 100) end,
    case when v_role = 'partner' then left(v_meta->>'position', 100) end
  )
  on conflict (id) do nothing;

  -- Partner: join the company with that name, or create it (unverified until an admin approves).
  if v_role = 'partner' and v_company_name is not null then
    select id into v_company from public.companies where lower(name) = lower(v_company_name);
    if v_company is null then
      insert into public.companies (name, website)
      values (v_company_name, case when v_meta->>'website' ~* '^https?://' then left(v_meta->>'website', 200) end)
      returning id into v_company;
    end if;
    insert into public.company_members (company_id, user_id, role)
    values (v_company, new.id, case when exists (select 1 from public.company_members where company_id = v_company) then 'member' else 'owner' end)
    on conflict do nothing;
  end if;

  -- People listed in a lab form by e-mail become lab members (heads get edit rights).
  update public.lab_members m set user_id = new.id
    from public.lab_member_contacts c
   where c.member_id = m.id and c.email = lower(new.email) and m.user_id is null;

  -- Professors with a research profile get linked to it.
  update public.professors set profile_id = new.id where lower(email) = lower(new.email) and profile_id is null;

  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.lab_members_defaults()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.role in ('lead', 'co_lead', 'student_lead', 'deputy_student_lead') then new.can_edit := true; end if;
  if new.role = 'former_lead' then new.can_edit := false; end if;
  return new;
end;
$$;
create trigger lab_members_defaults before insert or update on public.lab_members
  for each row execute function public.lab_members_defaults();

create or replace function public.lab_member_contacts_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null then
    update public.lab_members m set user_id = p.id
      from public.profiles p
     where m.id = new.member_id and m.user_id is null and p.email = new.email;
  end if;
  return new;
end;
$$;
create trigger lab_member_contacts_link after insert or update of email on public.lab_member_contacts
  for each row execute function public.lab_member_contacts_link();

/* ═════════════════════════════ 11. CV bookkeeping ═════════════════════════════ */

create or replace function public.sync_cv_from_storage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.bucket_id = 'cvs' and old.name ~ '^[0-9a-f-]{36}/cv\.pdf$' then
      update public.profiles set cv_path = null, cv_uploaded_at = null where id::text = split_part(old.name, '/', 1);
    end if;
    return old;
  end if;
  if new.bucket_id = 'cvs' and new.name ~ '^[0-9a-f-]{36}/cv\.pdf$' then
    update public.profiles set cv_path = new.name, cv_uploaded_at = now() where id::text = split_part(new.name, '/', 1);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_cv_from_storage on storage.objects;
create trigger sync_cv_from_storage after insert or update or delete on storage.objects
  for each row execute function public.sync_cv_from_storage();

/* ═════════════════════════════ 12. RPCs ═════════════════════════════ */

create or replace function public.my_context()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'is_staff', public.is_staff(),
    'is_admin', public.is_admin(),
    'managed_labs', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'slug', l.slug, 'name', l.name, 'role', m.role) order by l.name)
      from public.lab_members m join public.labs l on l.id = m.lab_id
      where m.user_id = auth.uid() and m.can_edit), '[]'::jsonb),
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'verified', c.verified) order by c.name)
      from public.company_members cm join public.companies c on c.id = cm.company_id
      where cm.user_id = auth.uid()), '[]'::jsonb),
    'professor', (select jsonb_build_object('username', username, 'full_name', full_name) from public.professors where profile_id = auth.uid() limit 1),
    'saved_labs', coalesce((select jsonb_agg(lab_id) from public.saved_labs where user_id = auth.uid()), '[]'::jsonb)
  )
$$;

-- p_cv_path: optional CV uploaded for this application (cvs/{uid}/apply-*.pdf); defaults to the profile CV.
create or replace function public.submit_application(p_opportunity uuid, p_note text, p_cv_path text default null)
returns public.applications language plpgsql security definer set search_path = public as $$
declare
  v_me public.profiles;
  v_opp public.opportunities;
  v_cv text;
  v_app public.applications;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  select * into v_me from public.profiles where id = auth.uid();
  if v_me.id is null then raise exception 'AUTH_REQUIRED: profile not found'; end if;
  -- Being a lab head never blocks applying: only the base role matters.
  if v_me.role <> 'student' then raise exception 'STUDENTS_ONLY: only student accounts can apply'; end if;

  select * into v_opp from public.opportunities where id = p_opportunity;
  if v_opp.id is null then raise exception 'NOT_FOUND: opportunity'; end if;
  if not v_opp.is_active or (v_opp.deadline is not null and v_opp.deadline < current_date) then
    raise exception 'CLOSED: applications are closed';
  end if;
  if exists (select 1 from public.opportunity_hosts h where h.opportunity_id = p_opportunity and h.lab_id is not null
             and exists (select 1 from public.lab_members m where m.lab_id = h.lab_id and m.user_id = auth.uid() and m.can_edit)) then
    raise exception 'OWN_LISTING: you manage the lab that posted this';
  end if;

  if p_cv_path is not null then
    if split_part(p_cv_path, '/', 1) <> auth.uid()::text
       or not exists (select 1 from storage.objects where bucket_id = 'cvs' and name = p_cv_path) then
      raise exception 'BAD_CV: upload the CV again';
    end if;
    v_cv := p_cv_path;
  else
    v_cv := v_me.cv_path;
  end if;
  if v_cv is null then raise exception 'CV_REQUIRED: upload your CV first'; end if;

  insert into public.applications (applicant_id, opportunity_id, note, cv_path)
  values (auth.uid(), p_opportunity, trim(p_note), v_cv)
  returning * into v_app;
  return v_app;
exception
  when unique_violation then raise exception 'DUPLICATE: you have already applied';
end;
$$;

create or replace function public.withdraw_application(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.applications set status = 'withdrawn'
   where id = p_id and applicant_id = auth.uid() and status in ('submitted', 'in_review', 'shortlisted');
  if not found then raise exception 'NOT_ALLOWED: cannot withdraw this application'; end if;
end;
$$;

create or replace function public.review_application(p_id uuid, p_status public.application_status, p_note text default null)
returns public.applications language plpgsql security definer set search_path = public as $$
declare v_app public.applications; v_name text;
begin
  if not public.can_review_application(p_id) then raise exception 'NOT_ALLOWED: you cannot review this application'; end if;
  if p_status in ('withdrawn', 'submitted') then raise exception 'BAD_STATUS'; end if;
  update public.applications
     set status = p_status, reviewer_note = coalesce(p_note, reviewer_note), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id and status <> 'withdrawn'
  returning * into v_app;
  if v_app.id is null then raise exception 'NOT_ALLOWED: application was withdrawn'; end if;

  -- Accepted on a lab case → becomes a research assistant of the hosting lab(s).
  if p_status = 'accepted' then
    select trim(first_name || ' ' || last_name) into v_name from public.profiles where id = v_app.applicant_id;
    insert into public.lab_members (lab_id, user_id, full_name, role)
    select h.lab_id, v_app.applicant_id, coalesce(nullif(v_name, ''), 'New member'), 'research_assistant'
      from public.opportunity_hosts h join public.opportunities o on o.id = h.opportunity_id
     where h.opportunity_id = v_app.opportunity_id and h.lab_id is not null and o.category in ('lab', 'research')
    on conflict do nothing;
  end if;
  return v_app;
end;
$$;

create or replace function public.application_inbox()
returns table (
  id uuid, status public.application_status, note text, reviewer_note text, created_at timestamptz, cv_path text,
  opportunity_id uuid, opportunity_title text, category public.opportunity_category, hosts text,
  applicant_id uuid, applicant_name text, applicant_email text, applicant_course smallint, applicant_major text
) language sql stable security definer set search_path = public as $$
  select a.id, a.status, a.note, a.reviewer_note, a.created_at, a.cv_path,
         o.id, o.title, o.category,
         (select string_agg(coalesce(l.name, c.name, pr.title), ' · ')
            from public.opportunity_hosts h
            left join public.labs l on l.id = h.lab_id
            left join public.companies c on c.id = h.company_id
            left join public.projects pr on pr.id = h.project_id
           where h.opportunity_id = o.id),
         p.id, trim(p.first_name || ' ' || p.last_name), p.email, p.course, p.major
    from public.applications a
    join public.opportunities o on o.id = a.opportunity_id
    join public.profiles p on p.id = a.applicant_id
   where a.status <> 'withdrawn' and public.can_manage_opportunity(o.id)
   order by a.created_at desc
$$;

-- Creates an opportunity and its hosts in one step; the caller must be able to act for every host.
create or replace function public.save_opportunity(
  p_id uuid, p_category public.opportunity_category, p_industrial_type public.industrial_type,
  p_title text, p_description text, p_requirements text[], p_tags text[], p_deadline date, p_duration text,
  p_paid boolean, p_compensation text, p_work_format text, p_is_active boolean,
  p_lab_ids uuid[], p_company_ids uuid[], p_project_ids uuid[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; x uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce(cardinality(p_lab_ids), 0) + coalesce(cardinality(p_company_ids), 0) + coalesce(cardinality(p_project_ids), 0) = 0 then
    raise exception 'NO_HOST: choose who offers this opportunity';
  end if;
  foreach x in array coalesce(p_lab_ids, '{}') loop
    if not public.is_lab_manager(x) then raise exception 'NOT_ALLOWED: you do not manage one of the labs'; end if;
  end loop;
  foreach x in array coalesce(p_company_ids, '{}') loop
    if not public.is_company_member(x) then raise exception 'NOT_ALLOWED: you are not a member of one of the companies, or it is not verified yet'; end if;
  end loop;
  foreach x in array coalesce(p_project_ids, '{}') loop
    if not public.is_project_manager(x) then raise exception 'NOT_ALLOWED: you do not manage one of the projects'; end if;
  end loop;
  if p_category = 'industrial' and coalesce(cardinality(p_company_ids), 0) = 0 and not public.is_admin() then
    raise exception 'BAD_HOST: industrial cases are posted by a company';
  end if;

  if p_id is null then
    insert into public.opportunities (category, industrial_type, title, description, requirements, tags, deadline, duration, paid, compensation, work_format, is_active)
    values (p_category, case when p_category = 'industrial' then p_industrial_type end, trim(p_title), trim(p_description),
            coalesce(p_requirements, '{}'), coalesce(p_tags, '{}'), p_deadline, p_duration, coalesce(p_paid, false), p_compensation, p_work_format, coalesce(p_is_active, true))
    returning id into v_id;
  else
    if not public.can_manage_opportunity(p_id) then raise exception 'NOT_ALLOWED'; end if;
    update public.opportunities set category = p_category, industrial_type = case when p_category = 'industrial' then p_industrial_type end,
      title = trim(p_title), description = trim(p_description), requirements = coalesce(p_requirements, '{}'), tags = coalesce(p_tags, '{}'),
      deadline = p_deadline, duration = p_duration, paid = coalesce(p_paid, false), compensation = p_compensation,
      work_format = p_work_format, is_active = coalesce(p_is_active, true)
    where id = p_id;
    delete from public.opportunity_hosts where opportunity_id = p_id;
    v_id := p_id;
  end if;

  insert into public.opportunity_hosts (opportunity_id, lab_id) select v_id, unnest(coalesce(p_lab_ids, '{}'));
  insert into public.opportunity_hosts (opportunity_id, company_id) select v_id, unnest(coalesce(p_company_ids, '{}'));
  insert into public.opportunity_hosts (opportunity_id, project_id) select v_id, unnest(coalesce(p_project_ids, '{}'));
  return v_id;
end;
$$;

create or replace function public.save_event(
  p_id uuid, p_kind public.event_kind, p_title text, p_description text, p_starts_at timestamptz, p_room text,
  p_speaker text, p_speaker_role text, p_capacity int, p_lab_ids uuid[], p_company_ids uuid[], p_project_ids uuid[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; x uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  foreach x in array coalesce(p_lab_ids, '{}') loop
    if not public.is_lab_manager(x) and not public.is_staff() then raise exception 'NOT_ALLOWED: you do not manage one of the labs'; end if;
  end loop;
  foreach x in array coalesce(p_company_ids, '{}') loop
    if not public.is_company_member(x) and not public.is_staff() then raise exception 'NOT_ALLOWED: you are not a member of one of the companies, or it is not verified yet'; end if;
  end loop;
  foreach x in array coalesce(p_project_ids, '{}') loop
    if not public.is_project_manager(x) and not public.is_staff() then raise exception 'NOT_ALLOWED: you do not manage one of the projects'; end if;
  end loop;
  if not public.is_staff() and coalesce(cardinality(p_lab_ids), 0) + coalesce(cardinality(p_company_ids), 0) + coalesce(cardinality(p_project_ids), 0) = 0 then
    raise exception 'NO_HOST: choose who hosts the event';
  end if;

  if p_id is null then
    insert into public.events (kind, title, description, starts_at, room, speaker, speaker_role, capacity)
    values (p_kind, trim(p_title), coalesce(p_description, ''), p_starts_at, coalesce(nullif(trim(p_room), ''), 'C1.2'), p_speaker, p_speaker_role, coalesce(p_capacity, 60))
    returning id into v_id;
  else
    if not public.can_manage_event(p_id) then raise exception 'NOT_ALLOWED'; end if;
    update public.events set kind = p_kind, title = trim(p_title), description = coalesce(p_description, ''), starts_at = p_starts_at,
      room = coalesce(nullif(trim(p_room), ''), 'C1.2'), speaker = p_speaker, speaker_role = p_speaker_role, capacity = coalesce(p_capacity, 60)
    where id = p_id;
    delete from public.event_hosts where event_id = p_id;
    v_id := p_id;
  end if;
  insert into public.event_hosts (event_id, lab_id) select v_id, unnest(coalesce(p_lab_ids, '{}'));
  insert into public.event_hosts (event_id, company_id) select v_id, unnest(coalesce(p_company_ids, '{}'));
  insert into public.event_hosts (event_id, project_id) select v_id, unnest(coalesce(p_project_ids, '{}'));
  return v_id;
end;
$$;

create or replace function public.register_for_event(p_event uuid)
returns public.event_registrations language plpgsql security definer set search_path = public as $$
declare v_event public.events; v_reg public.event_registrations; v_taken int;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in to get a ticket'; end if;
  select * into v_event from public.events where id = p_event and is_published for update;
  if v_event.id is null then raise exception 'NOT_FOUND: event'; end if;
  if v_event.starts_at < now() - interval '1 hour' then raise exception 'CLOSED: this event is over'; end if;
  select * into v_reg from public.event_registrations where event_id = p_event and user_id = auth.uid();
  if v_reg.id is not null and v_reg.status <> 'cancelled' then return v_reg; end if;
  select count(*) into v_taken from public.event_registrations where event_id = p_event and status <> 'cancelled';
  if v_taken >= v_event.capacity then raise exception 'FULL: no seats left'; end if;
  if v_reg.id is not null then
    update public.event_registrations set status = 'registered', registered_at = now() where id = v_reg.id returning * into v_reg;
  else
    insert into public.event_registrations (event_id, user_id) values (p_event, auth.uid()) returning * into v_reg;
  end if;
  return v_reg;
end;
$$;

create or replace function public.cancel_registration(p_event uuid)
returns void language sql security definer set search_path = public as $$
  update public.event_registrations set status = 'cancelled' where event_id = p_event and user_id = auth.uid() and status = 'registered'
$$;

create or replace function public.check_in(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_reg public.event_registrations; v_was public.registration_status; v_name text; v_title text;
begin
  select * into v_reg from public.event_registrations where ticket_code = upper(trim(p_code)) for update;
  if v_reg.id is null then raise exception 'NOT_FOUND: unknown ticket'; end if;
  if not public.can_manage_event(v_reg.event_id) then raise exception 'NOT_ALLOWED: only organizers can check in'; end if;
  if v_reg.status = 'cancelled' then raise exception 'CANCELLED: this ticket was cancelled'; end if;
  v_was := v_reg.status;
  if v_reg.status = 'registered' then
    update public.event_registrations set status = 'checked_in', checked_in_at = now(), checked_in_by = auth.uid()
     where id = v_reg.id returning * into v_reg;
  end if;
  select trim(first_name || ' ' || last_name) into v_name from public.profiles where id = v_reg.user_id;
  select title into v_title from public.events where id = v_reg.event_id;
  return jsonb_build_object('name', v_name, 'event', v_title, 'event_id', v_reg.event_id,
                            'already', v_was = 'checked_in', 'checked_in_at', v_reg.checked_in_at);
end;
$$;

create or replace function public.event_attendees(p_event uuid)
returns table (registration_id uuid, name text, email text, role public.app_role, course smallint, major text,
               ticket_code text, status public.registration_status, registered_at timestamptz, checked_in_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_manage_event(p_event) then raise exception 'NOT_ALLOWED: organizers only'; end if;
  return query
    select r.id, trim(p.first_name || ' ' || p.last_name), p.email, p.role, p.course, p.major,
           r.ticket_code, r.status, r.registered_at, r.checked_in_at
      from public.event_registrations r join public.profiles p on p.id = r.user_id
     where r.event_id = p_event order by r.status, p.last_name, p.first_name;
end;
$$;

create or replace function public.verify_staff(p_user uuid, p_verified boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED: admins only'; end if;
  update public.profiles set staff_verified = p_verified where id = p_user and role = 'teacher';
  if not found then raise exception 'NOT_FOUND: no such professor account'; end if;
end;
$$;

create or replace function public.verify_company(p_company uuid, p_verified boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED: admins only'; end if;
  update public.companies set verified = p_verified where id = p_company;
  if not found then raise exception 'NOT_FOUND: company'; end if;
end;
$$;

/* ═════════════════════════════ 13. public views ═════════════════════════════ */

create or replace view public.event_stats with (security_invoker = false) as
  select e.id as event_id,
         count(r.id) filter (where r.status <> 'cancelled')::int as registered,
         coalesce(e.reported_attendance, count(r.id) filter (where r.status = 'checked_in'))::int as attended
    from public.events e left join public.event_registrations r on r.event_id = e.id
   group by e.id;

create or replace view public.research_yearly as
  select year, count(*)::int as total,
         count(*) filter (where type ilike '%article%')::int as articles,
         count(*) filter (where type ilike '%conference%')::int as conference_papers,
         count(*) filter (where type not ilike '%article%' and type not ilike '%conference%')::int as other,
         sum(citations)::int as citations
    from public.publications where year is not null group by year order by year;

/* ═════════════════════════════ 14. row level security ═════════════════════════════ */

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.labs enable row level security;
alter table public.lab_internal enable row level security;
alter table public.lab_members enable row level security;
alter table public.lab_member_contacts enable row level security;
alter table public.saved_labs enable row level security;
alter table public.projects enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_hosts enable row level security;
alter table public.applications enable row level security;
alter table public.events enable row level security;
alter table public.event_hosts enable row level security;
alter table public.event_registrations enable row level security;
alter table public.professors enable row level security;
alter table public.publications enable row level security;
alter table public.publication_authors enable row level security;
alter table public.partner_requests enable row level security;

-- profiles
create policy "Read own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "Update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (first_name, last_name, course, major, department, position, bio, links, cv_filename) on public.profiles to authenticated;

-- companies
create policy "Companies are public" on public.companies for select using (true);
create policy "Members edit company" on public.companies for update to authenticated
  using (public.is_company_member(id, false)) with check (public.is_company_member(id, false));
create policy "Admins manage companies" on public.companies for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke update on public.companies from authenticated;
grant update (name, website, description, logo_url) on public.companies to authenticated;

create policy "See company memberships" on public.company_members for select to authenticated
  using (user_id = auth.uid() or public.is_company_member(company_id, false));
create policy "Admins manage company members" on public.company_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- labs
create policy "Labs are public" on public.labs for select using (true);
create policy "Admins create labs" on public.labs for insert to authenticated with check (public.is_admin());
create policy "Lab managers edit lab" on public.labs for update to authenticated using (public.is_lab_manager(id)) with check (public.is_lab_manager(id));
create policy "Admins delete labs" on public.labs for delete to authenticated using (public.is_admin());

create policy "Lab internals: managers and staff" on public.lab_internal for select to authenticated using (public.is_lab_manager(lab_id) or public.is_staff());
create policy "Lab internals: managers insert" on public.lab_internal for insert to authenticated with check (public.is_lab_manager(lab_id));
create policy "Lab internals: managers update" on public.lab_internal for update to authenticated using (public.is_lab_manager(lab_id)) with check (public.is_lab_manager(lab_id));

create policy "Lab members are public" on public.lab_members for select using (true);
create policy "Lab managers add members" on public.lab_members for insert to authenticated with check (public.is_lab_manager(lab_id));
create policy "Lab managers edit members" on public.lab_members for update to authenticated using (public.is_lab_manager(lab_id)) with check (public.is_lab_manager(lab_id));
create policy "Lab managers remove members" on public.lab_members for delete to authenticated using (public.is_lab_manager(lab_id));

create policy "Contacts for lab managers" on public.lab_member_contacts for all to authenticated
  using (exists (select 1 from public.lab_members m where m.id = member_id and public.is_lab_manager(m.lab_id)))
  with check (exists (select 1 from public.lab_members m where m.id = member_id and public.is_lab_manager(m.lab_id)));

create policy "Own saved labs" on public.saved_labs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- projects (lab projects only)
create policy "Projects are public" on public.projects for select using (true);
create policy "Lab managers add projects" on public.projects for insert to authenticated with check (public.is_lab_manager(lab_id));
create policy "Lab managers edit projects" on public.projects for update to authenticated using (public.is_lab_manager(lab_id)) with check (public.is_lab_manager(lab_id));
create policy "Lab managers delete projects" on public.projects for delete to authenticated using (public.is_lab_manager(lab_id));

-- opportunities: writes via save_opportunity(); deletes by managers
create policy "Active opportunities are public" on public.opportunities for select using (is_active or public.can_manage_opportunity(id));
create policy "Managers update opportunities" on public.opportunities for update to authenticated
  using (public.can_manage_opportunity(id)) with check (public.can_manage_opportunity(id));
create policy "Managers delete opportunities" on public.opportunities for delete to authenticated using (public.can_manage_opportunity(id));
revoke insert on public.opportunities from anon, authenticated;
create policy "Opportunity hosts are public" on public.opportunity_hosts for select using (true);
revoke insert, update, delete on public.opportunity_hosts from anon, authenticated;

-- applications
create policy "Own or reviewable applications" on public.applications for select to authenticated
  using (applicant_id = auth.uid() or public.can_review_application(id));
revoke insert, update, delete on public.applications from anon, authenticated;

-- events
create policy "Published events are public" on public.events for select using (is_published or public.can_manage_event(id));
create policy "Organizers update events" on public.events for update to authenticated using (public.can_manage_event(id)) with check (public.can_manage_event(id));
create policy "Organizers delete events" on public.events for delete to authenticated using (public.can_manage_event(id));
revoke insert on public.events from anon, authenticated;
create policy "Event hosts are public" on public.event_hosts for select using (true);
revoke insert, update, delete on public.event_hosts from anon, authenticated;

create policy "Own tickets or organizer" on public.event_registrations for select to authenticated
  using (user_id = auth.uid() or public.can_manage_event(event_id));
revoke insert, update, delete on public.event_registrations from anon, authenticated;

-- research (public read; e-mail column hidden)
create policy "Professors are public" on public.professors for select using (true);
create policy "Staff manage professors" on public.professors for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke select on public.professors from anon, authenticated;
grant select (id, username, first_name, last_name, full_name, job_title, degree, photo_url, orcid_url, scopus_id, scholar_url,
              h_index, i10_index, total_citations, total_works, keywords, topics, profile_id, updated_at)
  on public.professors to anon, authenticated;
create policy "Publications are public" on public.publications for select using (true);
create policy "Admins manage publications" on public.publications for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Publication authors are public" on public.publication_authors for select using (true);
create policy "Admins manage publication authors" on public.publication_authors for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- B2B
create policy "Anyone submits a brief" on public.partner_requests for insert to anon, authenticated
  with check ((created_by is null or created_by = auth.uid()) and status = 'new' and assigned_lab_id is null and internal_note is null);
create policy "Author or staff read briefs" on public.partner_requests for select to authenticated using (created_by = auth.uid() or public.is_staff());
create policy "Staff triage briefs" on public.partner_requests for update to authenticated using (public.is_staff()) with check (public.is_staff());

/* ═════════════════════════════ 15. function privileges ═════════════════════════════ */

do $$
declare f text;
begin
  foreach f in array array[
    'my_context()', 'submit_application(uuid, text, text)', 'withdraw_application(uuid)',
    'review_application(uuid, public.application_status, text)', 'application_inbox()',
    'save_opportunity(uuid, public.opportunity_category, public.industrial_type, text, text, text[], text[], date, text, boolean, text, text, boolean, uuid[], uuid[], uuid[])',
    'save_event(uuid, public.event_kind, text, text, timestamptz, text, text, text, int, uuid[], uuid[], uuid[])',
    'register_for_event(uuid)', 'cancel_registration(uuid)', 'check_in(text)', 'event_attendees(uuid)',
    'verify_staff(uuid, boolean)', 'verify_company(uuid, boolean)'
  ] loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant select on public.event_stats, public.research_yearly to anon, authenticated;

/* ═════════════════════════════ 16. storage ═════════════════════════════ */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cvs', 'cvs', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf'];

drop policy if exists "Users read own CV" on storage.objects;
drop policy if exists "Users upload own CV" on storage.objects;
drop policy if exists "Users update own CV" on storage.objects;
drop policy if exists "Users delete own CV" on storage.objects;
drop policy if exists "Reviewers read applicant CVs" on storage.objects;
create policy "Users read own CV" on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users upload own CV" on storage.objects for insert to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users update own CV" on storage.objects for update to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete own CV" on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Reviewers read applicant CVs" on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and public.can_view_cv(name));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lab-assets', 'lab-assets', true, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "Lab managers upload assets" on storage.objects;
drop policy if exists "Lab managers update assets" on storage.objects;
drop policy if exists "Lab managers delete assets" on storage.objects;
create policy "Lab managers upload assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'lab-assets' and public.is_lab_manager_path((storage.foldername(name))[1]));
create policy "Lab managers update assets" on storage.objects for update to authenticated
  using (bucket_id = 'lab-assets' and public.is_lab_manager_path((storage.foldername(name))[1]));
create policy "Lab managers delete assets" on storage.objects for delete to authenticated
  using (bucket_id = 'lab-assets' and public.is_lab_manager_path((storage.foldername(name))[1]));

/* ═════════════════════════════ 17. back-fill existing accounts ═════════════════════════════ */

insert into public.profiles (id, role, first_name, last_name, email)
select u.id,
       case when u.raw_user_meta_data->>'role' = 'partner' then 'partner'::public.app_role
            when u.raw_user_meta_data->>'role' in ('teacher', 'professor') and public.is_sdu_email(u.email) then 'teacher'::public.app_role
            else 'student'::public.app_role end,
       left(coalesce(u.raw_user_meta_data->>'first_name', split_part(coalesce(u.raw_user_meta_data->>'full_name', ''), ' ', 1), ''), 100),
       left(coalesce(u.raw_user_meta_data->>'last_name', nullif(substr(coalesce(u.raw_user_meta_data->>'full_name', ''), strpos(coalesce(u.raw_user_meta_data->>'full_name', ''), ' ') + 1), coalesce(u.raw_user_meta_data->>'full_name', '')), ''), 100),
       lower(coalesce(u.email, ''))
  from auth.users u
on conflict (id) do nothing;

update public.profiles p set cv_path = o.name, cv_uploaded_at = now()
  from storage.objects o
 where o.bucket_id = 'cvs' and o.name = p.id::text || '/cv.pdf' and p.cv_path is null;
