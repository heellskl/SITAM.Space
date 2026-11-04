-- SITAM SPACE — update to v29: Research → Center of Research, lab leads 2026 (accounts with the first password SduLab2026!), Lab Passport. Safe to run more than once.
-- Run it AFTER update-to-v28.sql. Supabase → SQL Editor → New query → paste this whole file → Run.
create schema if not exists sitam_meta;
create table if not exists sitam_meta.applied_migrations (version text primary key, name text not null, applied_at timestamptz not null default now());

-- ════════ 20261104100000_sitam_v29_centers_leads_passport ════════
/* ════════════════════════════════════════════════════════════════════════════
   SITAM SPACE v29 — Center of Research, lab leads 2026 with their own accounts, Lab Passport (approved by the user 2026-11-04)
   1. labs.center: 'ai' (Center of AI Research), 'math' (Center of Mathematics) or empty. For now no lab is in a center
      (the user, 2026-11-04). Only the coordinator puts a lab into a center (trigger labs_center_guard).
   2. Lab leads 2026 (list from the user, e-mails from the SITAM staff list): each one is the Head of their labs.
      Accounts that do not exist yet are created with the first password SduLab2026! and must change it at the first
      sign-in (profiles.must_change_password). Existing accounts keep their password and are only linked to the lab.
   3. lab_passports: the official Lab Passport (Зертхана паспорты) of a lab for a year. Heads of the lab and the
      coordinator read and fill it; it is submitted to the dean office and approved by the coordinator.
   Written without temp tables, semicolons inside texts or doubled quotes (the Supabase SQL editor). Safe to run more than once.
   ════════════════════════════════════════════════════════════════════════════ */

/* ───────────── 1. centers ───────────── */
alter table public.labs add column if not exists center text;
alter table public.labs drop constraint if exists labs_center_check;
alter table public.labs add constraint labs_center_check check (center is null or center in ('ai', 'math'));

create or replace function public.labs_center_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.center is distinct from old.center and auth.uid() is not null and not public.is_admin() then
    raise exception 'NOT_ALLOWED: only the SITAM coordinator moves a lab to another center';
  end if;
  return new;
end;
$$;
drop trigger if exists labs_center_guard on public.labs;
create trigger labs_center_guard before update of center on public.labs for each row execute function public.labs_center_guard();


/* ───────────── 2. lab leads 2026 ───────────── */
alter table public.profiles add column if not exists must_change_password boolean not null default false;

create or replace function public.clear_must_change_password()
returns void language sql security definer set search_path = public as $$
  update public.profiles set must_change_password = false where id = auth.uid()
$$;
revoke execute on function public.clear_must_change_password() from anon, public;
grant execute on function public.clear_must_change_password() to authenticated;

