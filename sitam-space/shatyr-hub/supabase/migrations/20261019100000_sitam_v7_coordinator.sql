/* SITAM SPACE v7 — Google sign-in, coordinator, head / member
   ─────────────────────────────────────────────────────────────
   • Account type is detected from the SDU e-mail at sign-up (Google OAuth):
       local part starts with digits (230183076@sdu.edu.kz) → student, otherwise → teacher.
   • Coordinator = e-mail listed in coordinator_emails (server-side config, not selectable).
     The coordinator is an admin: manages labs and is the ONLY one who assigns / removes lab heads.
   • Inside a lab there are two levels: head (lead / co_lead) and member (any other position).
     Only heads manage the lab: info, members, projects, events. Everyone else is read-only.
   • Profile: faculty, group / department, photo.
   • "Academic / Education" category → "Courses". Startups are gone (lab startups become projects).
   • Projects and events are created by lab heads only (student submissions and Lab Head requests are closed).
   New enum values are compared as text inside functions, so the file runs in one transaction. */

/* ───────────── coordinator (server config) ───────────── */
create table if not exists public.coordinator_emails (
  email text primary key check (email = lower(email))
);
alter table public.coordinator_emails enable row level security;
revoke all on public.coordinator_emails from anon, authenticated;
insert into public.coordinator_emails (email) values ('230183076@sdu.edu.kz') on conflict do nothing;

create or replace function public.is_coordinator()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select exists (select 1 from public.coordinator_emails c where c.email = lower(p.email))
      from public.profiles p where p.id = auth.uid()
  ), false)
$$;

-- The coordinator gets every admin power (labs, heads, verification).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false) or public.is_coordinator()
$$;

/* ───────────── profile fields ───────────── */
alter table public.profiles add column if not exists faculty text check (char_length(faculty) <= 120);
alter table public.profiles add column if not exists group_name text check (char_length(group_name) <= 120);
alter table public.profiles add column if not exists avatar_url text check (avatar_url is null or avatar_url ~* '^https://');
grant update (faculty, group_name, avatar_url) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "Own avatar upload" on storage.objects;
drop policy if exists "Own avatar update" on storage.objects;
drop policy if exists "Own avatar delete" on storage.objects;
create policy "Own avatar upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Own avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Own avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace view public.public_people as
  select p.id, p.first_name, p.last_name, p.role::text as role, p.email, p.course, p.major, p.department, p.position, p.bio,
         p.faculty, p.group_name, p.avatar_url
    from public.profiles p;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;

/* ───────────── sign-up: type from the e-mail ───────────── */
create or replace function public.account_type_from_email(p_email text)
returns text language sql immutable as $$
  select case when split_part(lower(coalesce(p_email, '')), '@', 1) ~ '^[0-9]' then 'student' else 'teacher' end
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
  v_avatar text := coalesce(v_meta->>'avatar_url', v_meta->>'picture');
begin
  -- Industry partners (invited, e-mail sign-in) keep their type; SDU accounts get it from the e-mail.
  v_role := case when v_meta->>'role' = 'partner' and not public.is_sdu_email(new.email) then 'partner'
                 else public.account_type_from_email(new.email) end;
  if v_first is null and v_full <> '' then
    v_first := split_part(v_full, ' ', 1);
    v_last := coalesce(v_last, nullif(trim(substr(v_full, char_length(split_part(v_full, ' ', 1)) + 1)), ''));
  end if;

  insert into public.profiles (id, role, first_name, last_name, email, avatar_url)
  values (new.id, v_role::public.app_role, left(coalesce(v_first, ''), 100), left(coalesce(v_last, ''), 100),
          lower(coalesce(new.email, '')), case when v_avatar ~* '^https://' then left(v_avatar, 500) end)
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

  -- People the lab form lists by e-mail become members of that lab (positions set by the coordinator stay as they are).
  update public.lab_members m set user_id = new.id
    from public.lab_member_contacts c
   where c.member_id = m.id and c.email = lower(new.email) and m.user_id is null;
  update public.professors set profile_id = new.id where lower(email) = lower(new.email) and profile_id is null;
  return new;
end;
$$;

/* ───────────── head / member ───────────── */
-- Management rights belong to heads only.
create or replace function public.is_manager_role(p_role text)
returns boolean language sql immutable as $$
  select p_role in ('lead', 'co_lead')
$$;
update public.lab_members set can_edit = public.is_manager_role(role::text) where can_edit is distinct from public.is_manager_role(role::text);

