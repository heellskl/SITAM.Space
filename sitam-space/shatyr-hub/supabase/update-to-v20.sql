-- SITAM SPACE — update a database that is ALREADY ON v19 to v20 (safe to run more than once).
-- Supabase → SQL Editor → New query → paste this whole file → Run.
-- v20: lab seats / researcher cards / coordinator / company membership no longer come from a typed e-mail alone,
-- sign-in with a personal e-mail, Ask SITAM fixes, researcher Amine Sbai.
-- After running it, check Admin → "Accounts to confirm" and the researcher profile requests.
create schema if not exists sitam_meta;
create table if not exists sitam_meta.applied_migrations (version text primary key, name text not null, applied_at timestamptz not null default now());

-- ════════ 20261102200000_sitam_v20_account_safety ════════
/* SITAM SPACE v20 — account safety, sign-in with a personal e-mail, Ask SITAM fixes
   ──────────────────────────────────────────────────────────────────────────────
   Since v9.5 new accounts are confirmed at once (no e-mail code), so the site cannot prove that a person owns the
   e-mail they typed (or the personal e-mail added in Profile). Nothing that gives rights may depend on an e-mail alone:

   • Lab seats listed with an e-mail are no longer linked at sign-up: an account claim is created and the coordinator
     confirms it (Admin → "Accounts to confirm", decide_account_claim).
   • Researcher cards with a matching e-mail (professors.email or professors.alt_emails) are no longer linked at
     sign-up either: a researcher profile request ("This is me", v17) is created for the coordinator.
   • The same happens when someone adds a personal e-mail in Profile → Settings that matches a seat or a card.
   • Coordinators are bound to an account (coordinator_emails.user_id). Existing coordinator accounts are bound below.
     To add a coordinator after the person has registered:
       insert into public.coordinator_emails (email) values ('name@sdu.edu.kz');      -- binds the existing account
     If the row already exists, bind it with:
       update public.coordinator_emails c set user_id = u.id from auth.users u
        where lower(u.email) = c.email and c.email = 'name@sdu.edu.kz';
   • A partner who types the name of an existing company joins it only after approval by the coordinator or an owner
     of that company (company_members.status = 'pending' → decide_company_member).
   • Students and teachers register with their SDU e-mail only. Later they may add a personal e-mail in
     Profile → Settings and sign in with it and the same password: sign_in_email(e-mail, password) returns the
     account's sign-in e-mail when the password is right. A personal e-mail can belong to one account only.
   • Ask SITAM: FAQ texts match the site; ai_refund_quota gives a question back when the assistant failed.
   Re-runnable. */

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

/* ───────────── account claims: lab seats listed with an e-mail ───────────── */
create table if not exists public.account_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_id uuid not null references public.lab_members(id) on delete cascade,
  matched_email text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
create unique index if not exists account_claims_once on public.account_claims (user_id, member_id);
alter table public.account_claims enable row level security;
drop policy if exists "Own claims and coordinator" on public.account_claims;
create policy "Own claims and coordinator" on public.account_claims for select to authenticated
  using (user_id = auth.uid() or public.is_coordinator());
revoke insert, update, delete on public.account_claims from anon, authenticated;
grant select on public.account_claims to authenticated;

/* ───────────── companies: joining an existing company needs approval ───────────── */
alter table public.company_members add column if not exists status text not null default 'active';
do $$ begin
  alter table public.company_members add constraint company_members_status_check check (status in ('active', 'pending'));
exception when duplicate_object then null; end $$;

create or replace function public.is_company_member(p_company uuid, p_require_verified boolean default true)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.company_members c join public.companies co on co.id = c.company_id
    where c.company_id = p_company and c.user_id = auth.uid() and c.status = 'active'
      and (co.verified or not p_require_verified)
  )
$$;

/* ───────────── coordinators are bound to an account ───────────── */
alter table public.coordinator_emails add column if not exists user_id uuid references auth.users(id) on delete set null;

create or replace function public.normalize_coordinator_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  -- only whoever runs this SQL (the project owner) adds coordinators, so binding the existing account here is safe
  if new.user_id is null then
    select u.id into new.user_id from auth.users u where lower(trim(u.email)) = new.email limit 1;
  end if;
  return new;
end;
$$;

update public.coordinator_emails c set user_id = u.id
  from auth.users u
 where c.user_id is null and lower(trim(u.email)) = c.email;

create or replace function public.is_coordinator()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.coordinator_emails c where c.user_id = auth.uid())
$$;

/* ───────────── personal e-mail: one account each, never someone else's sign-in e-mail ───────────── */
create index if not exists profiles_personal_email_idx on public.profiles (lower(personal_email));

create or replace function public.profiles_personal_email_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.personal_email := nullif(lower(trim(coalesce(new.personal_email, ''))), '');
  -- unchanged value (the profile form always sends it): nothing to check
  if tg_op = 'UPDATE' and new.personal_email is not distinct from nullif(lower(trim(coalesce(old.personal_email, ''))), '') then
    return new;
  end if;
  if new.personal_email is not null and new.personal_email is distinct from lower(coalesce(new.email, '')) and (
       exists (select 1 from public.profiles p where p.id <> new.id
                and (lower(p.personal_email) = new.personal_email or lower(p.email) = new.personal_email))
    or exists (select 1 from auth.users u where u.id <> new.id and lower(u.email) = new.personal_email)
  ) then
    raise exception 'EMAIL_TAKEN: this e-mail already belongs to another SITAM SPACE account' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_personal_email_guard on public.profiles;
create trigger profiles_personal_email_guard before insert or update of personal_email on public.profiles
  for each row execute function public.profiles_personal_email_guard();

create or replace function public.enforce_signup_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role text := coalesce(new.raw_user_meta_data->>'role', 'student');
begin
  -- an e-mail somebody already uses as their personal e-mail cannot become a second account
  if new.email is not null and (tg_op = 'INSERT' or lower(new.email) is distinct from lower(old.email))
     and exists (select 1 from public.profiles p where p.id <> new.id and lower(p.personal_email) = lower(trim(new.email))) then
    raise exception 'EMAIL_TAKEN: this e-mail is already used by another SITAM SPACE account' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    -- an existing SDU account may not move to a non-SDU address
    if public.is_sdu_email(old.email) and not public.is_sdu_email(new.email) then
      raise exception 'SITAM_EMAIL_DOMAIN: SDU accounts must keep an @sdu.edu.kz e-mail' using errcode = 'P0001';
    end if;
    return new;
  end if;
  -- students and teachers need an SDU e-mail; partners and alumni may use any e-mail (v17)
  if v_role in ('partner', 'alumni') or public.is_sdu_email(new.email) then
    return new;
  end if;
  raise exception 'SITAM_EMAIL_DOMAIN: students and teachers must register with an @sdu.edu.kz e-mail'
    using errcode = 'P0001';
end;
$$;

/* sign in with the personal e-mail: the site asks for the account's sign-in e-mail, then signs in as usual.
   Answers only with the right password; at most 10 tries per e-mail in 15 minutes. */
