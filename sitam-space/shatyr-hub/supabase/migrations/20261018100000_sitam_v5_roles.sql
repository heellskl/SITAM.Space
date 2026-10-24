/* SITAM SPACE v5 — multiple roles, Lab Head requests, public contacts
   ─────────────────────────────────────────────────────────────
   • One account, several roles: the primary university role (profiles.role) never changes
     because of lab positions. Lab Head status is an extra role per laboratory.
   • Lab Head status is REQUESTED (at registration or later from the profile) for an existing
     lab and APPROVED by an admin. Nobody can create a lab this way.
   • New lab position: mentor (no management rights).
   • Contacts: every registered person's e-mail is visible to signed-in users (public_people),
     so people can write to each other directly. Professors' Scopus e-mail too.
   New enum values are compared as text inside functions, so the file runs in one transaction. */

alter type public.lab_role add value if not exists 'mentor';

/* ───────────── Lab Head requests ───────────── */
create table if not exists public.lab_head_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lab_id uuid not null references public.labs(id) on delete cascade,
  position text not null default 'lead' check (position in ('lead', 'co_lead')),
  note text check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decision_note text check (char_length(decision_note) <= 500),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists lab_head_requests_one_pending on public.lab_head_requests(user_id, lab_id) where status = 'pending';
create index if not exists lab_head_requests_status_idx on public.lab_head_requests(status);

alter table public.lab_head_requests enable row level security;
drop policy if exists "Own lab head requests" on public.lab_head_requests;
create policy "Own lab head requests" on public.lab_head_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.lab_head_requests from anon, authenticated;
grant select on public.lab_head_requests to authenticated;

create or replace function public.request_lab_head(p_lab uuid, p_position text default 'lead', p_note text default null)
returns public.lab_head_requests language plpgsql security definer set search_path = public as $$
declare v_role text := public.my_role_text(); v_row public.lab_head_requests;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if v_role is null or v_role = 'partner' then raise exception 'NOT_ALLOWED: only SDU accounts can head a lab'; end if;
  if coalesce(p_position, 'lead') not in ('lead', 'co_lead') then raise exception 'BAD_ROLE: choose lab head or co-head'; end if;
  if not exists (select 1 from public.labs where id = p_lab) then raise exception 'NOT_FOUND: choose an existing laboratory'; end if;
  if exists (select 1 from public.lab_members m where m.lab_id = p_lab and m.user_id = auth.uid() and public.is_lab_head_role(m.role::text)) then
    raise exception 'DUPLICATE: you already head this lab';
  end if;
  insert into public.lab_head_requests (user_id, lab_id, position, note)
  values (auth.uid(), p_lab, coalesce(p_position, 'lead'), nullif(left(trim(coalesce(p_note, '')), 500), ''))
  returning * into v_row;
  return v_row;
exception
  when unique_violation then raise exception 'DUPLICATE: your request for this lab is already waiting for approval';
end;
$$;

