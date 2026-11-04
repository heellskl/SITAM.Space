/* SITAM SPACE v32 — Akniyet Mussakhan (akniyet.mussakhan@sdu.edu.kz) is Co-Head of the Analysis lab (asked by the user 2026-11-04).
   Same steps as the v29 lab leads: his Co-Head seat gets his e-mail, an account with the first password SduLab2026!
   is created if he has none (he sets his own at the first sign-in), the seat is linked and confirmed. Safe to run more than once. */
insert into sitam_meta.lab_leads_2026 (slug, full_name, email, first_name, last_name, ord, name_like) values
  ('analysis', 'Akniyet Mussakhan', 'akniyet.mussakhan@sdu.edu.kz', 'Akniyet', 'Mussakhan', 2, 'Mussakhan')
on conflict (slug, email) do update set full_name = excluded.full_name, ord = excluded.ord, name_like = excluded.name_like;

-- a) the head seat in each lab: the existing head row of that person (same e-mail, or the surname in the name), else a new one
do $$ declare r record; v_lab uuid; v_member uuid; begin
  for r in select * from sitam_meta.lab_leads_2026 where email = 'akniyet.mussakhan@sdu.edu.kz' order by slug, ord loop
    select id into v_lab from public.labs where slug = r.slug;
    continue when v_lab is null;
    v_member := null;
    select m.id into v_member from public.lab_members m left join public.lab_member_contacts c on c.member_id = m.id
     where m.lab_id = v_lab and m.role::text <> 'former_lead'
       and (lower(c.email) = r.email or m.full_name ilike '%' || r.name_like || '%')
     order by (lower(c.email) = r.email) desc nulls last limit 1;
    if v_member is null then
      insert into public.lab_members (lab_id, full_name, role, sort_order)
      values (v_lab, r.full_name, (case when r.ord = 1 then 'lead' else 'co_lead' end)::public.lab_role, 0)
      returning id into v_member;
    else
      update public.lab_members set role = (case when r.ord = 1 then 'lead' else 'co_lead' end)::public.lab_role
       where id = v_member and not public.is_lab_head_role(role::text);
    end if;
    insert into public.lab_member_contacts (member_id, email) values (v_member, r.email)
      on conflict (member_id) do update set email = excluded.email;
  end loop;
end $$;

-- b) accounts: created only when there is no account with that e-mail yet (first password SduLab2026!, changed at first sign-in)
do $$ declare r record; v_id uuid; begin
  for r in select distinct on (email) email, first_name, last_name from sitam_meta.lab_leads_2026 where email = 'akniyet.mussakhan@sdu.edu.kz' order by email loop
    if not exists (select 1 from auth.users where lower(email) = r.email) then
      v_id := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', r.email,
              extensions.crypt('SduLab2026!', extensions.gen_salt('bf')), now(),
              jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
              jsonb_build_object('role', 'teacher', 'first_name', r.first_name, 'last_name', r.last_name),
              now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', r.email, 'email_verified', true),
              'email', now(), now(), now());
      update public.profiles set must_change_password = true where id = v_id;
    end if;
  end loop;
end $$;

-- c) link every lead seat to the account with that e-mail, and close the matching confirmation requests
update public.lab_members m set user_id = p.id
  from public.lab_member_contacts c, sitam_meta.lab_leads_2026 l, public.profiles p, public.labs lb
 where c.member_id = m.id and lower(c.email) = l.email and lower(p.email) = l.email
   and lb.id = m.lab_id and lb.slug = l.slug and m.user_id is null and l.email = 'akniyet.mussakhan@sdu.edu.kz'
   and not exists (select 1 from public.lab_members o where o.lab_id = m.lab_id and o.user_id = p.id);
update public.account_claims a set status = 'approved', decided_at = now()
  from public.lab_members m where m.id = a.member_id and m.user_id = a.user_id and a.status = 'pending';