create schema if not exists sitam_meta;
create table if not exists sitam_meta.sign_in_lookups (email text not null, at timestamptz not null default now());
create index if not exists sign_in_lookups_email_at on sitam_meta.sign_in_lookups (email, at);

create or replace function public.sign_in_email(p_email text, p_password text)
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  r record;
begin
  if v_email = '' or coalesce(p_password, '') = '' then return null; end if;
  delete from sitam_meta.sign_in_lookups where at < now() - interval '1 hour';
  if (select count(*) from sitam_meta.sign_in_lookups where email = v_email and at > now() - interval '15 minutes') >= 10 then
    raise exception 'TOO_MANY: too many sign-in attempts, please wait 15 minutes' using errcode = 'P0001';
  end if;
  insert into sitam_meta.sign_in_lookups (email) values (v_email);
  for r in
    select u.email, u.encrypted_password
      from public.profiles p join auth.users u on u.id = p.id
     where lower(p.personal_email) = v_email and coalesce(u.encrypted_password, '') <> ''
  loop
    if extensions.crypt(p_password, r.encrypted_password) = r.encrypted_password then
      return lower(r.email);
    end if;
  end loop;
  return null;
end;
$$;
revoke execute on function public.sign_in_email(text, text) from public;
grant execute on function public.sign_in_email(text, text) to anon, authenticated;

/* ───────────── an e-mail that matches a lab seat or a researcher card → request for the coordinator ───────────── */
-- older e-mails of a researcher (e.g. on papers from a previous university); private: no column grant to the site
alter table public.professors add column if not exists alt_emails text[] not null default '{}';