-- Only the coordinator (admin) assigns, changes or removes heads. Heads manage members.
create or replace function public.lab_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_lab uuid := coalesce(new.lab_id, old.lab_id);
begin
  if v_uid is null or public.is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.lab_id is distinct from old.lab_id then
    raise exception 'NOT_ALLOWED: a member cannot be moved to another lab';
  end if;
  if tg_op = 'INSERT' and public.is_lab_head_role(new.role::text) then
    raise exception 'NOT_ALLOWED: only the coordinator assigns lab heads';
  end if;
  if tg_op = 'DELETE' and public.is_lab_head_role(old.role::text) then
    raise exception 'NOT_ALLOWED: only the coordinator removes lab heads';
  end if;
  if tg_op = 'UPDATE' and (public.is_lab_head_role(old.role::text) or public.is_lab_head_role(new.role::text))
     and (new.role is distinct from old.role or new.user_id is distinct from old.user_id) then
    raise exception 'NOT_ALLOWED: only the coordinator assigns or removes lab heads';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.lab_member_contacts_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null then
    update public.lab_members m set user_id = p.id
      from public.profiles p
     where m.id = new.member_id and m.user_id is null and p.email = new.email
       and not exists (select 1 from public.lab_members x where x.lab_id = m.lab_id and x.user_id = p.id)
       and (not public.is_lab_head_role(m.role::text) or auth.uid() is null or public.is_admin());
  end if;
  return new;
end;
$$;

-- Heads add registered people as members (any non-head position).
create or replace function public.add_lab_member(p_lab uuid, p_full_name text, p_email text, p_role text, p_title text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_profile public.profiles;
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if not public.is_lab_manager(p_lab) then raise exception 'NOT_ALLOWED: only the head of this lab can add members'; end if;
  if coalesce(p_role, 'member') not in ('member', 'mentor', 'research_assistant', 'student_researcher', 'project_coordinator') then
    raise exception 'BAD_ROLE: heads are assigned by the coordinator';
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
          coalesce(p_role, 'member')::public.lab_role,
          coalesce((select max(sort_order) + 1 from public.lab_members where lab_id = p_lab), 0))
  returning id into v_id;
  insert into public.lab_member_contacts (member_id, email) values (v_id, v_email)
  on conflict (member_id) do update set email = excluded.email;
  return jsonb_build_object('id', v_id, 'linked', true);
end;
$$;

