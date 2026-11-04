/* SITAM SPACE v29.1 — no lab is in a research center for now (the user, 2026-11-04).
   Clears the centers that the first v29 put on every lab, once. Later choices of the coordinator are kept. Safe to run more than once. */
create schema if not exists sitam_meta;
create table if not exists sitam_meta.applied_migrations (version text primary key, name text not null, applied_at timestamptz not null default now());
alter table public.labs alter column center drop default;
update public.labs set center = null
 where center = 'ai'
   and not exists (select 1 from sitam_meta.applied_migrations where version = '20261104110000');