create or replace function public.create_account_claims(p_user uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := nullif(lower(trim(coalesce(p_email, ''))), ''); v_prof public.professors;
begin
  if p_user is null or v_email is null then return; end if;
  insert into public.account_claims (user_id, member_id, matched_email)
  select p_user, m.id, v_email
    from public.lab_members m join public.lab_member_contacts c on c.member_id = m.id
   where lower(c.email) = v_email and m.user_id is null and m.role::text <> 'former_lead'
  on conflict do nothing;
  -- researcher card: the same request the teacher would send with "This is me" (one pending request per person)
  if not exists (select 1 from public.professors where profile_id = p_user)
     and not exists (select 1 from public.researcher_profile_requests where user_id = p_user and status = 'pending') then
    select * into v_prof from public.professors pr
     where pr.profile_id is null
       and (lower(pr.email) = v_email or v_email = any (select lower(x) from unnest(pr.alt_emails) x))
     order by pr.full_name limit 1;
    if v_prof.id is not null then
      insert into public.researcher_profile_requests (user_id, professor_id, full_name, title, degree, scholar_url, orcid_url, note)
      values (p_user, v_prof.id, left(v_prof.full_name, 160), left(v_prof.job_title, 160), left(v_prof.degree, 120), v_prof.scholar_url, v_prof.orcid_url,
              'Automatic: the account e-mail ' || v_email || ' matches this researcher card. E-mails are not verified — confirm it is really this person.');
    end if;
  end if;
end;
$$;
revoke execute on function public.create_account_claims(uuid, text) from anon, authenticated, public;

/* ───────────── sign-up: no rights from an unproven e-mail (v17 handle_new_user + v20 changes) ───────────── */
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
      -- a new company: unverified, this person is its owner
      insert into public.companies (name, website)
      values (v_company_name, case when v_meta->>'website' ~* '^https?://' then left(v_meta->>'website', 200) end)
      returning id into v_company;
      insert into public.company_members (company_id, user_id, role, status)
      values (v_company, new.id, 'owner', 'active')
      on conflict do nothing;
    else
      -- an existing company: only a request until the coordinator or an owner of the company approves it
      insert into public.company_members (company_id, user_id, role, status)
      values (v_company, new.id, 'member', 'pending')
      on conflict do nothing;
    end if;
  end if;

  perform public.create_account_claims(new.id, new.email);
  return new;
end;
$$;

/* Profile → Settings: a new personal e-mail can also match a lab seat or a researcher card */
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

/* ───────────── coordinator: confirm or reject lab seat claims ───────────── */
drop function if exists public.account_claims_inbox();
create function public.account_claims_inbox()
returns table (id uuid, status text, created_at timestamptz, user_id uuid, first_name text, last_name text,
               email text, role text, target text, target_detail text, lab_slug text, matched_email text)
language sql stable security definer set search_path = public as $$
  select c.id, c.status, c.created_at, p.id, p.first_name, p.last_name, p.email, p.role::text,
         l.name, m.full_name || ' · ' || initcap(replace(m.role::text, '_', ' ')), l.slug, c.matched_email
    from public.account_claims c
    join public.profiles p on p.id = c.user_id
    join public.lab_members m on m.id = c.member_id
    join public.labs l on l.id = m.lab_id
   where public.is_coordinator() and c.status = 'pending'
   order by c.created_at desc
$$;

create or replace function public.decide_account_claim(p_claim uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.account_claims; n int;
begin
  if not public.is_coordinator() then raise exception 'NOT_ALLOWED: only the SITAM coordinator confirms accounts'; end if;
  select * into c from public.account_claims where id = p_claim for update;
  if c.id is null then raise exception 'NOT_FOUND: claim'; end if;
  if c.status <> 'pending' then raise exception 'ALREADY_DECIDED: this request was already decided'; end if;
  if p_approve then
    if exists (select 1 from public.lab_members x join public.lab_members m on m.id = c.member_id
                where x.lab_id = m.lab_id and x.user_id = c.user_id) then
      raise exception 'DUPLICATE: this person is already in the lab';
    end if;
    update public.lab_members set user_id = c.user_id where id = c.member_id and user_id is null;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'TAKEN: this place is already linked to another account'; end if;
  end if;
  update public.account_claims
     set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now(), decided_by = auth.uid()
   where id = p_claim;
end;
$$;

/* ───────────── company join requests ───────────── */
create or replace function public.company_join_requests()
returns table (company_id uuid, company_name text, company_verified boolean, user_id uuid, first_name text,
               last_name text, email text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select co.id, co.name, co.verified, p.id, p.first_name, p.last_name, p.email, cm.created_at
    from public.company_members cm
    join public.companies co on co.id = cm.company_id
    join public.profiles p on p.id = cm.user_id
   where cm.status = 'pending'
     and (public.is_admin() or exists (select 1 from public.company_members o where o.company_id = cm.company_id
                                        and o.user_id = auth.uid() and o.role = 'owner' and o.status = 'active'))
   order by cm.created_at desc
$$;

create or replace function public.decide_company_member(p_company uuid, p_user uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if not (public.is_admin() or exists (select 1 from public.company_members o where o.company_id = p_company
                                        and o.user_id = auth.uid() and o.role = 'owner' and o.status = 'active')) then
    raise exception 'NOT_ALLOWED: only the coordinator or an owner of this company decides';
  end if;
  if p_approve then
    update public.company_members set status = 'active' where company_id = p_company and user_id = p_user and status = 'pending';
  else
    delete from public.company_members where company_id = p_company and user_id = p_user and status = 'pending';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'NOT_FOUND: no pending request'; end if;
end;
$$;

/* ───────────── my_context: only active companies + what is waiting ───────────── */
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
      where cm.user_id = auth.uid() and cm.status = 'active'), '[]'::jsonb),
    'pending_companies', coalesce((
      select jsonb_agg(c.name order by c.name)
      from public.company_members cm join public.companies c on c.id = cm.company_id
      where cm.user_id = auth.uid() and cm.status = 'pending'), '[]'::jsonb),
    'pending_claims', coalesce((
      select jsonb_agg(l.name order by ac.created_at)
      from public.account_claims ac
      join public.lab_members m on m.id = ac.member_id join public.labs l on l.id = m.lab_id
      where ac.user_id = auth.uid() and ac.status = 'pending'), '[]'::jsonb),
    'professor', (select jsonb_build_object('username', username, 'full_name', full_name) from public.professors where profile_id = auth.uid() limit 1),
    'saved_labs', coalesce((select jsonb_agg(lab_id) from public.saved_labs where user_id = auth.uid()), '[]'::jsonb),
    'pending_moderation', case when public.is_admin()
      then (select count(*) from public.projects where moderation = 'pending' and owner_id is not null) else 0 end,
    'pending_lab_heads', 0
  )
$$;

revoke execute on function public.account_claims_inbox(), public.decide_account_claim(uuid, boolean),
  public.company_join_requests(), public.decide_company_member(uuid, uuid, boolean), public.my_context() from anon, public;
grant execute on function public.account_claims_inbox(), public.decide_account_claim(uuid, boolean),
  public.company_join_requests(), public.decide_company_member(uuid, uuid, boolean), public.my_context() to authenticated;

/* ───────────── Ask SITAM ───────────── */
-- a question goes back to the daily limit when the assistant could not answer it
create or replace function public.ai_refund_quota(p_user uuid)
returns void language sql security definer set search_path = public as $$
  update public.ai_usage set questions = greatest(0, questions - 1) where user_id = p_user and day = current_date
$$;
revoke execute on function public.ai_refund_quota(uuid) from anon, authenticated, public;
grant execute on function public.ai_refund_quota(uuid) to service_role;

-- FAQ = the FAQ page (src/lib/sitam-data.ts)
delete from public.ai_faq where question = 'How do I join a laboratory?';
insert into public.ai_faq (question, answer) values
  ('How do I become a lab head?', 'Lab heads are assigned by the SITAM coordinator. Register and sign in once, then ask the coordinator to assign you to your lab. A student or a teacher can be a lab head; your account type does not change.'),
  ('How is my account type set?', 'You choose it when you register: Student, Teacher or Industry partner. Students and teachers must register with their SDU e-mail; partners register with their company e-mail.'),
  ('How do I join a lab?', 'A lab head can add you to the lab after you have signed in at least once. Labs also post Lab cases and Research cases on the Industry page: apply there with the CV from your profile (you can upload another PDF for one application). Lab heads review applications in Manage → Applications.'),
  ('My e-mail is listed in a lab team or on a researcher page. Why am I not linked yet?', 'After you register, the SITAM coordinator confirms that the account is really yours. Then your place in the lab or your researcher page is linked to your account.'),
  ('How do I register and sign in?', 'Open Register, choose Student, Teacher or Industry partner, fill in the form and you are signed in right away. Students and teachers register with their SDU e-mail. Later you can add a personal e-mail in Profile → Settings and sign in with it and the same password. Forgot the password? Use “E-mail me a sign-in link” on the Sign in page.'),
  ('I am a teacher. How do I offer a topic or position to students?', 'After the SITAM office verifies your account, open your profile → “Post an opportunity”. It appears on the Industry page automatically, and you see every applicant with contacts and CV in Manage → Applications.'),
  ('Where do lab events, projects and vacancies appear?', 'Everywhere at once. When a lab head adds an event, a project or a vacancy on the lab page, it automatically shows up in Events, in Labs → Projects or on the Industry page.'),
  ('How do lab heads update their lab page and projects?', 'Open your lab on the Labs page: Edit lab, Manage members and the publishing buttons appear only for its heads.'),
  ('When and where are the events?', 'Every SDU event, competition and hackathon is on the Events page with its date, time and room. An event can be hosted by several labs, companies or projects together. Register in one click to get a QR ticket.')
on conflict (question) do update set answer = excluded.answer;

insert into sitam_meta.applied_migrations (version, name) values ('20261102200000', 'sitam_v20_account_safety') on conflict do nothing;

-- ════════ 20261102200100_sitam_v20_1_researcher_amine_sbai ════════
-- SITAM SPACE v20.1 — researcher Amine Sbai (Statistics lab head): profile + 7 Scopus papers with citations
-- (Scopus author page 57223768105, 2026-10-30: 18 citations, h-index 3) and his older e-mails from the papers.
-- Generated with scripts/build-seed.mjs. Re-runnable.

-- Amine Sbai
insert into public.professors (username, first_name, last_name, full_name, job_title, degree, email, photo_url, orcid_url, scopus_id, scholar_url,
  h_index, i10_index, total_citations, total_works, keywords, topics)
values ('amine.sbai', 'Amine', 'Sbai', 'Amine Sbai', 'Assistant Professor SDU', 'PhD', null,
  null, 'https://orcid.org/0000-0003-0639-4584', '57223768105', 'https://scholar.google.com/citations?user=Mr3jVPgAAAAJ&hl=en',
  3, 0, 18, 7,
  array['control theory', 'controllability', 'degenerate/singular equations', 'parabolic equations', 'wave equations', 'stabilization', 'moment method', 'B-splines']::text[], '[]'::jsonb)
on conflict (username) do update set first_name = excluded.first_name, last_name = excluded.last_name, full_name = excluded.full_name,
  job_title = excluded.job_title, degree = excluded.degree, email = excluded.email, photo_url = coalesce(excluded.photo_url, public.professors.photo_url),
  orcid_url = excluded.orcid_url, scopus_id = excluded.scopus_id, scholar_url = excluded.scholar_url, h_index = excluded.h_index,
  i10_index = excluded.i10_index, total_citations = excluded.total_citations, total_works = excluded.total_works,
  keywords = excluded.keywords, topics = excluded.topics, updated_at = now();
update public.professors set alt_emails = array['a.sbai@uhp.ac.ma', 'asbai@correo.ugr.es']::text[] where username = 'amine.sbai';
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Boundary controllability for a coupled system of parabolic equations with singular potentials', 2022, 'Article', 'https://doi.org/10.1007/s00030-022-00792-1', 'Nonlinear Differential Equations and Applications NoDEA',
  'Springer Nature', 1, false, 'https://www.scopus.com/pages/publications/85134416991?origin=resultslist', '2-s2.0-85134416991', array['controllability', 'singular parabolic systems', 'biorthogonal families', 'spectral analysis', 'moment method']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-85134416991');
update public.publications set citations = 1, keywords = array['controllability', 'singular parabolic systems', 'biorthogonal families', 'spectral analysis', 'moment method']::text[] where scopus_eid = '2-s2.0-85134416991';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'amine.sbai') from public.publications where scopus_eid = '2-s2.0-85134416991' on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Boundary controllability for a coupled system of degenerate/singular parabolic equations', 2022, 'Article', 'https://doi.org/10.3934/eect.2021055', 'Evolution Equations and Control Theory',
  'American Institute of Mathematical Sciences (AIMS)', 9, true, 'https://www.scopus.com/pages/publications/85136269035?origin=resultslist', '2-s2.0-85136269035', array['boundary controllability', 'coupled systems', 'degenerate parabolic equations', 'singular potentials', 'moment method']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-85136269035');