/* ───────────── coordinator tools ───────────── */
create or replace function public.admin_create_lab(p_name text, p_focus text[] default '{}')
returns public.labs language plpgsql security definer set search_path = public as $$
declare v_slug text; v_base text; n int := 1; v_row public.labs;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED: coordinator only'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'NAME_REQUIRED: enter the lab name'; end if;
  v_base := left(trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g')), 50);
  if v_base !~ '^[a-z0-9][a-z0-9-]{1,}$' then v_base := 'lab-' || substr(md5(p_name), 1, 6); end if;
  v_slug := v_base;
  while exists (select 1 from public.labs where slug = v_slug) loop
    n := n + 1; v_slug := v_base || '-' || n;
  end loop;
  insert into public.labs (slug, name, focus) values (v_slug, left(trim(p_name), 120), coalesce(p_focus, '{}')) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.assign_lab_head(p_lab uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_member uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED: only the coordinator assigns lab heads'; end if;
  if not exists (select 1 from public.labs where id = p_lab) then raise exception 'NOT_FOUND: lab'; end if;
  select coalesce(nullif(trim(first_name || ' ' || last_name), ''), email) into v_name from public.profiles where id = p_user;
  if v_name is null then raise exception 'NOT_FOUND: user'; end if;
  select id into v_member from public.lab_members where lab_id = p_lab and user_id = p_user;
  if v_member is not null then
    update public.lab_members set role = 'lead' where id = v_member;
  else
    insert into public.lab_members (lab_id, user_id, full_name, role, sort_order) values (p_lab, p_user, left(v_name, 120), 'lead', -1);
  end if;
end;
$$;

-- Removing a head keeps the person in the lab as a member.
create or replace function public.remove_lab_head(p_lab uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED: only the coordinator removes lab heads'; end if;
  update public.lab_members set role = 'member' where lab_id = p_lab and user_id = p_user and public.is_lab_head_role(role::text);
  if not found then raise exception 'NOT_FOUND: this person is not a head of the lab'; end if;
end;
$$;

-- Lab Head requests are replaced by the coordinator's assignment.
create or replace function public.request_lab_head(p_lab uuid, p_position text default 'lead', p_note text default null)
returns public.lab_head_requests language plpgsql security definer set search_path = public as $$
begin
  raise exception 'NOT_ALLOWED: lab heads are assigned by the SITAM coordinator';
end;
$$;

/* ───────────── categories, projects, events ───────────── */
update public.labs set focus = array_replace(focus, 'Academic / Education', 'Courses') where 'Academic / Education' = any(focus);
update public.projects set kind = 'project' where kind::text = 'startup' and lab_id is not null;

create or replace function public.submit_project(
  p_kind text, p_title text, p_summary text, p_tags text[], p_authors text[], p_year int, p_status text,
  p_github_url text, p_demo_url text, p_paper_url text, p_contact_email text
) returns public.projects language plpgsql security definer set search_path = public as $$
begin
  raise exception 'NOT_ALLOWED: projects are added by lab heads on their lab page';
end;
$$;

-- Events belong to labs and are managed by their heads (and the coordinator).
create or replace function public.can_manage_event(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.event_hosts h where h.event_id = p_event and h.lab_id is not null and public.is_lab_manager(h.lab_id))
$$;

create or replace function public.save_event(
  p_id uuid, p_kind public.event_kind, p_title text, p_description text, p_starts_at timestamptz, p_room text,
  p_speaker text, p_speaker_role text, p_capacity int, p_lab_ids uuid[], p_company_ids uuid[], p_project_ids uuid[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; x uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_admin() then
    if coalesce(cardinality(p_lab_ids), 0) = 0 then raise exception 'NO_HOST: choose the lab that runs the event'; end if;
    if coalesce(cardinality(p_company_ids), 0) + coalesce(cardinality(p_project_ids), 0) > 0 then
      raise exception 'NOT_ALLOWED: events are hosted by labs';
    end if;
  end if;
  foreach x in array coalesce(p_lab_ids, '{}') loop
    if not public.is_lab_manager(x) then raise exception 'NOT_ALLOWED: only heads of the lab can publish its events'; end if;
  end loop;

  if p_id is null then
    insert into public.events (kind, title, description, starts_at, room, speaker, speaker_role, capacity, organizer_id)
    values (p_kind, trim(p_title), coalesce(p_description, ''), p_starts_at, coalesce(nullif(trim(p_room), ''), 'C1.2'), p_speaker, p_speaker_role, coalesce(p_capacity, 60), auth.uid())
    returning id into v_id;
  else
    if not public.can_manage_event(p_id) then raise exception 'NOT_ALLOWED: only heads of the hosting lab can edit this event'; end if;
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

/* ───────────── my_context: + coordinator ───────────── */
create or replace function public.my_context()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'is_staff', public.is_staff(),
    'is_admin', public.is_admin(),
    'is_coordinator', public.is_coordinator(),
    'managed_labs', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'slug', l.slug, 'name', l.name, 'role', m.role) order by l.name)
      from public.lab_members m join public.labs l on l.id = m.lab_id
      where m.user_id = auth.uid() and m.can_edit), '[]'::jsonb),
    'lab_memberships', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'slug', l.slug, 'name', l.name, 'role', m.role, 'title', m.title,
                                          'can_edit', m.can_edit, 'is_head', public.is_lab_head_role(m.role::text)) order by l.name)
      from public.lab_members m join public.labs l on l.id = m.lab_id
      where m.user_id = auth.uid() and m.role::text <> 'former_lead'), '[]'::jsonb),
    'lab_head_requests', '[]'::jsonb,
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'verified', c.verified) order by c.name)
      from public.company_members cm join public.companies c on c.id = cm.company_id
      where cm.user_id = auth.uid()), '[]'::jsonb),
    'professor', (select jsonb_build_object('username', username, 'full_name', full_name) from public.professors where profile_id = auth.uid() limit 1),
    'saved_labs', coalesce((select jsonb_agg(lab_id) from public.saved_labs where user_id = auth.uid()), '[]'::jsonb),
    'pending_moderation', 0,
    'pending_lab_heads', 0
  )
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_create_lab(text, text[])', 'assign_lab_head(uuid, uuid)', 'remove_lab_head(uuid, uuid)',
    'add_lab_member(uuid, text, text, text, text)', 'my_context()', 'is_coordinator()'
  ] loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
