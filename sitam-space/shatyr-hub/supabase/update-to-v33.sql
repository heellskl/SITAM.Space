-- SITAM SPACE — update to v33: certificates on the personal page (Awards) and seven teacher accounts. Safe to run more than once.
-- Run it AFTER update-to-v32.sql. Supabase → SQL Editor → New query → paste this whole file → Run.
create schema if not exists sitam_meta;
create table if not exists sitam_meta.applied_migrations (version text primary key, name text not null, applied_at timestamptz not null default now());

-- ════════ 20261109100000_sitam_v33_certificates_staff ════════
/* SITAM SPACE v33 — certificates on the personal page and seven teacher accounts (asked by the user 2026-11-09).
   1) public.certificates: a person uploads their own certificates (PDF / image, private bucket `certificates`) and may
      say which lab a certificate belongs to. Seen by the owner, the heads of that lab and the coordinator.
   2) sitam_meta.staff_accounts_2026: teachers who get an account the same way as the v29 lab leads (first password
      SduLab2026!, changed at the first sign-in). They are verified teachers and their researcher card is linked.
      No admin or lab-head rights. Safe to run more than once. */

/* ───────────── 1. certificates ───────────── */
create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 160),
  issuer text check (issuer is null or char_length(issuer) <= 160),
  issued_on date check (issued_on is null or issued_on between date '1990-01-01' and date '2100-01-01'),
  lab_id uuid references public.labs(id) on delete set null,
  file_path text not null check (char_length(file_path) <= 300),
  file_name text check (file_name is null or char_length(file_name) <= 160),
  created_at timestamptz not null default now(),
  -- the file always lies in the owner's own folder
  constraint certificates_own_folder check (split_part(file_path, '/', 1) = user_id::text)
);
create index if not exists certificates_user_idx on public.certificates (user_id, issued_on desc nulls last);
create index if not exists certificates_lab_idx on public.certificates (lab_id) where lab_id is not null;

alter table public.certificates enable row level security;
drop policy if exists "Certificates: owner, lab heads, coordinator read" on public.certificates;
drop policy if exists "Certificates: owner adds" on public.certificates;
drop policy if exists "Certificates: owner edits" on public.certificates;
drop policy if exists "Certificates: owner removes" on public.certificates;
create policy "Certificates: owner, lab heads, coordinator read" on public.certificates for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or (lab_id is not null and public.is_lab_manager(lab_id)));
create policy "Certificates: owner adds" on public.certificates for insert to authenticated
  with check (user_id = auth.uid());
create policy "Certificates: owner edits" on public.certificates for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Certificates: owner removes" on public.certificates for delete to authenticated
  using (user_id = auth.uid());
revoke all on public.certificates from anon, authenticated, public;
grant select, insert, delete on public.certificates to authenticated;
grant update (title, issuer, issued_on, lab_id) on public.certificates to authenticated;

-- private bucket: {uid}/{file}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificates', 'certificates', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

-- who may open a stored certificate file: the owner, or anyone who can read its certificates row
create or replace function public.can_view_certificate_file(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.certificates c
     where c.file_path = p_name
       and (c.user_id = auth.uid() or public.is_admin() or (c.lab_id is not null and public.is_lab_manager(c.lab_id)))
  );
$$;
revoke execute on function public.can_view_certificate_file(text) from anon, public;
grant execute on function public.can_view_certificate_file(text) to authenticated;

drop policy if exists "Own certificate files read" on storage.objects;
drop policy if exists "Own certificate files upload" on storage.objects;
drop policy if exists "Own certificate files delete" on storage.objects;
drop policy if exists "Shared certificate files read" on storage.objects;
create policy "Own certificate files read" on storage.objects for select to authenticated
  using (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Own certificate files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Own certificate files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Shared certificate files read" on storage.objects for select to authenticated
  using (bucket_id = 'certificates' and public.can_view_certificate_file(name));

/* ───────────── 2. teacher accounts 2026 ───────────── */
create schema if not exists sitam_meta;
create table if not exists sitam_meta.staff_accounts_2026 (
  email text primary key check (email = lower(email) and email like '%@sdu.edu.kz'),
  full_name text not null,
  first_name text not null,
  last_name text not null
);
insert into sitam_meta.staff_accounts_2026 (email, full_name, first_name, last_name) values
  ('askhat.aitimov@sdu.edu.kz',    'Askhat Aitimov',    'Askhat',  'Aitimov'),
  ('gulnara.saimassay@sdu.edu.kz', 'Gulnara Saimassay', 'Gulnara', 'Saimassay'),
  ('maksat.galiyev@sdu.edu.kz',    'Maksat Galiyev',    'Maksat',  'Galiyev'),
  ('duman.telman@sdu.edu.kz',      'Duman Telman',      'Duman',   'Telman'),
  ('aliya.zhunis@sdu.edu.kz',      'Aliya Zhunis',      'Aliya',   'Zhunis')
  -- TODO (e-mails not confirmed yet): Ulpan Yunush, Dinara Yermekbayeva — add a line each when the SDU e-mail is known
on conflict (email) do update set full_name = excluded.full_name, first_name = excluded.first_name, last_name = excluded.last_name;

-- a) accounts: created only when there is no account with that e-mail yet (first password SduLab2026!, changed at first sign-in)
do $$ declare r record; v_id uuid; begin
  for r in select * from sitam_meta.staff_accounts_2026 order by email loop
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

-- b) verified teachers (the e-mails come from the official list, not from a typed sign-up)
update public.profiles p set staff_verified = true
  from sitam_meta.staff_accounts_2026 s
 where lower(p.email) = s.email and p.role = 'teacher' and not p.staff_verified;

-- c) link the researcher card with the same e-mail (only a card that is free, and only if the person has none yet)
update public.professors pr set profile_id = p.id
  from sitam_meta.staff_accounts_2026 s, public.profiles p
 where lower(pr.email) = s.email and lower(p.email) = s.email and pr.profile_id is null
   and not exists (select 1 from public.professors o where o.profile_id = p.id);
update public.researcher_profile_requests q set status = 'approved', reviewed_at = now(),
       professor_id = coalesce(q.professor_id, pr.id)
  from public.profiles p, sitam_meta.staff_accounts_2026 s, public.professors pr
 where q.user_id = p.id and lower(p.email) = s.email and pr.profile_id = p.id and q.status = 'pending'
   and (q.professor_id is null or q.professor_id = pr.id);

insert into sitam_meta.applied_migrations (version, name) values ('20261109100000', 'sitam_v33_certificates_staff') on conflict do nothing;