update public.publications set citations = 9, keywords = array['boundary controllability', 'coupled systems', 'degenerate parabolic equations', 'singular potentials', 'moment method']::text[] where scopus_eid = '2-s2.0-85136269035';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'amine.sbai') from public.publications where scopus_eid = '2-s2.0-85136269035' on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Stabilization for degenerate equations with drift and small singular term', 2025, 'Article', 'https://doi.org/10.1002/mma.10593', 'Mathematical Methods in the Applied Sciences',
  'Wiley', 3, true, 'https://www.scopus.com/pages/publications/105001208070?origin=resultslist', '2-s2.0-105001208070', array['degenerate wave equation', 'singular potentials', 'drift', 'stabilization', 'exponential decay']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-105001208070');
update public.publications set citations = 3, keywords = array['degenerate wave equation', 'singular potentials', 'drift', 'stabilization', 'exponential decay']::text[] where scopus_eid = '2-s2.0-105001208070';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'amine.sbai') from public.publications where scopus_eid = '2-s2.0-105001208070' on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Boundary Controllability for Degenerate/Singular Hyperbolic Equations in Nondivergence Form with Drift', 2025, 'Article', 'https://doi.org/10.1007/s00245-025-10236-8', 'Applied Mathematics and Optimization',
  'Springer Nature', 5, true, 'https://www.scopus.com/pages/publications/86000079821?origin=resultslist', '2-s2.0-86000079821', array['boundary controllability', 'degenerate hyperbolic equations', 'drift term', 'singular potentials']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-86000079821');
update public.publications set citations = 5, keywords = array['boundary controllability', 'degenerate hyperbolic equations', 'drift term', 'singular potentials']::text[] where scopus_eid = '2-s2.0-86000079821';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'amine.sbai') from public.publications where scopus_eid = '2-s2.0-86000079821' on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Controllability for a 2×2 nonlinear degenerate parabolic system via one boundary control force', 2025, 'Article', null, 'Evolution Equations and Control Theory',
  'American Institute of Mathematical Sciences (AIMS)', 0, true, 'https://www.scopus.com/pages/publications/105011701124?origin=resultslist', '2-s2.0-105011701124', array['boundary controllability', 'nonlinear systems', 'degenerate parabolic equations', 'moment method']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-105011701124');
update public.publications set citations = 0, keywords = array['boundary controllability', 'nonlinear systems', 'degenerate parabolic equations', 'moment method']::text[] where scopus_eid = '2-s2.0-105011701124';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'amine.sbai') from public.publications where scopus_eid = '2-s2.0-105011701124' on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Minimal time of the pointwise controllability for a degenerate/singular parabolic equation and related numerical results via B-splines', 2026, 'Article', 'https://doi.org/10.1016/j.cam.2025.116892', 'Journal of Computational and Applied Mathematics',
  'Elsevier', 0, true, 'https://www.scopus.com/pages/publications/105010688022?origin=resultslist', '2-s2.0-105010688022', array['controllability', 'pointwise control', 'minimal null control time', 'moment method', 'B-splines']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-105010688022');
update public.publications set citations = 0, keywords = array['controllability', 'pointwise control', 'minimal null control time', 'moment method', 'B-splines']::text[] where scopus_eid = '2-s2.0-105010688022';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'amine.sbai') from public.publications where scopus_eid = '2-s2.0-105010688022' on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Degenerate/singular beam-type equations: a controllability result', 2026, 'Article', null, 'Mathematical Control and Related Fields',
  'American Institute of Mathematical Sciences (AIMS)', 0, true, 'https://www.scopus.com/pages/publications/105032821750?origin=resultslist', '2-s2.0-105032821750', array['beam equation', 'degenerate equations', 'singular potentials', 'controllability']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-105032821750');
update public.publications set citations = 0, keywords = array['beam equation', 'degenerate equations', 'singular potentials', 'controllability']::text[] where scopus_eid = '2-s2.0-105032821750';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'amine.sbai') from public.publications where scopus_eid = '2-s2.0-105032821750' on conflict do nothing;

insert into sitam_meta.applied_migrations (version, name) values ('20261102200100', 'sitam_v20_1_researcher_amine_sbai') on conflict do nothing;

-- ════════ 20261102200200_sitam_v20_2_researcher_alaanzy ════════
-- SITAM SPACE v20.2 — researcher Mohammed Alaa Ala'anzy (username m.al-hadeethi): Scopus author 59193748300
-- (Scopus author page, 2026-11-02: 49 documents, 571 citations, h-index 14). Papers are matched by title (no EIDs in the copy).
-- The citations of "Range wise busy checking…" (21) = 571 total − 550 of the other 48 papers. Re-runnable.
update public.professors set scopus_id = '59193748300', orcid_url = 'https://orcid.org/0000-0002-0005-7037',
  total_works = 49, total_citations = 571, h_index = 14, i10_index = 16, updated_at = now()
 where username = 'm.al-hadeethi';
