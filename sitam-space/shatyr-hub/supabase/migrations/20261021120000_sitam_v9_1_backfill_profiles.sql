-- SITAM SPACE v9.1 — backfill profiles for confirmed accounts created before the current schema.
-- Such accounts (e.g. 230183076@sdu.edu.kz, created 2026-10-13) exist in auth.users but have no
-- public.profiles row, so the site said "already registered" yet showed no profile.
-- Account type comes from the e-mail; coordinator rights come from coordinator_emails automatically.
begin;
insert into public.profiles (id, role, first_name, last_name, email)
select u.id,
       public.account_type_from_email(u.email)::public.app_role,
       left(coalesce(nullif(trim(u.raw_user_meta_data->>'first_name'), ''), ''), 100),
       left(coalesce(nullif(trim(u.raw_user_meta_data->>'last_name'), ''), ''), 100),
       lower(u.email)
  from auth.users u
 where u.email_confirmed_at is not null
   and u.email is not null
   and not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
-- Link lab seats / professor pages waiting for these e-mails (same as handle_new_user).
update public.lab_members m set user_id = p.id
  from public.lab_member_contacts c join public.profiles p on p.email = c.email
 where c.member_id = m.id and m.user_id is null;
update public.professors pr set profile_id = p.id
  from public.profiles p
 where lower(pr.email) = p.email and pr.profile_id is null;
commit;