create or replace function public.cancel_lab_head_request(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.lab_head_requests set status = 'cancelled', decided_at = now()
   where id = p_id and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'NOT_ALLOWED: this request cannot be cancelled'; end if;
end;
$$;

-- Admin decision. Approval links the person to the lab in the requested head position;
-- the position (not this function) gives the management rights (lab_members_defaults).
create or replace function public.decide_lab_head_request(p_id uuid, p_approve boolean, p_note text default null)
returns public.lab_head_requests language plpgsql security definer set search_path = public as $$
declare v_req public.lab_head_requests; v_name text; v_member uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED: only the SITAM office approves lab heads'; end if;
  select * into v_req from public.lab_head_requests where id = p_id for update;
  if v_req.id is null then raise exception 'NOT_FOUND: request'; end if;
  if v_req.status <> 'pending' then raise exception 'NOT_ALLOWED: this request was already decided'; end if;

  update public.lab_head_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decision_note = nullif(left(trim(coalesce(p_note, '')), 500), ''), decided_by = auth.uid(), decided_at = now()
   where id = p_id returning * into v_req;

  if p_approve then
    select coalesce(nullif(trim(first_name || ' ' || last_name), ''), email) into v_name from public.profiles where id = v_req.user_id;
    select id into v_member from public.lab_members where lab_id = v_req.lab_id and user_id = v_req.user_id;
    if v_member is not null then
      update public.lab_members set role = v_req.position::public.lab_role where id = v_member;
    else
      -- the lab form may already list this person by name in that position
      select id into v_member from public.lab_members
       where lab_id = v_req.lab_id and user_id is null and role::text = v_req.position and lower(full_name) = lower(v_name)
       limit 1;
      if v_member is not null then
        update public.lab_members set user_id = v_req.user_id where id = v_member;
      else
        insert into public.lab_members (lab_id, user_id, full_name, role, sort_order)
        values (v_req.lab_id, v_req.user_id, left(v_name, 120), v_req.position::public.lab_role, -1);
      end if;
    end if;
  end if;
  return v_req;
end;
$$;

create or replace function public.lab_head_queue()
returns table (id uuid, status text, head_position text, note text, created_at timestamptz, decision_note text,
               user_id uuid, user_name text, user_email text, user_role text, user_department text,
               lab_id uuid, lab_name text, lab_slug text, lab_has_head boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.status, r.position, r.note, r.created_at, r.decision_note,
         p.id, trim(p.first_name || ' ' || p.last_name), p.email, p.role::text, p.department,
         l.id, l.name, l.slug,
         exists (select 1 from public.lab_members m where m.lab_id = l.id and m.user_id is not null and public.is_lab_head_role(m.role::text))
    from public.lab_head_requests r
    join public.profiles p on p.id = r.user_id
    join public.labs l on l.id = r.lab_id
   where public.is_admin()
   order by (r.status = 'pending') desc, r.created_at desc
   limit 200
$$;

/* ───────────── sign-up: optional Lab Head request (existing lab only) ───────────── */
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text;
  v_company uuid;
  v_company_name text := nullif(trim(left(coalesce(v_meta->>'company', ''), 120)), '');
  v_lab uuid;
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

  -- People listed in a lab form by e-mail (entered by the SITAM office / lab heads) are linked at once.
  update public.lab_members m set user_id = new.id
    from public.lab_member_contacts c
   where c.member_id = m.id and c.email = lower(new.email) and m.user_id is null;

  update public.professors set profile_id = new.id where lower(email) = lower(new.email) and profile_id is null;

  -- "I am the head of an existing laboratory": a request for the admin, never a new lab.
  if v_role <> 'partner' and coalesce(v_meta->>'lab_head_lab', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_lab from public.labs where id = (v_meta->>'lab_head_lab')::uuid;
    if v_lab is not null and not exists (
      select 1 from public.lab_members m where m.lab_id = v_lab and m.user_id = new.id and public.is_lab_head_role(m.role::text)
    ) then
      insert into public.lab_head_requests (user_id, lab_id, position, note)
      values (new.id, v_lab, case when v_meta->>'lab_head_position' = 'co_lead' then 'co_lead' else 'lead' end, 'Requested at registration')
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

/* ───────────── positions: mentor ───────────── */
create or replace function public.add_lab_member(p_lab uuid, p_full_name text, p_email text, p_role text, p_title text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_profile public.profiles;
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if not public.is_lab_manager(p_lab) then raise exception 'NOT_ALLOWED: you do not manage this lab'; end if;
  if p_role is null or p_role not in
     ('lead', 'co_lead', 'student_lead', 'deputy_student_lead', 'member', 'mentor', 'research_assistant', 'student_researcher', 'project_coordinator') then
    raise exception 'BAD_ROLE: choose a position';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'BAD_EMAIL: check the e-mail address'; end if;

  if v_email is not null then
    select * into v_profile from public.profiles where email = v_email;
    if v_profile.id is not null then
      if exists (select 1 from public.lab_members where lab_id = p_lab and user_id = v_profile.id) then
        raise exception 'DUPLICATE: this person is already in the lab';
      end if;
      v_name := coalesce(v_name, nullif(trim(v_profile.first_name || ' ' || v_profile.last_name), ''));
    end if;
  end if;
  if v_name is null or char_length(v_name) < 2 then raise exception 'NAME_REQUIRED: enter the full name'; end if;

  insert into public.lab_members (lab_id, user_id, full_name, title, role, sort_order)
  values (p_lab, v_profile.id, left(v_name, 120), nullif(left(trim(coalesce(p_title, '')), 200), ''), p_role::public.lab_role,
          coalesce((select max(sort_order) + 1 from public.lab_members where lab_id = p_lab), 0))
  returning id into v_id;
  if v_email is not null then
    insert into public.lab_member_contacts (member_id, email) values (v_id, v_email)
    on conflict (member_id) do update set email = excluded.email;
  end if;
  return jsonb_build_object('id', v_id, 'linked', v_profile.id is not null);
end;
$$;

/* ───────────── contacts everyone can use ───────────── */
-- Name, primary role, study / work details and e-mail of registered people (no phone, no CV).
-- The view runs with its owner's rights, so it is the only way to read other people's profiles.
create or replace view public.public_people as
  select p.id, p.first_name, p.last_name, p.role::text as role, p.email, p.course, p.major, p.department, p.position, p.bio
    from public.profiles p;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;

grant select (email) on public.professors to authenticated;

/* ───────────── my_context: + Lab Head requests ───────────── */
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
    'lab_memberships', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'slug', l.slug, 'name', l.name, 'role', m.role, 'title', m.title,
                                          'can_edit', m.can_edit, 'is_head', public.is_lab_head_role(m.role::text)) order by l.name)
      from public.lab_members m join public.labs l on l.id = m.lab_id
      where m.user_id = auth.uid() and m.role::text <> 'former_lead'), '[]'::jsonb),
    'lab_head_requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'lab_id', r.lab_id, 'lab_name', l.name, 'position', r.position,
                                          'status', r.status, 'decision_note', r.decision_note, 'created_at', r.created_at) order by r.created_at desc)
      from public.lab_head_requests r join public.labs l on l.id = r.lab_id
      where r.user_id = auth.uid() and r.status in ('pending', 'rejected')), '[]'::jsonb),
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'verified', c.verified) order by c.name)
      from public.company_members cm join public.companies c on c.id = cm.company_id
      where cm.user_id = auth.uid()), '[]'::jsonb),
    'professor', (select jsonb_build_object('username', username, 'full_name', full_name) from public.professors where profile_id = auth.uid() limit 1),
    'saved_labs', coalesce((select jsonb_agg(lab_id) from public.saved_labs where user_id = auth.uid()), '[]'::jsonb),
    'pending_moderation', case when public.is_admin()
      then (select count(*) from public.projects where moderation = 'pending' and owner_id is not null) else 0 end,
    'pending_lab_heads', case when public.is_admin() then (select count(*) from public.lab_head_requests where status = 'pending') else 0 end
  )
$$;

/* ───────────── function privileges ───────────── */
do $$
declare f text;
begin
  foreach f in array array[
    'request_lab_head(uuid, text, text)', 'cancel_lab_head_request(uuid)', 'decide_lab_head_request(uuid, boolean, text)',
    'lab_head_queue()', 'add_lab_member(uuid, text, text, text, text)', 'my_context()'
  ] loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