drop table if exists sitam_meta.v_alaa;
create schema if not exists sitam_meta;
create table sitam_meta.v_alaa (title text, year int, type text, venue text, citations int, oa boolean);
insert into sitam_meta.v_alaa values
('Zero trust architecture for industry 5.0 and industrial IoT: A systematic review, taxonomy, and research roadmap', 2026, 'Review', 'Computer Networks', 0, false),
('End-to-end optimization based on residual neural networks for improved optical fiber communication', 2026, 'Article', 'ICT Express', 1, true),
('Connect-4 AI: A Comprehensive Taxonomy and Critical Review of Methods and Metrics', 2026, 'Review', 'Symmetry', 3, true),
('Performance evaluation of GPU-based parallel sorting algorithms', 2026, 'Article', 'PLOS ONE', 3, true),
('Privacy Leakage in Blockchain-Based Healthcare Systems: A Layered Taxonomy and Systematic Review', 2026, 'Review', 'IEEE Internet of Things Journal', 0, false),
('Solver-Integrated Deformation-Aware BVH Updates for Real-Time Soft-Body Simulation', 2026, 'Article', 'IEEE Transactions on Visualization and Computer Graphics', 0, false),
('Throughput and Latency Benchmarking of Backend Web Frameworks Under Resource-Constrained Environments', 2026, 'Conference paper', 'International Conference on Electrical, Computer, and Energy Technologies, ICECET 2026', 0, false),
('An Empirical Evaluation of LLM Function Calling in Enterprise Backend Systems: Latency, Reliability, and Development Trade-offs', 2026, 'Conference paper', 'International Conference on Electrical, Computer, and Energy Technologies, ICECET 2026', 0, false),
('PM2.5 Forecasting in Almaty: A Benchmarking of Advanced Deep Learning and Hybrid Models', 2026, 'Conference paper', '2026 11th International Conference on Information and Network Technologies, ICINT 2026', 0, false),
('In-Place Sorting Algorithms: A Comparative Analysis', 2026, 'Conference paper', '2026 11th International Conference on Information and Network Technologies, ICINT 2026', 0, false),
('Federated Learning Strategies for Fine-Tuning Large Language Models: A Systematic Literature Review', 2026, 'Conference paper', '2026 11th International Conference on Information and Network Technologies, ICINT 2026', 1, false),
('Autoencoder-Based Resnet Block for Laser Phase Noise in Optical Communications', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('Personalized Federated Learning for Sovereign Personal AI Agents: A Review', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 1, false),
('Interference-Aware Peak Localization in OTFS-Based Radar Sensing', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('A Blockchain-Integrated Confidence-Weighted Fusion Model for Diagnosing the Stages of Thyroid Cancer', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('Interoperability Challenges in Wearable Iot for Healthcare with Federated Learning: A Review', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 1, false),
('OFDM in Fiber Optical Communication Systems: Challenges and Mitigation Techniques', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('A Performance and Scalability Evaluation of Monolithic (Django) vs. Microservice (FastAPI) Architectures for Asynchronous API Workloads in Python', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('A Performance Evaluation of Flask (WSGI) and Fastapi (ASGI) under High-Concurrency Workloads', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 1, false),
('A Review on Deep Learning Autoencoder in the Design of Next-Generation Communication Systems', 2026, 'Review', 'IEEE Open Journal of the Communications Society', 8, true),
('Incident-aware smart prioritization framework for penetration testing and prevention of URL-based cybersecurity attacks in industry 4.0 IoT networks', 2025, 'Article', 'Scientific Reports', 6, true),
('Real time smart parking system based on IoT and fog computing evaluated through a practical case study', 2025, 'Article', 'Scientific Reports', 7, true),
('Empowering cloud providers: optimised locust-inspired algorithm for SLA violation mitigation in green cloud computing', 2025, 'Article', 'Computing', 2, false),
('Hybrid Merge Sort Algorithms: A Review', 2025, 'Conference paper', 'International Conference on Electrical, Computer, and Energy Technologies, ICECET 2025', 0, false),
('Search Trees: A Review and Comparative Study', 2025, 'Conference paper', 'International Symposium on Wireless Personal Multimedia Communications, WPMC', 3, false),
('PLATOS: A POWER AND LATENCY AWARE TASK ORIENTED SCHEDULING STRATEGY FOR HEALTHCARE IOT IN FOG COMPUTING', 2025, 'Article', 'Eurasian Journal of Mathematical and Computer Applications', 2, true),
('Investigating Elastic-TCP in Mobile Ad Hoc Networks: A Performance Evaluation', 2025, 'Conference paper', 'International Conference on Communication, Computing, Networking, and Control in Cyber-Physical Systems, CCNCPS 2025', 2, false),
('MBISort Algorithm: A Novel Hybrid Sorting Approach for Efficient Data Processing', 2025, 'Conference paper', 'Proceedings of the 2025 17th International Conference on Electronics, Computers and Artificial Intelligence, ECAI 2025', 3, false),
('A Comparative Performance Analysis of Diverse Task Scheduling Algorithms for Cloud Computing', 2025, 'Conference paper', '2025 10th International Conference on Information and Network Technologies, ICINT 2025', 4, false),
('Design and Evaluation of Arabic Handwritten Digit Recognition System Using Biologically Plausible Methods', 2024, 'Article', 'Arabian Journal for Science and Engineering', 6, false),
('Design and Evaluation of a Low-Power Wide-Area Network (LPWAN)-Based Emergency Response System for Individuals with Special Needs in Smart Buildings', 2024, 'Article', 'Sensors', 29, true),
('Quality of interaction-based predictive model for support of online learning in pandemic situations', 2024, 'Article', 'Knowledge and Information Systems', 12, false),
('Dynamic Load Balancing for Enhanced Network Performance in IoT-Enabled Smart Healthcare With Fog Computing', 2024, 'Article', 'IEEE Access', 28, true),
('Real-Time Oversight of Parking Space Management in IoT Edge Computing for Industry 4.0: A Case Study', 2024, 'Conference paper', '2024 IEEE 7th International Symposium on Telecommunication Technologies: Exploring Future Frontiers in Telecommunication and Vehicular Technologies, ISTT 2024', 4, false),
('Optimizing Cloud Computing Performance With an Enhanced Dynamic Load Balancing Algorithm for Superior Task Allocation', 2024, 'Article', 'IEEE Access', 25, true),
('An Edge Computing-Based and Threat Behavior-Aware Smart Prioritization Framework for Cybersecurity Intrusion Detection and Prevention of IEDs in Smart Grids with Integration of Modified LGBM and One Class-SVM Models', 2024, 'Article', 'IEEE Access', 35, true),
('Predictive Energy Management for Docker Containers in Cloud Computing: A Time Series Analysis Approach', 2024, 'Article', 'IEEE Access', 21, true),
('Comparative Analysis of Sorting Algorithms: A Review', 2024, 'Conference paper', 'Proceedings of the International Conference on Soft Computing and Machine Intelligence, ISCMI', 12, false),
('Performance and Scalability Analysis of SDN-Based Large-Scale Wi-Fi Networks', 2023, 'Article', 'Applied Sciences (Switzerland)', 17, true),
('Replication-Based Dynamic Energy-Aware Resource Provisioning for Scientific Workflows', 2023, 'Article', 'Applied Sciences (Switzerland)', 7, true),
('An exploration to graphics processing unit spot price prediction', 2022, 'Article', 'Cluster Computing', 6, false),
('Mapping and Consolidation of VMs Using Locust-Inspired Algorithms for Green Cloud Computing', 2022, 'Article', 'Neural Processing Letters', 17, false),
('Locust inspired algorithm for cloudlet scheduling in cloud computing environments', 2021, 'Article', 'Sensors', 17, true),
('Fault-tolerant and data-intensive resource scheduling and management for scientific applications in cloud computing', 2021, 'Article', 'Sensors', 22, true),
('Scientific Workflows Management and Scheduling in Cloud Computing: Taxonomy, Prospects, and Challenges', 2021, 'Article', 'IEEE Access', 62, true),
('Optimising Cloud Servers Utilisation Based on Locust-Inspired Algorithm', 2020, 'Conference paper', '2020 7th International Conference on Soft Computing and Machine Intelligence, ISCMI 2020', 15, false),
('Dynamic energy efficient resource allocation strategy for load balancing in fog environment', 2020, 'Article', 'IEEE Access', 92, true),
('Load Balancing and Server Consolidation in Cloud Computing Environments: A Meta-Study', 2019, 'Article', 'IEEE Access', 75, true),
('Range wise busy checking 2-way imbalanced algorithm for cloudlet allocation in cloud environment', 2018, 'Conference paper', 'Journal of Physics: Conference Series', 21, true);
insert into public.publications (title, year, type, venue, citations, is_open_access, keywords)
select v.title, v.year, v.type, v.venue, v.citations, v.oa, '{}'::text[] from sitam_meta.v_alaa v
 where not exists (select 1 from public.publications p where lower(btrim(p.title)) = lower(btrim(v.title)));
update public.publications p set citations = v.citations, year = coalesce(p.year, v.year), venue = coalesce(nullif(p.venue, ''), v.venue),
       is_open_access = p.is_open_access or v.oa
  from sitam_meta.v_alaa v where lower(btrim(p.title)) = lower(btrim(v.title));
insert into public.publication_authors (publication_id, professor_id)
select p.id, (select id from public.professors where username = 'm.al-hadeethi')
  from public.publications p join sitam_meta.v_alaa v on lower(btrim(p.title)) = lower(btrim(v.title))
on conflict do nothing;
select public.refresh_professor_metrics((select id from public.professors where username = 'm.al-hadeethi'));
update public.professors set publications_updated_at = now() where username = 'm.al-hadeethi'
  and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'professors' and column_name = 'publications_updated_at');

insert into sitam_meta.applied_migrations (version, name) values ('20261102200200', 'sitam_v20_2_researcher_alaanzy') on conflict do nothing;

-- ════════ 20261102200300_sitam_v20_3_researcher_palzhanov ════════
-- SITAM SPACE v20.3 — researcher Yerbol Palzhanov: Scopus author 57223905820 (2026-11-02: 5 documents, 46 citations,
-- h-index 4), ORCID 0000-0002-8997-8675. Generated with scripts/build-seed.mjs. Re-runnable.
-- Yerbol Palzhanov
insert into public.professors (username, first_name, last_name, full_name, job_title, degree, email, photo_url, orcid_url, scopus_id, scholar_url,
  h_index, i10_index, total_citations, total_works, keywords, topics)
values ('yerbol.palzhanov', 'Yerbol', 'Palzhanov', 'Yerbol Palzhanov', null, null, null,
  null, 'https://orcid.org/0000-0002-8997-8675', '57223905820', 'https://scholar.google.com/citations?view_op=search_authors&mauthors=Yerbol+Palzhanov',
  4, 2, 46, 5,
  array['finite element methods', 'phase-field models', 'Cahn–Hilliard equation', 'surface PDEs', 'two-phase flow', 'lipid vesicles', 'computational mathematics']::text[], '[]'::jsonb)
on conflict (username) do update set first_name = excluded.first_name, last_name = excluded.last_name, full_name = excluded.full_name,
  job_title = excluded.job_title, degree = excluded.degree, email = excluded.email, photo_url = coalesce(excluded.photo_url, public.professors.photo_url),
  orcid_url = excluded.orcid_url, scopus_id = excluded.scopus_id, scholar_url = excluded.scholar_url, h_index = excluded.h_index,
  i10_index = excluded.i10_index, total_citations = excluded.total_citations, total_works = excluded.total_works,
  keywords = excluded.keywords, topics = excluded.topics, updated_at = now();
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'A Scalar Auxiliary Variable Unfitted FEM for the Surface Cahn–Hilliard Equation', 2023, 'Article', null, 'Journal of Scientific Computing',
  null, 4, false, 'https://www.scopus.com/pages/publications/85174525693?origin=resultslist', '2-s2.0-85174525693', array['unfitted finite element method', 'scalar auxiliary variable', 'Cahn–Hilliard equation', 'surface PDEs']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-85174525693');
update public.publications set citations = 4, keywords = array['unfitted finite element method', 'scalar auxiliary variable', 'Cahn–Hilliard equation', 'surface PDEs']::text[] where scopus_eid = '2-s2.0-85174525693';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'yerbol.palzhanov') from public.publications where scopus_eid = '2-s2.0-85174525693' on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'On Fusogenicity of Positively Charged Phased-Separated Lipid Vesicles: Experiments and Computational Simulations', 2023, 'Article', null, 'Biomolecules',
  null, 6, true, 'https://www.scopus.com/pages/publications/85175066301?origin=resultslist', '2-s2.0-85175066301', array['lipid vesicles', 'fusogenicity', 'phase separation', 'computational simulation']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-85175066301');
update public.publications set citations = 6, keywords = array['lipid vesicles', 'fusogenicity', 'phase separation', 'computational simulation']::text[] where scopus_eid = '2-s2.0-85175066301';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'yerbol.palzhanov') from public.publications where scopus_eid = '2-s2.0-85175066301' on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'A Comparison of Cahn–Hilliard and Navier–Stokes–Cahn–Hilliard Models on Manifolds', 2022, 'Article', null, 'Vietnam Journal of Mathematics',
  null, 5, false, 'https://www.scopus.com/pages/publications/85130712098?origin=resultslist', '2-s2.0-85130712098', array['Cahn–Hilliard equation', 'Navier–Stokes–Cahn–Hilliard', 'manifolds', 'phase-field models']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-85130712098');
update public.publications set citations = 5, keywords = array['Cahn–Hilliard equation', 'Navier–Stokes–Cahn–Hilliard', 'manifolds', 'phase-field models']::text[] where scopus_eid = '2-s2.0-85130712098';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'yerbol.palzhanov') from public.publications where scopus_eid = '2-s2.0-85130712098' on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Lipid domain coarsening and fluidity in multicomponent lipid vesicles: A continuum based model and its experimental validation', 2022, 'Article', null, 'Biochimica et Biophysica Acta - Biomembranes',
  null, 11, true, 'https://www.scopus.com/pages/publications/85126832666?origin=resultslist', '2-s2.0-85126832666', array['lipid domains', 'multicomponent vesicles', 'continuum model', 'phase separation']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-85126832666');
update public.publications set citations = 11, keywords = array['lipid domains', 'multicomponent vesicles', 'continuum model', 'phase separation']::text[] where scopus_eid = '2-s2.0-85126832666';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'yerbol.palzhanov') from public.publications where scopus_eid = '2-s2.0-85126832666' on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'A decoupled, stable, and linear FEM for a phase-field model of variable density two-phase incompressible surface flow', 2021, 'Article', null, 'Computer Methods in Applied Mechanics and Engineering',
  null, 20, true, 'https://www.scopus.com/pages/publications/85116256299?origin=resultslist', '2-s2.0-85116256299', array['finite element method', 'phase-field model', 'two-phase flow', 'surface flow']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-85116256299');
