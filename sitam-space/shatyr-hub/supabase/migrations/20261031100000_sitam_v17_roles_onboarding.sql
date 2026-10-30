/* SITAM SPACE v17 — roles & onboarding (decided with the user on 2026-10-31)
   ──────────────────────────────────────────────────────────────────────────
   1. Lab positions: new "Tech Lead"; heads can add Student Lead / Tech Lead. A lab's Head (lead) can now also
      appoint and remove Co-Heads in their own lab; only the coordinator appoints or removes the Head.
   2. Alumni: new account type "alumni" (personal e-mail allowed) with faculty, graduation year, job title, company.
      They read everything and can "Offer help" to a lab (mentor / guest speaker / research advisor);
      the lab's heads see and answer the offers. Alumni do not apply to vacancies and do not submit projects.
   3. Researcher profiles: a teacher asks for a new researcher card or claims an existing unlinked one
      ("This is me"); the coordinator approves; then the teacher edits ONLY their card (bio, interests,
      office hours, ORCID / Scopus / Google Scholar).
   4. B2B: new request types "Offer an internship / vacancy" and "Contact a lab" with the chosen lab
      (still read only by the SITAM office, as before).
   New enum values are only used inside function bodies / as text in this file, so it runs in one transaction.
   Re-runnable. */

/* ───────────── 1. lab positions ───────────── */
alter type public.lab_role add value if not exists 'tech_lead';

create or replace function public.is_lab_lead(p_lab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lab_members m where m.lab_id = p_lab and m.user_id = auth.uid() and m.role::text = 'lead')
$$;
grant execute on function public.is_lab_lead(uuid) to authenticated;

