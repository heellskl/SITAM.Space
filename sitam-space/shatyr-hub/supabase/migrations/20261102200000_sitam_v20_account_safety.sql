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