update public.publications set citations = 20, keywords = array['finite element method', 'phase-field model', 'two-phase flow', 'surface flow']::text[] where scopus_eid = '2-s2.0-85116256299';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'yerbol.palzhanov') from public.publications where scopus_eid = '2-s2.0-85116256299' on conflict do nothing;

insert into sitam_meta.applied_migrations (version, name) values ('20261102200300', 'sitam_v20_3_researcher_palzhanov') on conflict do nothing;

-- ════════ 20261102200400_sitam_v20_4_palzhanov_profile ════════
-- SITAM SPACE v20.4 — Yerbol Palzhanov: position as for the other professors (no extra text). Re-runnable.
update public.professors set job_title = 'Assistant Professor SDU', bio = null, interests = '{}', updated_at = now()
where username = 'yerbol.palzhanov';

insert into sitam_meta.applied_migrations (version, name) values ('20261102200400', 'sitam_v20_4_palzhanov_profile') on conflict do nothing;

-- ════════ 20261102200500_sitam_v20_5_researcher_akhmedov ════════
-- SITAM SPACE v20.5 — researcher Ramis Akhmedov (ramis.akhmedov): Scopus author 57189049749
-- (Scopus author page, 2026-11-02: 8 documents, 50 citations, h-index 3), ORCID 0009-0004-2292-2978.
-- Papers are matched by title, so papers shared with co-authors on SITAM SPACE are linked, not copied. Re-runnable.
update public.professors set scopus_id = '57189049749', orcid_url = 'https://orcid.org/0009-0004-2292-2978',
  total_works = 8, total_citations = 50, h_index = 3, i10_index = 2, updated_at = now()
 where username = 'ramis.akhmedov';
