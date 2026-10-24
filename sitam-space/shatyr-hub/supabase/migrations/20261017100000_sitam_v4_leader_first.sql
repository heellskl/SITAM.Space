/* SITAM SPACE v4 — leader-first labs
   ─────────────────────────────────────────────────────────────
   • Lab positions are separate from the platform role: a Student can be a Project
     Coordinator inside one lab. New positions: student_researcher, project_coordinator.
   • Management rights (lab_members.can_edit) follow the position and nothing else:
     lead · co_lead · student_lead · deputy_student_lead. Clients can no longer write
     can_edit, user_id or lab_id directly (column grants).
   • Only the lab lead / co-lead (or an admin) can add, change or remove lead / co-lead
     positions, or link an account to them. Student leads manage everyone else.
   • A manager cannot remove or demote themselves when nobody else could manage the lab.
   • Labs get "skills", a public contact e-mail and a first-setup marker.
   • my_context() also returns every lab the user belongs to (lab_memberships).
   • add_lab_member(): add a person by name and SDU e-mail; links the account if it exists.
   New enum values are compared as text inside functions, so the file runs in one transaction. */

alter type public.lab_role add value if not exists 'student_researcher';
alter type public.lab_role add value if not exists 'project_coordinator';

/* ───────────── labs: skills, contact, setup ───────────── */
alter table public.labs add column if not exists skills text[] not null default '{}';
alter table public.labs add column if not exists contact_email text
  check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.labs add column if not exists setup_completed_at timestamptz;

/* ───────────── helpers ───────────── */
create or replace function public.is_lab_head_role(p_role text)
returns boolean language sql immutable as $$
  select p_role in ('lead', 'co_lead')
$$;

create or replace function public.is_manager_role(p_role text)
returns boolean language sql immutable as $$
  select p_role in ('lead', 'co_lead', 'student_lead', 'deputy_student_lead')
$$;

-- Lab lead / co-lead with a linked account (or admin): may manage the head positions.
create or replace function public.is_lab_head(p_lab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.lab_members m
     where m.lab_id = p_lab and m.user_id = auth.uid() and public.is_lab_head_role(m.role::text)
  )
$$;

/* ───────────── can_edit follows the position ───────────── */
create or replace function public.lab_members_defaults()
returns trigger language plpgsql as $$
declare v_trusted boolean := auth.uid() is null or public.is_admin();
begin
  if tg_op = 'INSERT' then
    if public.is_manager_role(new.role::text) then new.can_edit := true;
    elsif not v_trusted then new.can_edit := false;
    end if;
  elsif new.role is distinct from old.role then
    new.can_edit := public.is_manager_role(new.role::text);
  elsif new.can_edit is distinct from old.can_edit and not v_trusted then
    new.can_edit := old.can_edit;   -- only admins / migrations grant rights outside a position
  end if;
  if new.role::text = 'former_lead' then new.can_edit := false; end if;
  return new;
end;
$$;

/* ───────────── hierarchy guard (runs for every write path: editor, RPCs, triggers) ───────────── */
create or replace function public.lab_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_lab uuid := coalesce(new.lab_id, old.lab_id);
  v_head boolean;
begin
  -- sign-up linking, migrations and admins are trusted
  if v_uid is null or public.is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_head := public.is_lab_head(v_lab);

  if tg_op = 'UPDATE' and new.lab_id is distinct from old.lab_id then
    raise exception 'NOT_ALLOWED: a member cannot be moved to another lab';
  end if;

  -- lead / co-lead rows are protected from everyone below them
  if not v_head then
    if tg_op = 'DELETE' and public.is_lab_head_role(old.role::text) then
      raise exception 'NOT_ALLOWED: only the lab lead or co-lead can remove a lead position';
    end if;
    if tg_op = 'INSERT' and public.is_lab_head_role(new.role::text) then
      raise exception 'NOT_ALLOWED: only the lab lead or co-lead can assign a lead position';
    end if;
    if tg_op = 'UPDATE' and (public.is_lab_head_role(old.role::text) or public.is_lab_head_role(new.role::text))
       and (new.role, new.full_name, new.title, new.term, new.user_id) is distinct from (old.role, old.full_name, old.title, old.term, old.user_id) then
      raise exception 'NOT_ALLOWED: only the lab lead or co-lead can change a lead position';
    end if;
  end if;

  -- never leave a lab without anyone who can manage it
  if tg_op in ('DELETE', 'UPDATE') and old.user_id = v_uid and old.can_edit
     and (tg_op = 'DELETE' or not public.is_manager_role(new.role::text))
     and not exists (select 1 from public.lab_members m
                      where m.lab_id = v_lab and m.id <> old.id and m.user_id is not null and m.can_edit) then
    raise exception 'LAST_MANAGER: give another member a lead position before you step down';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists lab_members_guard on public.lab_members;
create trigger lab_members_guard before insert or update or delete on public.lab_members
  for each row execute function public.lab_members_guard();

-- Contact e-mails link existing accounts — but a student lead cannot link someone to a lead position.
create or replace function public.lab_member_contacts_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null then
    update public.lab_members m set user_id = p.id
      from public.profiles p
     where m.id = new.member_id and m.user_id is null and p.email = new.email
       and not exists (select 1 from public.lab_members x where x.lab_id = m.lab_id and x.user_id = p.id)
       and (not public.is_lab_head_role(m.role::text) or auth.uid() is null or public.is_lab_head(m.lab_id));
  end if;
  return new;
end;
$$;

/* ───────────── clients write only plain fields ───────────── */
revoke insert, update on public.lab_members from anon, authenticated;
grant insert (lab_id, full_name, title, role, term, sort_order) on public.lab_members to authenticated;
grant update (full_name, title, role, term, sort_order) on public.lab_members to authenticated;
grant delete on public.lab_members to authenticated;

/* ───────────── add a person (links the account when it exists) ───────────── */
create or replace function public.add_lab_member(p_lab uuid, p_full_name text, p_email text, p_role text, p_title text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_profile public.profiles;
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_id uuid;
  v_linked boolean := false;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if not public.is_lab_manager(p_lab) then raise exception 'NOT_ALLOWED: you do not manage this lab'; end if;
  if p_role is null or p_role = 'former_lead' or p_role not in
     ('lead', 'co_lead', 'student_lead', 'deputy_student_lead', 'member', 'research_assistant', 'student_researcher', 'project_coordinator') then
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
  v_linked := v_profile.id is not null;
  if v_email is not null then
    insert into public.lab_member_contacts (member_id, email) values (v_id, v_email)
    on conflict (member_id) do update set email = excluded.email;
  end if;
  return jsonb_build_object('id', v_id, 'linked', v_linked);
end;
$$;

/* ───────────── my_context: memberships for the leader-first UI ───────────── */
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
revoke execute on function public.add_lab_member(uuid, text, text, text, text) from anon, public;
grant execute on function public.add_lab_member(uuid, text, text, text, text) to authenticated;
revoke execute on function public.my_context() from anon, public;
grant execute on function public.my_context() to authenticated;
grant execute on function public.is_lab_head(uuid) to authenticated;
