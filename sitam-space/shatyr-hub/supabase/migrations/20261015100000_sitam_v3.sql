/* SITAM SPACE v3 — roles, auto-delegation and moderation
   ─────────────────────────────────────────────────────────────
   • New role "phd" (PhD student): applies like a student and publishes own research.
   • Professors post opportunities as themselves (person host) → they appear in Opportunities.
   • Students / PhD submit projects, startups and research → admin moderation → catalog.
     PhD research is published immediately.
   • Professor metrics refresh automatically from linked publications.
   • Applicant dashboard shows contacts (e-mail, phone) and CV.
   Note: new enum values are compared as text inside SQL functions, so the whole file
   can run in one transaction. */

alter type public.app_role add value if not exists 'phd';
alter type public.project_kind add value if not exists 'project';

/* ───────────── profiles: phone for applicant contacts ───────────── */
alter table public.profiles add column if not exists phone text check (phone is null or phone ~ '^[0-9 +()-]{6,24}$');
grant update (phone) on public.profiles to authenticated;

/* ───────────── opportunities posted by a person (professor) ───────────── */
alter table public.opportunity_hosts add column if not exists person_id uuid references public.profiles(id) on delete cascade;
alter table public.opportunity_hosts add column if not exists person_name text;
alter table public.opportunity_hosts add column if not exists person_username text;   -- research page of the professor, if any
alter table public.opportunity_hosts drop constraint if exists one_host_per_row;
alter table public.opportunity_hosts add constraint one_host_per_row check (num_nonnulls(lab_id, company_id, project_id, person_id) = 1);
drop index if exists public.opportunity_hosts_unique;
create unique index opportunity_hosts_unique on public.opportunity_hosts(opportunity_id, coalesce(lab_id, company_id, project_id, person_id));
create index if not exists opportunity_hosts_person_idx on public.opportunity_hosts(person_id);

/* ───────────── projects: student / PhD submissions with moderation ───────────── */
alter table public.projects alter column lab_id drop not null;
alter table public.projects add column if not exists owner_id uuid references public.profiles(id) on delete cascade;
alter table public.projects add column if not exists moderation text not null default 'approved'
  check (moderation in ('pending', 'approved', 'rejected'));
alter table public.projects add column if not exists moderation_note text check (char_length(moderation_note) <= 1000);
alter table public.projects add column if not exists contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.projects add column if not exists submitted_at timestamptz;
alter table public.projects drop constraint if exists project_has_owner;
alter table public.projects add constraint project_has_owner check (lab_id is not null or owner_id is not null);
create index if not exists projects_owner_idx on public.projects(owner_id);
create index if not exists projects_moderation_idx on public.projects(moderation) where moderation <> 'approved';

drop policy if exists "Projects are public" on public.projects;
create policy "Approved projects are public" on public.projects for select using (
  moderation = 'approved' or owner_id = auth.uid() or public.is_admin()
  or (lab_id is not null and public.is_lab_manager(lab_id))
);
create policy "Owners withdraw pending submissions" on public.projects for delete to authenticated
  using (owner_id = auth.uid() and lab_id is null and moderation <> 'approved');
-- lab managers may not touch moderation fields
revoke update on public.projects from authenticated;
grant update (kind, status, title, summary, tags, authors, year, github_url, demo_url, paper_url, sort_order, lab_id) on public.projects to authenticated;
revoke insert on public.projects from anon, authenticated;
grant insert (lab_id, kind, status, title, summary, tags, authors, year, github_url, demo_url, paper_url, sort_order) on public.projects to authenticated;

/* ───────────── permission helpers ───────────── */
create or replace function public.my_role_text()
returns text language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid()
$$;

create or replace function public.can_post_as_person()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff()   -- verified professor or admin
$$;