drop table if exists sitam_meta.v_ramis;
create schema if not exists sitam_meta;
create table sitam_meta.v_ramis (title text, year int, type text, venue text, citations int, oa boolean);
insert into sitam_meta.v_ramis values
('FEW-SHOT IMAGE CLASSIFICATION: A SURVEY', 2026, 'Article', 'Eurasian Journal of Mathematical and Computer Applications', 0, true),
('A Performance Evaluation of Flask (WSGI) and Fastapi (ASGI) under High-Concurrency Workloads', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 1, false),
('Search Trees: A Review and Comparative Study', 2025, 'Conference paper', 'International Symposium on Wireless Personal Multimedia Communications, WPMC', 3, false),
('Investigating Elastic-TCP in Mobile Ad Hoc Networks: A Performance Evaluation', 2025, 'Conference paper', 'International Conference on Communication, Computing, Networking, and Control in Cyber-Physical Systems, CCNCPS 2025', 2, false),
('A Comparative Performance Analysis of Diverse Task Scheduling Algorithms for Cloud Computing', 2025, 'Conference paper', '2025 10th International Conference on Information and Network Technologies, ICINT 2025', 4, false),
('Dynamic Load Balancing for Enhanced Network Performance in IoT-Enabled Smart Healthcare With Fog Computing', 2024, 'Article', 'IEEE Access', 28, true),
('Comparative Analysis of Sorting Algorithms: A Review', 2024, 'Conference paper', 'Proceedings of the International Conference on Soft Computing and Machine Intelligence, ISCMI', 12, false),
('Social networking to expand brand awareness and influence on purchase intention', 2016, 'Article', 'Actual Problems of Economics', 0, false);
insert into public.publications (title, year, type, venue, citations, is_open_access, keywords)
select v.title, v.year, v.type, v.venue, v.citations, v.oa, '{}'::text[] from sitam_meta.v_ramis v
 where not exists (select 1 from public.publications p where lower(btrim(p.title)) = lower(btrim(v.title)));
update public.publications p set citations = v.citations, year = coalesce(p.year, v.year), venue = coalesce(nullif(p.venue, ''), v.venue),
       is_open_access = p.is_open_access or v.oa
  from sitam_meta.v_ramis v where lower(btrim(p.title)) = lower(btrim(v.title));
insert into public.publication_authors (publication_id, professor_id)
select p.id, (select id from public.professors where username = 'ramis.akhmedov')
  from public.publications p join sitam_meta.v_ramis v on lower(btrim(p.title)) = lower(btrim(v.title))
on conflict do nothing;
select public.refresh_professor_metrics((select id from public.professors where username = 'ramis.akhmedov'));
update public.professors set publications_updated_at = now() where username = 'ramis.akhmedov';
drop table if exists sitam_meta.v_ramis;

insert into sitam_meta.applied_migrations (version, name) values ('20261102200500', 'sitam_v20_5_researcher_akhmedov') on conflict do nothing;

-- ════════ 20261102210000_sitam_v22_ask_archive ════════
-- SITAM SPACE v22 — Ask SITAM archive: every answered question is saved for the person who asked it
-- (FAQ → "Ask SITAM AI" tab shows the archive; the floating chat saves there too). Only the owner sees and deletes
-- their questions. Re-runnable.
create table if not exists public.ask_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 3 and 600),
  answer text not null default '' check (char_length(answer) <= 20000),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  scope text not null default 'auto' check (scope in ('auto', 'labs', 'people', 'papers', 'events', 'opportunities', 'projects', 'faq')),
  created_at timestamptz not null default now()
);
create index if not exists ask_questions_user_idx on public.ask_questions (user_id, created_at desc);
alter table public.ask_questions enable row level security;
drop policy if exists "Own Ask questions: read" on public.ask_questions;
drop policy if exists "Own Ask questions: add" on public.ask_questions;
drop policy if exists "Own Ask questions: delete" on public.ask_questions;
create policy "Own Ask questions: read" on public.ask_questions for select to authenticated using (user_id = auth.uid());
create policy "Own Ask questions: add" on public.ask_questions for insert to authenticated with check (user_id = auth.uid());
create policy "Own Ask questions: delete" on public.ask_questions for delete to authenticated using (user_id = auth.uid());
revoke all on public.ask_questions from anon, public;
revoke update on public.ask_questions from authenticated;
grant select, insert, delete on public.ask_questions to authenticated;

insert into sitam_meta.applied_migrations (version, name) values ('20261102210000', 'sitam_v22_ask_archive') on conflict do nothing;

-- ════════ 20261102220000_sitam_v22_1_researcher_sadyk ════════
-- SITAM SPACE v22.1 — researcher Ualikhan Sadyk (ualikhan.sadyk): Scopus author 57460291500
-- (Scopus author page, 2026-11-02: 17 documents, 84 citations, h-index 6), ORCID 0000-0002-2674-1611.
-- Papers are matched by title, so papers shared with co-authors on SITAM SPACE are linked, not copied. Re-runnable.
update public.professors set scopus_id = '57460291500', orcid_url = 'https://orcid.org/0000-0002-2674-1611',
  total_works = 17, total_citations = 84, h_index = 6, i10_index = 3, updated_at = now()
 where username = 'ualikhan.sadyk';