create or replace function public.lab_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_lab uuid := coalesce(new.lab_id, old.lab_id); v_lead boolean;
begin
  if v_uid is null or public.is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.lab_id is distinct from old.lab_id then
    raise exception 'NOT_ALLOWED: a member cannot be moved to another lab';
  end if;
  v_lead := public.is_lab_lead(v_lab);
  -- the Head of the lab appoints Co-Heads; only the coordinator appoints the Head
  if tg_op = 'INSERT' and public.is_lab_head_role(new.role::text) then
    if not (new.role::text = 'co_lead' and v_lead) then
      raise exception 'NOT_ALLOWED: only the coordinator appoints the Head; the Head appoints Co-Heads';
    end if;
  end if;
  if tg_op = 'DELETE' and public.is_lab_head_role(old.role::text) then
    if not (old.role::text = 'co_lead' and v_lead and old.user_id is distinct from v_uid) then
      raise exception 'NOT_ALLOWED: only the coordinator removes the Head; the Head removes Co-Heads';
    end if;
  end if;
  if tg_op = 'UPDATE' and (public.is_lab_head_role(old.role::text) or public.is_lab_head_role(new.role::text))
     and (new.role is distinct from old.role or new.user_id is distinct from old.user_id) then
    if not (v_lead and old.role::text <> 'lead' and new.role::text <> 'lead' and new.user_id is not distinct from old.user_id
            and old.user_id is distinct from v_uid) then
      raise exception 'NOT_ALLOWED: only the coordinator changes the Head; the Head appoints or removes Co-Heads';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.add_lab_member(p_lab uuid, p_full_name text, p_email text, p_role text, p_title text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_profile public.profiles;
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_role text := coalesce(nullif(p_role, ''), 'member');
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if not public.is_lab_manager(p_lab) then raise exception 'NOT_ALLOWED: only the head of this lab can add members'; end if;
  if v_role = 'co_lead' then
    if not (public.is_lab_lead(p_lab) or public.is_admin()) then raise exception 'NOT_ALLOWED: only the Head of the lab appoints Co-Heads'; end if;
  elsif v_role not in ('member', 'mentor', 'research_assistant', 'student_researcher', 'project_coordinator', 'student_lead', 'tech_lead') then
    raise exception 'BAD_ROLE: the Head is appointed by the coordinator';
  end if;
  if v_email is null then raise exception 'EMAIL_REQUIRED: choose a registered user'; end if;
  select * into v_profile from public.profiles where email = v_email;
  if v_profile.id is null then raise exception 'NOT_FOUND: this person has not signed in to SITAM SPACE yet'; end if;
  if exists (select 1 from public.lab_members where lab_id = p_lab and user_id = v_profile.id) then
    raise exception 'DUPLICATE: this person is already in the lab';
  end if;
  v_name := coalesce(nullif(trim(v_profile.first_name || ' ' || v_profile.last_name), ''), v_name, v_profile.email);

  insert into public.lab_members (lab_id, user_id, full_name, title, role, sort_order)
  values (p_lab, v_profile.id, left(v_name, 120), nullif(left(trim(coalesce(p_title, '')), 200), ''),
          v_role::public.lab_role,
          coalesce((select max(sort_order) + 1 from public.lab_members where lab_id = p_lab), 0))
  returning id into v_id;
  insert into public.lab_member_contacts (member_id, email) values (v_id, v_email)
  on conflict (member_id) do update set email = excluded.email;
  return jsonb_build_object('id', v_id, 'linked', true);
end;
$$;

/* ───────────── 2. alumni ───────────── */
alter type public.app_role add value if not exists 'alumni';
alter table public.profiles add column if not exists graduation_year int check (graduation_year is null or graduation_year between 1990 and 2100);
alter table public.profiles add column if not exists company text check (company is null or char_length(company) <= 160);
grant update (graduation_year, company) on public.profiles to authenticated;

create or replace view public.public_people as
  select p.id, p.first_name, p.last_name, p.role::text as role, p.email, p.course, p.major, p.department, p.position, p.bio,
         p.faculty, p.group_name, p.avatar_url, p.personal_email, p.graduation_year, p.company
    from public.profiles p;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;

-- students and teachers need an SDU e-mail; partners and alumni may use any e-mail
create or replace function public.enforce_signup_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role text := coalesce(new.raw_user_meta_data->>'role', 'student');
begin
  if tg_op = 'UPDATE' then
    if public.is_sdu_email(old.email) and not public.is_sdu_email(new.email) then
      raise exception 'SITAM_EMAIL_DOMAIN: SDU accounts must keep an @sdu.edu.kz e-mail' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if v_role in ('partner', 'alumni') or public.is_sdu_email(new.email) then
    return new;
  end if;
  raise exception 'SITAM_EMAIL_DOMAIN: students and teachers must register with an @sdu.edu.kz e-mail'
    using errcode = 'P0001';
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text;
  v_company uuid;
  v_company_name text := nullif(trim(left(coalesce(v_meta->>'company', ''), 120)), '');
  v_full text := trim(coalesce(v_meta->>'full_name', v_meta->>'name', ''));
  v_first text := nullif(trim(coalesce(v_meta->>'first_name', v_meta->>'given_name', '')), '');
  v_last text := nullif(trim(coalesce(v_meta->>'last_name', v_meta->>'family_name', '')), '');
begin
  v_role := case
    when v_meta->>'role' = 'partner' then 'partner'
    when v_meta->>'role' = 'alumni' then 'alumni'
    when v_meta->>'role' in ('teacher', 'professor') and public.is_sdu_email(new.email) then 'teacher'
    when v_meta->>'role' in ('student', 'phd') and public.is_sdu_email(new.email) then 'student'
    else public.account_type_from_email(new.email)
  end;
  if v_first is null and v_full <> '' then
    v_first := split_part(v_full, ' ', 1);
    v_last := coalesce(v_last, nullif(trim(substr(v_full, char_length(split_part(v_full, ' ', 1)) + 1)), ''));
  end if;

  insert into public.profiles (id, role, first_name, last_name, email, course, major, department, position, phone, faculty, graduation_year, company)
  values (
    new.id, v_role::public.app_role,
    left(coalesce(v_first, ''), 100), left(coalesce(v_last, ''), 100),
    lower(coalesce(new.email, '')),
    case when v_role = 'student' and v_meta->>'course' ~ '^[1-6]$' then (v_meta->>'course')::smallint end,
    case when v_role = 'student' then nullif(left(v_meta->>'major', 100), '') end,
    case when v_role = 'teacher' then nullif(left(v_meta->>'department', 100), '') end,
    case when v_role in ('partner', 'alumni') then nullif(left(v_meta->>'position', 100), '') end,
    case when v_meta->>'phone' ~ '^[0-9 +()-]{6,24}$' then v_meta->>'phone' end,
    case when v_role = 'alumni' then nullif(left(v_meta->>'faculty', 120), '') end,
    case when v_role = 'alumni' and v_meta->>'graduation_year' ~ '^(19|20)[0-9]{2}$' then (v_meta->>'graduation_year')::int end,
    case when v_role = 'alumni' then v_company_name end
  )
  on conflict (id) do nothing;

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

  update public.lab_members m set user_id = new.id
    from public.lab_member_contacts c
   where c.member_id = m.id and c.email = lower(new.email) and m.user_id is null;
  update public.professors set profile_id = new.id where lower(email) = lower(new.email) and profile_id is null;
  return new;
end;
$$;

-- alumni and partners do not submit student projects
create or replace function public.submit_project(
  p_kind text, p_title text, p_summary text, p_tags text[], p_authors text[], p_year int, p_status text,
  p_github_url text, p_demo_url text, p_paper_url text, p_contact_email text
) returns public.projects language plpgsql security definer set search_path = public as $$
declare v_role text := public.my_role_text(); v_row public.projects; v_mod text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if v_role is null or v_role in ('partner', 'alumni') then raise exception 'NOT_ALLOWED: SDU accounts only'; end if;
  if p_kind not in ('research', 'project') then raise exception 'BAD_KIND'; end if;
  if (select count(*) from public.projects where owner_id = auth.uid() and moderation = 'pending') >= 5 then
    raise exception 'TOO_MANY: wait until your pending submissions are reviewed';
  end if;
  v_mod := case when (v_role = 'phd' and p_kind = 'research') or v_role = 'admin' then 'approved' else 'pending' end;
  insert into public.projects (lab_id, owner_id, kind, status, title, summary, tags, authors, year,
                               github_url, demo_url, paper_url, contact_email, moderation, submitted_at)
  values (null, auth.uid(), p_kind::public.project_kind, coalesce(nullif(p_status, ''), 'ongoing')::public.project_status,
          trim(p_title), nullif(trim(p_summary), ''), coalesce(p_tags, '{}'), coalesce(p_authors, '{}'), p_year,
          nullif(p_github_url, ''), nullif(p_demo_url, ''), nullif(p_paper_url, ''), nullif(lower(p_contact_email), ''), v_mod, now())
  returning * into v_row;
  return v_row;
end;
$$;

-- "Offer help" from alumni to a lab
create table if not exists public.help_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  kind text not null check (kind in ('mentor', 'speaker', 'advisor')),
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'new' check (status in ('new', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists help_offers_lab on public.help_offers (lab_id, created_at desc);
alter table public.help_offers enable row level security;
drop policy if exists "Offers: author, lab heads, coordinator" on public.help_offers;
create policy "Offers: author, lab heads, coordinator" on public.help_offers for select to authenticated
  using (user_id = auth.uid() or public.is_lab_manager(lab_id) or public.is_admin());
revoke insert, update, delete on public.help_offers from anon, authenticated;
grant select on public.help_offers to authenticated;

create or replace function public.offer_help(p_lab uuid, p_kind text, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if public.my_role_text() <> 'alumni' and not public.is_admin() then raise exception 'NOT_ALLOWED: offers of help are for SDU alumni'; end if;
  if not exists (select 1 from public.labs where id = p_lab) then raise exception 'NOT_FOUND: lab'; end if;
  if p_kind not in ('mentor', 'speaker', 'advisor') then raise exception 'BAD_INPUT: choose mentor, guest speaker or research advisor'; end if;
  if char_length(trim(coalesce(p_message, ''))) < 10 then raise exception 'BAD_INPUT: write a short message (10+ characters)'; end if;
  if (select count(*) from public.help_offers where user_id = auth.uid() and status = 'new') >= 10 then
    raise exception 'TOO_MANY: wait until the labs answer your offers';
  end if;
  insert into public.help_offers (user_id, lab_id, kind, message) values (auth.uid(), p_lab, p_kind, left(trim(p_message), 2000))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.respond_help_offer(p_offer uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_lab uuid;
begin
  select lab_id into v_lab from public.help_offers where id = p_offer;
  if v_lab is null then raise exception 'NOT_FOUND: offer'; end if;
  if not public.is_lab_manager(v_lab) then raise exception 'NOT_ALLOWED: only the heads of this lab answer its offers'; end if;
  if p_status not in ('accepted', 'declined', 'new') then raise exception 'BAD_INPUT: status'; end if;
  update public.help_offers set status = p_status, answered_at = case when p_status = 'new' then null else now() end where id = p_offer;
end;
$$;

/* ───────────── 3. researcher profiles: request / claim, approve, edit own ───────────── */
alter table public.professors add column if not exists bio text check (bio is null or char_length(bio) <= 3000);
alter table public.professors add column if not exists office_hours text check (office_hours is null or char_length(office_hours) <= 300);
alter table public.professors add column if not exists interests text[] not null default '{}';
grant select (bio, office_hours, interests) on public.professors to anon, authenticated;

create table if not exists public.researcher_profile_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  professor_id uuid references public.professors(id) on delete set null,   -- "This is me": an existing card
  full_name text not null check (char_length(trim(full_name)) between 3 and 160),
  department text check (department is null or char_length(department) <= 160),
  title text check (title is null or char_length(title) <= 160),
  degree text check (degree is null or char_length(degree) <= 120),
  scopus_url text check (scopus_url is null or scopus_url ~* '^https?://'),
  orcid_url text check (orcid_url is null or orcid_url ~* '^https?://'),
  scholar_url text check (scholar_url is null or scholar_url ~* '^https?://'),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists researcher_requests_one_pending on public.researcher_profile_requests (user_id) where status = 'pending';
alter table public.researcher_profile_requests enable row level security;
drop policy if exists "Requests: author and coordinator" on public.researcher_profile_requests;
create policy "Requests: author and coordinator" on public.researcher_profile_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.researcher_profile_requests from anon, authenticated;
grant select on public.researcher_profile_requests to authenticated;

create or replace function public.request_researcher_profile(p_professor uuid, p_full_name text, p_department text, p_title text, p_degree text,
                                                            p_scopus_url text, p_orcid_url text, p_scholar_url text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_role text := public.my_role_text();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if v_role not in ('teacher', 'phd', 'admin') then raise exception 'NOT_ALLOWED: researcher profiles are for SDU teachers and researchers'; end if;
  if exists (select 1 from public.professors where profile_id = auth.uid()) then raise exception 'DUPLICATE: your researcher profile is already linked'; end if;
  if exists (select 1 from public.researcher_profile_requests where user_id = auth.uid() and status = 'pending') then
    raise exception 'DUPLICATE: your request is waiting for the coordinator';
  end if;
  if p_professor is not null and not exists (select 1 from public.professors where id = p_professor and profile_id is null) then
    raise exception 'NOT_ALLOWED: this researcher card is already linked to an account';
  end if;
  if char_length(trim(coalesce(p_full_name, ''))) < 3 then raise exception 'BAD_INPUT: enter your full name'; end if;
  insert into public.researcher_profile_requests (user_id, professor_id, full_name, department, title, degree, scopus_url, orcid_url, scholar_url, note)
  values (auth.uid(), p_professor, left(trim(p_full_name), 160), nullif(trim(p_department), ''), nullif(trim(p_title), ''), nullif(trim(p_degree), ''),
          nullif(trim(p_scopus_url), ''), nullif(trim(p_orcid_url), ''), nullif(trim(p_scholar_url), ''), nullif(trim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.review_researcher_request(p_request uuid, p_approve boolean, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.researcher_profile_requests; v_prof uuid; v_base text; v_user text; n int := 1;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED: coordinator only'; end if;
  select * into r from public.researcher_profile_requests where id = p_request for update;
  if r.id is null then raise exception 'NOT_FOUND: request'; end if;
  if r.status <> 'pending' then raise exception 'DONE: this request was already reviewed'; end if;
  if not coalesce(p_approve, false) then
    update public.researcher_profile_requests set status = 'rejected', review_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
    return null;
  end if;
  if exists (select 1 from public.professors where profile_id = r.user_id) then raise exception 'DUPLICATE: this person already has a researcher profile'; end if;

  if r.professor_id is not null then
    update public.professors set profile_id = r.user_id,
           orcid_url = coalesce(orcid_url, r.orcid_url), scholar_url = coalesce(scholar_url, r.scholar_url)
     where id = r.professor_id and profile_id is null
    returning id into v_prof;
    if v_prof is null then raise exception 'NOT_ALLOWED: this card is already linked to another account'; end if;
  else
    v_base := left(trim(both '.' from regexp_replace(lower(r.full_name), '[^a-z0-9]+', '.', 'g')), 60);
    if v_base !~ '^[a-z0-9._-]{2,}$' then v_base := 'researcher.' || substr(md5(r.full_name), 1, 6); end if;
    v_user := v_base;
    while exists (select 1 from public.professors where username = v_user) loop n := n + 1; v_user := v_base || '.' || n; end loop;
    insert into public.professors (username, first_name, last_name, full_name, job_title, degree, orcid_url, scholar_url, scopus_id, profile_id, email)
    values (v_user, split_part(trim(r.full_name), ' ', 1), nullif(trim(substr(trim(r.full_name), char_length(split_part(trim(r.full_name), ' ', 1)) + 1)), ''),
            r.full_name, concat_ws(', ', r.title, r.department), r.degree, r.orcid_url, r.scholar_url,
            nullif(substring(coalesce(r.scopus_url, '') from 'authorId=([0-9]+)'), ''), r.user_id,
            (select email from public.profiles where id = r.user_id))
    returning id into v_prof;
  end if;
  update public.researcher_profile_requests set status = 'approved', professor_id = v_prof, review_note = nullif(trim(p_note), ''),
         reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
  return v_prof;
end;
$$;

-- the teacher edits only their own card
create or replace function public.update_my_researcher_profile(p_bio text, p_office_hours text, p_interests text[],
                                                              p_orcid_url text, p_scholar_url text, p_scopus_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.professors where profile_id = auth.uid();
  if v_id is null then raise exception 'NOT_ALLOWED: you do not have a linked researcher profile'; end if;
  if nullif(trim(p_orcid_url), '') is not null and p_orcid_url !~* '^https?://' then raise exception 'BAD_INPUT: ORCID link must start with https://'; end if;
  if nullif(trim(p_scholar_url), '') is not null and p_scholar_url !~* '^https?://' then raise exception 'BAD_INPUT: Google Scholar link must start with https://'; end if;
  if nullif(trim(p_scopus_id), '') is not null and trim(p_scopus_id) !~ '^[0-9]{5,15}$' then raise exception 'BAD_INPUT: Scopus Author ID is a number'; end if;
  update public.professors set
    bio = nullif(left(trim(coalesce(p_bio, '')), 3000), ''),
    office_hours = nullif(left(trim(coalesce(p_office_hours, '')), 300), ''),
    interests = coalesce((select array_agg(distinct left(trim(x), 60)) from unnest(coalesce(p_interests, '{}')) x where trim(x) <> ''), '{}'),
    orcid_url = nullif(trim(p_orcid_url), ''), scholar_url = nullif(trim(p_scholar_url), ''), scopus_id = nullif(trim(p_scopus_id), ''),
    updated_at = now()
  where id = v_id;
end;
$$;

/* ───────────── 4. B2B: internships / vacancies and "Contact a lab" ───────────── */
alter type public.partner_request_type add value if not exists 'internship';
alter type public.partner_request_type add value if not exists 'contact_lab';
-- the lab the request is about (no foreign key: partner_requests already links labs via assigned_lab_id)
alter table public.partner_requests add column if not exists requested_lab_id uuid;

/* ───────────── rights ───────────── */
revoke execute on function public.offer_help(uuid, text, text) from anon, public;
revoke execute on function public.respond_help_offer(uuid, text) from anon, public;
revoke execute on function public.request_researcher_profile(uuid, text, text, text, text, text, text, text, text) from anon, public;
revoke execute on function public.review_researcher_request(uuid, boolean, text) from anon, public;
revoke execute on function public.update_my_researcher_profile(text, text, text[], text, text, text) from anon, public;
grant execute on function public.offer_help(uuid, text, text) to authenticated;
grant execute on function public.respond_help_offer(uuid, text) to authenticated;
grant execute on function public.request_researcher_profile(uuid, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.review_researcher_request(uuid, boolean, text) to authenticated;
grant execute on function public.update_my_researcher_profile(text, text, text[], text, text, text) to authenticated;