create table if not exists sitam_meta.lab_leads_2026 (
  slug text not null, full_name text not null, email text not null, first_name text not null, last_name text not null, ord int not null, name_like text,
  primary key (slug, email)
);
alter table sitam_meta.lab_leads_2026 add column if not exists name_like text;
insert into sitam_meta.lab_leads_2026 (slug, full_name, email, first_name, last_name, ord, name_like) values
  ('statistics', 'Amine Sbai', 'amine.sbai@sdu.edu.kz', 'Amine', 'Sbai', 1, 'Sbai'),
  ('robotics-lab', 'Ingkar Baidaly', 'ingkar.baidaly@sdu.edu.kz', 'Ingkar', 'Baidaly', 1, 'Baidaly'),
  ('redhat-laboratory', 'Shakhnazar-Sultan Manbay', 's.manbay@sdu.edu.kz', 'Shakhnazar-Sultan', 'Manbay', 1, 'Manbay'),
  ('mcm-lab', 'Madina Kalaman', 'madina.kalaman@sdu.edu.kz', 'Madina', 'Kalaman', 1, 'Kalaman'),
  ('physics-lab', 'Assem Kaliyeva', 'assem.kaliyeva@sdu.edu.kz', 'Assem', 'Kaliyeva', 1, 'Kaliev'),
  ('multimedia-studio-f06', 'Marat Urmanov', 'marat.urmanov@sdu.edu.kz', 'Marat', 'Urmanov', 1, 'Urmanov'),
  ('multimedia-3d-lab-1109', 'Aziza Yussupova', 'aziza.yussupova@sdu.edu.kz', 'Aziza', 'Yussupova', 1, 'Yusupova'),
  ('multimedia-lab', 'Aziza Yussupova', 'aziza.yussupova@sdu.edu.kz', 'Aziza', 'Yussupova', 1, 'Yusupova'),
  ('fortinet', 'Shakhnazar-Sultan Manbay', 's.manbay@sdu.edu.kz', 'Shakhnazar-Sultan', 'Manbay', 1, 'Manbay'),
  ('distributed-systems-and-computing-lab', 'Kamila Orynbekova', 'kamila.orynbekova@sdu.edu.kz', 'Kamila', 'Orynbekova', 1, 'Orynbekova'),
  ('data-analytics-lab', 'Aziza Nazarbayeva', 'aziza.nazarbayeva@sdu.edu.kz', 'Aziza', 'Nazarbayeva', 1, 'Nazarbayeva'),
  ('cybersecurity-laboratory', 'Shakhnazar-Sultan Manbay', 's.manbay@sdu.edu.kz', 'Shakhnazar-Sultan', 'Manbay', 1, 'Manbay'),
  ('cisco-networking-academy', 'Shakhnazar-Sultan Manbay', 's.manbay@sdu.edu.kz', 'Shakhnazar-Sultan', 'Manbay', 1, 'Manbay'),
  ('microelectronics-chip-lab', 'Binara Imankulova', 'binara.imankulova@sdu.edu.kz', 'Binara', 'Imankulova', 1, 'Imankulova'),
  ('applied-mathematics', 'Aleksei Kavokin', 'aleksei.kavokin@sdu.edu.kz', 'Aleksei', 'Kavokin', 1, 'Kavokin'),
  ('applied-mathematics', 'Symbat Duisen', 'symbat.duisen@sdu.edu.kz', 'Symbat', 'Duisen', 2, 'Duisen'),
  ('analysis', 'Bayan Bekbolat', 'bayan.bekbolat@sdu.edu.kz', 'Bayan', 'Bekbolat', 1, 'Bekbolat'),
  ('algebra', 'Bekzat Zhakhayev', 'bekzat.zhakhayev@sdu.edu.kz', 'Bekzat', 'Zhakhayev', 1, 'Zhakhayev'),
  ('ai-lab', 'Dilnaz Suleimenova', 'dilnaz.suleimenova@sdu.edu.kz', 'Dilnaz', 'Suleimenova', 1, 'Suleimenova'),
  ('cloud-computing', 'Shakhnazar-Sultan Manbay', 's.manbay@sdu.edu.kz', 'Shakhnazar-Sultan', 'Manbay', 1, 'Manbay'),
  ('iot-laboratory', 'Binara Imankulova', 'binara.imankulova@sdu.edu.kz', 'Binara', 'Imankulova', 1, 'Imankulova')
on conflict (slug, email) do update set full_name = excluded.full_name, ord = excluded.ord, name_like = excluded.name_like;

-- a) the head seat in each lab: the existing head row of that person (same e-mail, or the surname in the name), else a new one
do $$ declare r record; v_lab uuid; v_member uuid; begin
  for r in select * from sitam_meta.lab_leads_2026 order by slug, ord loop
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
  for r in select distinct on (email) email, first_name, last_name from sitam_meta.lab_leads_2026 order by email loop
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
   and lb.id = m.lab_id and lb.slug = l.slug and m.user_id is null
   and not exists (select 1 from public.lab_members o where o.lab_id = m.lab_id and o.user_id = p.id);
update public.account_claims a set status = 'approved', decided_at = now()
  from public.lab_members m where m.id = a.member_id and m.user_id = a.user_id and a.status = 'pending';