drop table if exists sitam_meta.v_sadyk;
create schema if not exists sitam_meta;
create table sitam_meta.v_sadyk (title text, year int, type text, venue text, citations int, oa boolean);
insert into sitam_meta.v_sadyk values
('Kazakh banknote image dataset', 2026, 'Article', 'Data in Brief', 0, true),
('Physicochemical and Ecotoxicological Characterization of Therapeutic Sulfide–Silt Peloids from Lake Maly Akkol', 2026, 'Article', 'Water (Switzerland)', 2, true),
('Interpretable Hybrid CNN-BiLSTM-Attention Model for ECG Arrhythmia Classification', 2026, 'Conference paper', 'SIST 2026 - 2026 IEEE 6th International Conference on Smart Information Systems and Technologies, Conference Proceedings', 0, false),
('Development of Multimodal Neural Network for Suicidal Ideation Detection Using Kazakh-Russian BERT and Attention Mechanism', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('Benchmarking Deep Transfer Learning for Banknote Recognition: Vision Transformers Vs. CNNs on the KZ-BD Dataset', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('Development of Novel Neural Network Architecture for Automated Pharmaceutical and Vitamin Identification Using Image Classification', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('A Comprehensive Survey of Methods and Challenges of Vehicle Routing Problem with Uncertainties', 2025, 'Review', 'Mathematics', 14, true),
('An Adaptive Steganographic Method for Reversible Information Embedding in X-Ray Images', 2025, 'Article', 'Computers', 5, true),
('Comparative analysis of machine learning approaches in Kazakh banknote classification', 2024, 'Article', 'Bulletin of Electrical Engineering and Informatics', 8, true),
('KZ-BD: Dataset of Kazakhstan banknotes with annotations', 2024, 'Data paper', 'Data in Brief', 5, true),
('Enhanced U-Net Architecture for Lung Segmentation on Computed Tomography and X-Ray Images', 2024, 'Article', 'International Journal of Advanced Computer Science and Applications', 15, true),
('State-of-the-Art Review of Deep Learning Methods in Fake Banknote Recognition Problem', 2024, 'Article', 'International Journal of Advanced Computer Science and Applications', 14, true),
('Overview of Deep Learning Models for Banknote Recognition', 2023, 'Conference paper', 'Proceedings - 2023 17th International Conference on Electronics Computer and Computation, ICECCO 2023', 7, false),
('Design and Evaluation of a Personalized Job Recommendation System for Computer Science Students Using Hybrid Approach', 2023, 'Conference paper', 'Proceedings - 2023 17th International Conference on Electronics Computer and Computation, ICECCO 2023', 7, false),
('MBTI-based recommendation system for extracurricular activities for high school students', 2023, 'Conference paper', 'Proceedings - 2023 17th International Conference on Electronics Computer and Computation, ICECCO 2023', 5, false),
('A Comparative Study of the Impact of Electronic Devices on University Students'' Academic Performance', 2023, 'Conference paper', 'Proceedings - 2023 17th International Conference on Electronics Computer and Computation, ICECCO 2023', 1, false),
('Effective Ways to Pass Exams in Programming Disciplines and Optimize the Process of Analyzing Results. Case Study: Suleyman Demirel University', 2021, 'Conference paper', 'Proceedings - 2021 16th International Conference on Electronics Computer and Computation, ICECCO 2021', 1, false);
insert into public.publications (title, year, type, venue, citations, is_open_access, keywords)
select v.title, v.year, v.type, v.venue, v.citations, v.oa, '{}'::text[] from sitam_meta.v_sadyk v
 where not exists (select 1 from public.publications p where lower(btrim(p.title)) = lower(btrim(v.title)));
update public.publications p set citations = v.citations, year = coalesce(p.year, v.year), venue = coalesce(nullif(p.venue, ''), v.venue),
       is_open_access = p.is_open_access or v.oa
  from sitam_meta.v_sadyk v where lower(btrim(p.title)) = lower(btrim(v.title));
insert into public.publication_authors (publication_id, professor_id)
select p.id, (select id from public.professors where username = 'ualikhan.sadyk')
  from public.publications p join sitam_meta.v_sadyk v on lower(btrim(p.title)) = lower(btrim(v.title))
on conflict do nothing;
select public.refresh_professor_metrics((select id from public.professors where username = 'ualikhan.sadyk'));
update public.professors set publications_updated_at = now() where username = 'ualikhan.sadyk';
drop table if exists sitam_meta.v_sadyk;

insert into sitam_meta.applied_migrations (version, name) values ('20261102220000', 'sitam_v22_1_researcher_sadyk') on conflict do nothing;

-- ════════ 20261102223000_sitam_v22_2_scopus_metrics ════════
-- SITAM SPACE v22.2 — h-index, citations, works and i10 of a researcher come from Scopus only (decided 2026-11-02).
-- A researcher can still add, edit and remove papers on their card (v18): those changes show in the list of papers,
-- but no longer change the totals. The totals are recomputed only when the coordinator (or an SQL update run in
-- Supabase) changes the papers, e.g. a Scopus import in Admin. Re-runnable.
create or replace function public.refresh_professor_metrics(p_prof uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_works int; v_cites int; v_h int; v_i10 int;
begin
  -- a change made by the researcher themself (any signed-in person who is not the coordinator): keep the Scopus figures
  if auth.uid() is not null and not public.is_admin() then
    return;
  end if;
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
revoke execute on function public.refresh_professor_metrics(uuid) from anon, authenticated, public;

insert into sitam_meta.applied_migrations (version, name) values ('20261102223000', 'sitam_v22_2_scopus_metrics') on conflict do nothing;

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
grant execute on function public.is_lab_lead(uuid) to authenticated;
grant update (graduation_year, company) on public.profiles to authenticated;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;
revoke insert, update, delete on public.help_offers from anon, authenticated;
grant select on public.help_offers to authenticated;
grant select (bio, office_hours, interests) on public.professors to anon, authenticated;
revoke insert, update, delete on public.researcher_profile_requests from anon, authenticated;
grant select on public.researcher_profile_requests to authenticated;
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
grant select (publications_updated_at) on public.professors to anon, authenticated;
revoke execute on function public.can_edit_professor(uuid) from anon, public;
grant execute on function public.can_edit_professor(uuid) to authenticated;
revoke execute on function public.save_publication(uuid, uuid, text, int, text, text, text, text, int, boolean) from anon, public;
revoke execute on function public.remove_publication(uuid, uuid) from anon, public;
revoke execute on function public.import_publications(uuid, jsonb) from anon, public;
grant execute on function public.save_publication(uuid, uuid, text, int, text, text, text, text, int, boolean) to authenticated;
grant execute on function public.remove_publication(uuid, uuid) to authenticated;
grant execute on function public.import_publications(uuid, jsonb) to authenticated;
grant update (experience) on public.profiles to authenticated;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;
-- v20: account safety (guarded: this file may run before v20 exists)
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
  if to_regprocedure('public.create_account_claims(uuid, text)') is not null then
    revoke execute on function public.create_account_claims(uuid, text) from anon, authenticated, public;
  end if;
end $$;
revoke insert, update, delete on public.company_members from anon, authenticated;
-- v22: Ask SITAM archive (guarded)
do $$ begin
  if to_regclass('public.ask_questions') is not null then
    revoke all on public.ask_questions from anon, public;
    revoke update on public.ask_questions from authenticated;
    grant select, insert, delete on public.ask_questions to authenticated;
  end if;
end $$;
