/* SITAM SPACE v17.1 — member positions stay as before (no Tech lead / Student lead for heads to add).
   Heads add: member, mentor, research assistant, student researcher, project coordinator; the Head (and the
   coordinator) also appoint Co-Heads. Re-runnable. */
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
  elsif v_role not in ('member', 'mentor', 'research_assistant', 'student_researcher', 'project_coordinator') then
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