/* ───────────── 3. Lab Passport ───────────── */
create table if not exists public.lab_passports (
  lab_id uuid not null references public.labs(id) on delete cascade,
  year int not null check (year between 2020 and 2100),
  official_name text check (char_length(official_name) <= 300),
  room text check (char_length(room) <= 300),
  head text check (char_length(head) <= 500),
  equipment text check (char_length(equipment) <= 8000),
  software text check (char_length(software) <= 8000),
  projects_grants text check (char_length(projects_grants) <= 8000),
  kpi_outcomes text check (char_length(kpi_outcomes) <= 8000),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  approved_at timestamptz,
  primary key (lab_id, year)
);
alter table public.lab_passports enable row level security;
drop policy if exists "Passports: lab heads and coordinator" on public.lab_passports;
create policy "Passports: lab heads and coordinator" on public.lab_passports for select to authenticated
  using (public.is_lab_manager(lab_id) or public.is_admin());
revoke all on public.lab_passports from anon, public;
revoke insert, update, delete on public.lab_passports from authenticated;
grant select on public.lab_passports to authenticated;

create or replace function public.save_lab_passport(p_lab uuid, p_year int, p_official_name text, p_room text, p_head text,
  p_equipment text, p_software text, p_projects_grants text, p_kpi_outcomes text, p_submit boolean)
returns public.lab_passports language plpgsql security definer set search_path = public as $$
declare v_row public.lab_passports;
begin
  if not (public.is_lab_manager(p_lab) or public.is_admin()) then
    raise exception 'NOT_ALLOWED: only the heads of this lab or the coordinator fill its passport';
  end if;
  insert into public.lab_passports as lp (lab_id, year, official_name, room, head, equipment, software, projects_grants, kpi_outcomes,
                                          status, updated_at, updated_by, submitted_at)
  values (p_lab, p_year, nullif(btrim(p_official_name), ''), nullif(btrim(p_room), ''), nullif(btrim(p_head), ''),
          nullif(btrim(p_equipment), ''), nullif(btrim(p_software), ''), nullif(btrim(p_projects_grants), ''), nullif(btrim(p_kpi_outcomes), ''),
          case when p_submit then 'submitted' else 'draft' end, now(), auth.uid(), case when p_submit then now() end)
  on conflict (lab_id, year) do update set
    official_name = excluded.official_name, room = excluded.room, head = excluded.head, equipment = excluded.equipment,
    software = excluded.software, projects_grants = excluded.projects_grants, kpi_outcomes = excluded.kpi_outcomes,
    status = case when p_submit then 'submitted' when lp.status = 'approved' then 'draft' else lp.status end,
    updated_at = now(), updated_by = auth.uid(), submitted_at = case when p_submit then now() else lp.submitted_at end,
    approved_at = case when p_submit then null else lp.approved_at end
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.approve_lab_passport(p_lab uuid, p_year int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED: only the SITAM coordinator approves a lab passport'; end if;
  update public.lab_passports set status = 'approved', approved_at = now() where lab_id = p_lab and year = p_year and status = 'submitted';
  if not found then raise exception 'NOT_FOUND: submit the passport first'; end if;
end;
$$;
revoke execute on function public.save_lab_passport(uuid, int, text, text, text, text, text, text, text, boolean) from anon, public;
revoke execute on function public.approve_lab_passport(uuid, int) from anon, public;
grant execute on function public.save_lab_passport(uuid, int, text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.approve_lab_passport(uuid, int) to authenticated;

insert into sitam_meta.applied_migrations (version, name) values ('20261104100000', 'sitam_v29_centers_leads_passport') on conflict do nothing;

-- ════════ 20261104110000_sitam_v29_1_centers_empty ════════
/* SITAM SPACE v29.1 — no lab is in a research center for now (the user, 2026-11-04).
   Clears the centers that the first v29 put on every lab, once. Later choices of the coordinator are kept. Safe to run more than once. */
create schema if not exists sitam_meta;
create table if not exists sitam_meta.applied_migrations (version text primary key, name text not null, applied_at timestamptz not null default now());
alter table public.labs alter column center drop default;
update public.labs set center = null
 where center = 'ai'
   and not exists (select 1 from sitam_meta.applied_migrations where version = '20261104110000');

insert into sitam_meta.applied_migrations (version, name) values ('20261104110000', 'sitam_v29_1_centers_empty') on conflict do nothing;
