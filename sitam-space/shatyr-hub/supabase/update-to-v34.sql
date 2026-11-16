-- SITAM SPACE — update to v34: Awards & Wall of Fame (page /awards). Safe to run more than once.
-- Run it AFTER update-to-v33.sql. Supabase → SQL Editor → New query → paste this whole file → Run.
create schema if not exists sitam_meta;
create table if not exists sitam_meta.applied_migrations (version text primary key, name text not null, applied_at timestamptz not null default now());

-- ════════ 20261116120000_sitam_v34_awards ════════
/* ════════════════════════════════════════════════════════════════════════════
   SITAM SPACE v34 — Awards & Wall of Fame (asked for by the user 2026-11-16)
   • public.awards: the three spotlight cards of the month (Student of the Month, Top Research Lab,
     Research Topic of the Month) and the Weekly Wins & News feed (hackathons, research, projects, news).
   • Everyone (guests too) reads it. Only the coordinator adds, edits and removes entries (page /awards).
   • No made-up entries: the page starts empty and the coordinator fills it.
   Safe to run more than once.
   ════════════════════════════════════════════════════════════════════════════ */
create table if not exists public.awards (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('student', 'lab', 'topic', 'win')),
  category text check (category is null or category in ('hackathon', 'research', 'project', 'news')),
  title text not null check (char_length(btrim(title)) between 2 and 200),
  subtitle text check (subtitle is null or char_length(subtitle) <= 200),
  body text check (body is null or char_length(body) <= 2000),
  lab_id uuid references public.labs(id) on delete set null,
  photo_url text check (photo_url is null or photo_url ~* '^https://'),
  link_url text check (link_url is null or link_url ~* '^https://'),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  happened_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint awards_win_category check ((kind = 'win') = (category is not null))
);
create index if not exists awards_kind_date_idx on public.awards (kind, happened_on desc);
alter table public.awards enable row level security;
drop policy if exists "Awards: everyone reads" on public.awards;
drop policy if exists "Awards: coordinator adds" on public.awards;
drop policy if exists "Awards: coordinator edits" on public.awards;
drop policy if exists "Awards: coordinator removes" on public.awards;
create policy "Awards: everyone reads" on public.awards for select to anon, authenticated using (true);
create policy "Awards: coordinator adds" on public.awards for insert to authenticated with check (public.is_admin());
create policy "Awards: coordinator edits" on public.awards for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Awards: coordinator removes" on public.awards for delete to authenticated using (public.is_admin());
revoke all on public.awards from anon, public;
grant select on public.awards to anon, authenticated;
grant insert, update, delete on public.awards to authenticated;

insert into sitam_meta.applied_migrations (version, name) values ('20261116120000', 'sitam_v34_awards') on conflict do nothing;
