/* SITAM SPACE v17.2 — link a researcher page (or a lab seat) by the personal e-mail
   ─────────────────────────────────────────────────────────────────────────────
   A researcher's papers may carry an older e-mail (a previous university) instead of the SDU one.
   • professors.alt_emails: other known e-mails of the researcher (private: no column grant to the site).
   • When someone adds a personal e-mail in Profile → Settings that matches a researcher page (email or alt_emails)
     or a lab seat, an account claim is created — the same as at sign-up with a listed e-mail. The coordinator
     confirms it in Admin → "Accounts to confirm"; the e-mail itself is not proven, so nothing is linked before that.
   • account_claims.matched_email: which e-mail matched (shown to the coordinator).
   Re-runnable. */

alter table public.professors add column if not exists alt_emails text[] not null default '{}';
alter table public.account_claims add column if not exists matched_email text;

-- Amine Sbai: e-mails on his papers (Hassan First University of Settat, University of Granada)
update public.professors set alt_emails = array['a.sbai@uhp.ac.ma', 'asbai@correo.ugr.es']
 where username = 'amine.sbai';

/* claims for one account and one e-mail (sign-up e-mail or personal e-mail) */
create or replace function public.create_account_claims(p_user uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if p_user is null or v_email is null then return; end if;
  insert into public.account_claims (user_id, kind, member_id, matched_email)
  select p_user, 'lab_seat', m.id, v_email
    from public.lab_members m join public.lab_member_contacts c on c.member_id = m.id
   where lower(c.email) = v_email and m.user_id is null and m.role::text <> 'former_lead'
  on conflict do nothing;
  insert into public.account_claims (user_id, kind, professor_id, matched_email)
  select p_user, 'professor', pr.id, v_email from public.professors pr
   where pr.profile_id is null
     and (lower(pr.email) = v_email or v_email = any (select lower(x) from unnest(pr.alt_emails) x))
  on conflict do nothing;
end;
$$;
revoke execute on function public.create_account_claims(uuid, text) from anon, authenticated, public;

/* sign-up: profile first, then claims for the sign-up e-mail (rest of handle_new_user unchanged from v17) */
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
    when v_meta->>'role' in ('teacher', 'professor') and public.is_sdu_email(new.email) then 'teacher'
    when v_meta->>'role' in ('student', 'phd') and public.is_sdu_email(new.email) then 'student'
    else public.account_type_from_email(new.email)
  end;
  if v_first is null and v_full <> '' then
    v_first := split_part(v_full, ' ', 1);
    v_last := coalesce(v_last, nullif(trim(substr(v_full, char_length(split_part(v_full, ' ', 1)) + 1)), ''));
  end if;

  insert into public.profiles (id, role, first_name, last_name, email, course, major, department, position, phone)
  values (
    new.id, v_role::public.app_role,
    left(coalesce(v_first, ''), 100), left(coalesce(v_last, ''), 100),
    lower(coalesce(new.email, '')),
    case when v_role = 'student' and v_meta->>'course' ~ '^[1-6]$' then (v_meta->>'course')::smallint end,
    case when v_role = 'student' then nullif(left(v_meta->>'major', 100), '') end,
    case when v_role = 'teacher' then nullif(left(v_meta->>'department', 100), '') end,
    case when v_role = 'partner' then nullif(left(v_meta->>'position', 100), '') end,
    case when v_meta->>'phone' ~ '^[0-9 +()-]{6,24}$' then v_meta->>'phone' end
  )
  on conflict (id) do nothing;

  if v_role = 'partner' and v_company_name is not null then
    select id into v_company from public.companies where lower(name) = lower(v_company_name);
    if v_company is null then
      insert into public.companies (name, website)
      values (v_company_name, case when v_meta->>'website' ~* '^https?://' then left(v_meta->>'website', 200) end)
      returning id into v_company;
      insert into public.company_members (company_id, user_id, role, status)
      values (v_company, new.id, 'owner', 'active')
      on conflict do nothing;
    else
      insert into public.company_members (company_id, user_id, role, status)
      values (v_company, new.id, 'member', 'pending')
      on conflict do nothing;
    end if;
  end if;

  perform public.create_account_claims(new.id, new.email);
  return new;
end;
$$;

/* Profile → Settings: a new personal e-mail can also match a researcher page or a lab seat */
create or replace function public.profiles_personal_email_claims()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.personal_email is not null and new.personal_email is distinct from old.personal_email then
    perform public.create_account_claims(new.id, new.personal_email);
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_personal_email_claims on public.profiles;
create trigger profiles_personal_email_claims after update of personal_email on public.profiles
  for each row execute function public.profiles_personal_email_claims();

/* the coordinator sees which e-mail matched */
drop function if exists public.account_claims_inbox();
create function public.account_claims_inbox()
returns table (id uuid, kind text, status text, created_at timestamptz, user_id uuid, first_name text, last_name text,
               email text, role text, target text, target_detail text, lab_slug text, professor_username text, matched_email text)
language sql stable security definer set search_path = public as $$
  select c.id, c.kind, c.status, c.created_at, p.id, p.first_name, p.last_name, p.email, p.role::text,
         coalesce(l.name, pr.full_name),
         case when c.kind = 'lab_seat' then m.full_name || ' · ' || initcap(replace(m.role::text, '_', ' ')) else 'Researcher page' end,
         l.slug, pr.username, c.matched_email
    from public.account_claims c
    join public.profiles p on p.id = c.user_id
    left join public.lab_members m on m.id = c.member_id
    left join public.labs l on l.id = m.lab_id
    left join public.professors pr on pr.id = c.professor_id
   where public.is_coordinator() and c.status = 'pending'
   order by c.created_at desc
$$;
revoke execute on function public.account_claims_inbox() from anon, public;
grant execute on function public.account_claims_inbox() to authenticated;
