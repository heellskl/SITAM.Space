/* ════════════════════════════════════════════════════════════════════════════
   SITAM SPACE v27 — Startups: Mentors and Trackers tabs (requested 2026-11-03)
   • public.startup_people: people who help student startups — mentors (advice from experience) and trackers
     (guide a team step by step through the stages). Everyone can see them; only the coordinator / admin
     adds, edits and removes them (Startups → Mentors / Trackers → "Add …").
   Safe to run more than once.
   ════════════════════════════════════════════════════════════════════════════ */
create table if not exists public.startup_people (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('mentor', 'tracker')),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  role text check (role is null or char_length(role) <= 160),
  bio text check (bio is null or char_length(bio) <= 1500),
  expertise text[] not null default '{}' check (cardinality(expertise) <= 12),
  photo_url text check (photo_url is null or photo_url ~* '^https://'),
  contact_url text check (contact_url is null or contact_url ~* '^(https://|mailto:)'),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists startup_people_kind_idx on public.startup_people (kind, sort_order, full_name);
alter table public.startup_people enable row level security;
drop policy if exists "Startup people: everyone reads" on public.startup_people;
drop policy if exists "Startup people: coordinator adds" on public.startup_people;
drop policy if exists "Startup people: coordinator edits" on public.startup_people;
drop policy if exists "Startup people: coordinator removes" on public.startup_people;
create policy "Startup people: everyone reads" on public.startup_people for select to anon, authenticated using (true);
create policy "Startup people: coordinator adds" on public.startup_people for insert to authenticated with check (public.is_admin());
create policy "Startup people: coordinator edits" on public.startup_people for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Startup people: coordinator removes" on public.startup_people for delete to authenticated using (public.is_admin());
revoke all on public.startup_people from anon, public;
grant select on public.startup_people to anon, authenticated;
grant insert, update, delete on public.startup_people to authenticated;