create or replace function public.can_act_as_host(p_lab uuid, p_company uuid, p_project uuid, p_person uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_act_as_host(p_lab, p_company, p_project)
      or (p_person is not null and p_person = auth.uid())
$$;

create or replace function public.can_manage_opportunity(p_opp uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.opportunities o where o.id = p_opp and o.created_by = auth.uid())
      or exists (select 1 from public.opportunity_hosts h where h.opportunity_id = p_opp
                 and public.can_act_as_host(h.lab_id, h.company_id, h.project_id, h.person_id))
$$;

create or replace function public.is_project_manager(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.projects p where p.id = p_project
      and ((p.lab_id is not null and public.is_lab_manager(p.lab_id)) or (p.owner_id = auth.uid() and p.moderation = 'approved'))
  )
$$;

/* ───────────── sign-up: PhD role ───────────── */
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text;
  v_company uuid;
  v_company_name text := nullif(trim(left(coalesce(v_meta->>'company', ''), 120)), '');
begin
  v_role := case
    when v_meta->>'role' = 'partner' then 'partner'
    when v_meta->>'role' in ('teacher', 'professor') and public.is_sdu_email(new.email) then 'teacher'
    when v_meta->>'role' = 'phd' and public.is_sdu_email(new.email) then 'phd'
    else 'student'
  end;

  insert into public.profiles (id, role, first_name, last_name, email, course, major, department, position, phone)
  values (
    new.id, v_role::public.app_role,
    left(coalesce(v_meta->>'first_name', ''), 100),
    left(coalesce(v_meta->>'last_name', ''), 100),
    lower(coalesce(new.email, '')),
    case when v_role in ('student', 'phd') and v_meta->>'course' ~ '^[1-6]$' then (v_meta->>'course')::smallint end,
    case when v_role in ('student', 'phd') then nullif(left(v_meta->>'major', 100), '') end,
    case when v_role in ('teacher', 'phd') then nullif(left(v_meta->>'department', 100), '') end,
    case when v_role = 'partner' then left(v_meta->>'position', 100) end,
    case when v_meta->>'phone' ~ '^[0-9 +()-]{6,24}$' then v_meta->>'phone' end
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

/* ───────────── applications: students and PhD students ───────────── */
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
  if v_me.role::text not in ('student', 'phd') then raise exception 'STUDENTS_ONLY: only students and PhD students can apply'; end if;

  select * into v_opp from public.opportunities where id = p_opportunity;
  if v_opp.id is null then raise exception 'NOT_FOUND: opportunity'; end if;
  if not v_opp.is_active or (v_opp.deadline is not null and v_opp.deadline < current_date) then
    raise exception 'CLOSED: applications are closed';
  end if;
  if public.can_manage_opportunity(p_opportunity) and not public.is_admin() then
    raise exception 'OWN_LISTING: you manage this listing';
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

/* ───────────── inbox with contacts ───────────── */
drop function if exists public.application_inbox();
create function public.application_inbox()
returns table (
  id uuid, status public.application_status, note text, reviewer_note text, created_at timestamptz, cv_path text,
  opportunity_id uuid, opportunity_title text, category public.opportunity_category, hosts text,
  applicant_id uuid, applicant_name text, applicant_email text, applicant_phone text, applicant_role text,
  applicant_course smallint, applicant_major text, applicant_department text
) language sql stable security definer set search_path = public as $$
  select a.id, a.status, a.note, a.reviewer_note, a.created_at, a.cv_path,
         o.id, o.title, o.category,
         (select string_agg(coalesce(l.name, c.name, pr.title, h.person_name), ' · ')
            from public.opportunity_hosts h
            left join public.labs l on l.id = h.lab_id
            left join public.companies c on c.id = h.company_id
            left join public.projects pr on pr.id = h.project_id
           where h.opportunity_id = o.id),
         p.id, trim(p.first_name || ' ' || p.last_name), p.email, p.phone, p.role::text,
         p.course, p.major, p.department
    from public.applications a
    join public.opportunities o on o.id = a.opportunity_id
    join public.profiles p on p.id = a.applicant_id
   where a.status <> 'withdrawn' and public.can_manage_opportunity(o.id)
   order by a.created_at desc
$$;

/* ───────────── save_opportunity: + post as myself (professor) ───────────── */
drop function if exists public.save_opportunity(uuid, public.opportunity_category, public.industrial_type, text, text, text[], text[], date, text, boolean, text, text, boolean, uuid[], uuid[], uuid[]);
create function public.save_opportunity(
  p_id uuid, p_category public.opportunity_category, p_industrial_type public.industrial_type,
  p_title text, p_description text, p_requirements text[], p_tags text[], p_deadline date, p_duration text,
  p_paid boolean, p_compensation text, p_work_format text, p_is_active boolean,
  p_lab_ids uuid[], p_company_ids uuid[], p_project_ids uuid[], p_as_me boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; x uuid; v_name text; v_user text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce(cardinality(p_lab_ids), 0) + coalesce(cardinality(p_company_ids), 0) + coalesce(cardinality(p_project_ids), 0) = 0
     and not coalesce(p_as_me, false) then
    raise exception 'NO_HOST: choose who offers this opportunity';
  end if;
  if coalesce(p_as_me, false) and not public.can_post_as_person() then
    raise exception 'NOT_ALLOWED: only verified professors can post opportunities in their own name';
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
  if coalesce(p_as_me, false) then
    select trim(first_name || ' ' || last_name) into v_name from public.profiles where id = auth.uid();
    select username into v_user from public.professors where profile_id = auth.uid() limit 1;
    insert into public.opportunity_hosts (opportunity_id, person_id, person_name, person_username)
    values (v_id, auth.uid(), coalesce(nullif(v_name, ''), 'Professor'), v_user);
  end if;
  return v_id;
end;
$$;

/* ───────────── submissions: projects, startups, research ───────────── */
create or replace function public.submit_project(
  p_kind text, p_title text, p_summary text, p_tags text[], p_authors text[], p_year int, p_status text,
  p_github_url text, p_demo_url text, p_paper_url text, p_contact_email text
) returns public.projects language plpgsql security definer set search_path = public as $$
declare v_role text := public.my_role_text(); v_row public.projects; v_mod text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if v_role is null or v_role = 'partner' then raise exception 'NOT_ALLOWED: SDU accounts only'; end if;
  if p_kind not in ('research', 'startup', 'project') then raise exception 'BAD_KIND'; end if;
  if (select count(*) from public.projects where owner_id = auth.uid() and moderation = 'pending') >= 5 then
    raise exception 'TOO_MANY: wait until your pending submissions are reviewed';
  end if;
  -- PhD students publish research directly; everything else is reviewed by the SITAM office.
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

create or replace function public.moderate_project(p_id uuid, p_decision text, p_note text default null)
returns public.projects language plpgsql security definer set search_path = public as $$
declare v_row public.projects;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED: admins only'; end if;
  if p_decision not in ('approved', 'rejected', 'pending') then raise exception 'BAD_STATUS'; end if;
  update public.projects set moderation = p_decision, moderation_note = p_note
   where id = p_id and owner_id is not null
  returning * into v_row;
  if v_row.id is null then raise exception 'NOT_FOUND'; end if;
  return v_row;
end;
$$;

create or replace function public.moderation_queue()
returns table (id uuid, kind text, title text, summary text, tags text[], authors text[], year int, status text,
               github_url text, demo_url text, paper_url text, contact_email text, moderation text, submitted_at timestamptz,
               owner_id uuid, owner_name text, owner_email text, owner_role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.kind::text, p.title, p.summary, p.tags, p.authors, p.year, p.status::text,
         p.github_url, p.demo_url, p.paper_url, p.contact_email, p.moderation, p.submitted_at,
         pr.id, trim(pr.first_name || ' ' || pr.last_name), pr.email, pr.role::text
    from public.projects p join public.profiles pr on pr.id = p.owner_id
   where public.is_admin() and p.owner_id is not null
   order by (p.moderation = 'pending') desc, p.submitted_at desc
$$;

/* ───────────── professor cards refresh from linked publications ───────────── */
create or replace function public.refresh_professor_metrics(p_prof uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_works int; v_cites int; v_h int; v_i10 int;
begin
  select count(*), coalesce(sum(p.citations), 0), count(*) filter (where p.citations >= 10)
    into v_works, v_cites, v_i10
    from public.publication_authors a join public.publications p on p.id = a.publication_id
   where a.professor_id = p_prof;
  select coalesce(max(rn), 0) into v_h from (
    select p.citations, row_number() over (order by p.citations desc) rn
      from public.publication_authors a join public.publications p on p.id = a.publication_id
     where a.professor_id = p_prof
  ) s where citations >= rn;
  -- Scopus totals can include works not imported here, so never lower them.
  update public.professors
     set total_works = greatest(total_works, v_works), total_citations = greatest(total_citations, v_cites),
         h_index = greatest(h_index, v_h), i10_index = greatest(i10_index, v_i10), updated_at = now()
   where id = p_prof;
end;
$$;

create or replace function public.publication_authors_refresh()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_professor_metrics(coalesce(new.professor_id, old.professor_id));
  return null;
end;
$$;
drop trigger if exists publication_authors_refresh on public.publication_authors;
create trigger publication_authors_refresh after insert or update or delete on public.publication_authors
  for each row execute function public.publication_authors_refresh();

create or replace function public.publications_refresh()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_professor_metrics(a.professor_id) from public.publication_authors a where a.publication_id = new.id;
  return null;
end;
$$;
drop trigger if exists publications_refresh on public.publications;
create trigger publications_refresh after update of citations on public.publications
  for each row execute function public.publications_refresh();

/* ───────────── my_context: role flags for the UI ───────────── */
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
    'saved_labs', coalesce((select jsonb_agg(lab_id) from public.saved_labs where user_id = auth.uid()), '[]'::jsonb),
    'pending_moderation', case when public.is_admin()
      then (select count(*) from public.projects where moderation = 'pending' and owner_id is not null) else 0 end
  )
$$;

/* ───────────── function privileges ───────────── */
do $$
declare f text;
begin
  foreach f in array array[
    'my_context()', 'submit_application(uuid, text, text)', 'application_inbox()',
    'save_opportunity(uuid, public.opportunity_category, public.industrial_type, text, text, text[], text[], date, text, boolean, text, text, boolean, uuid[], uuid[], uuid[], boolean)',
    'submit_project(text, text, text, text[], text[], int, text, text, text, text, text)',
    'moderate_project(uuid, text, text)', 'moderation_queue()'
  ] loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.refresh_professor_metrics(uuid) from anon, authenticated, public;
