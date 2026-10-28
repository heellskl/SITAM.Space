/* SITAM SPACE v13 — event photos and the Academic Year Plan
   ─────────────────────────────────────────────────────────
   • events.photo_urls: photos of an SDU event, uploaded to Supabase Storage (bucket lab-assets) by the organizers
     and set with set_event_photos() (same people as the poster: can_manage_event).
   • academic_plans + academic_plan_items: the school's Academic Year Plan shown on /academic-plan as a timeline
     (Fall · Spring · Summer), with filters For Students / For Researchers / For Industry Partners and the official PDF.
     Everyone reads; only the SITAM coordinator writes.
   • Storage bucket "documents" (public, PDF ≤ 20 MB) for the official plan PDF; only the coordinator uploads.
   Re-runnable. */

/* ───────────── event photos ───────────── */
alter table public.events add column if not exists photo_urls text[] not null default '{}';

create or replace function public.set_event_photos(p_event uuid, p_urls text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_event(p_event) then raise exception 'NOT_ALLOWED: only the organizers of this event can change its photos'; end if;
  if cardinality(coalesce(p_urls, '{}')) > 80 then raise exception 'BAD_INPUT: up to 80 photos per event'; end if;
  if exists (select 1 from unnest(coalesce(p_urls, '{}')) u where u !~* '^https?://') then raise exception 'BAD_INPUT: photos must be https:// links'; end if;
  update public.events set photo_urls = coalesce(p_urls, '{}') where id = p_event;
end;
$$;
revoke execute on function public.set_event_photos(uuid, text[]) from anon, public;
grant execute on function public.set_event_photos(uuid, text[]) to authenticated;

/* ───────────── Academic Year Plan ───────────── */
create table if not exists public.academic_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 120),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  pdf_url text check (pdf_url is null or pdf_url ~* '^https?://'),
  intro text check (intro is null or char_length(intro) <= 2000),
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists academic_plans_one_current on public.academic_plans (is_current) where is_current;

create table if not exists public.academic_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.academic_plans(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 160),
  kind text not null default 'other'
    check (kind in ('grant_deadline', 'poster_day', 'conference', 'hackathon', 'report_deadline', 'seminar', 'other')),
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  audiences text[] not null default array['students', 'researchers', 'industry']
    check (audiences <@ array['students', 'researchers', 'industry']),
  description text check (description is null or char_length(description) <= 2000),
  url text check (url is null or url ~* '^https?://'),
  lab_id uuid references public.labs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists academic_plan_items_plan on public.academic_plan_items (plan_id, starts_on);

alter table public.academic_plans enable row level security;
alter table public.academic_plan_items enable row level security;
drop policy if exists "Plans are public" on public.academic_plans;
create policy "Plans are public" on public.academic_plans for select using (true);
drop policy if exists "Coordinator manages plans" on public.academic_plans;
create policy "Coordinator manages plans" on public.academic_plans for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Plan items are public" on public.academic_plan_items;
create policy "Plan items are public" on public.academic_plan_items for select using (true);
drop policy if exists "Coordinator manages plan items" on public.academic_plan_items;
create policy "Coordinator manages plan items" on public.academic_plan_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.academic_plans, public.academic_plan_items to anon, authenticated;
grant insert, update, delete on public.academic_plans, public.academic_plan_items to authenticated;

-- the current academic year, empty: the coordinator adds the dates (events from the Events page are shown on it automatically)
insert into public.academic_plans (title, starts_on, ends_on, is_current)
select 'Academic Year 2026–2027', date '2026-09-01', date '2027-08-31', true
 where not exists (select 1 from public.academic_plans);

/* ───────────── storage: official documents (PDF) ───────────── */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', true, 20971520, array['application/pdf'])
on conflict (id) do nothing;
drop policy if exists "Coordinator uploads documents" on storage.objects;
drop policy if exists "Coordinator updates documents" on storage.objects;
drop policy if exists "Coordinator deletes documents" on storage.objects;
create policy "Coordinator uploads documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_admin());
create policy "Coordinator updates documents" on storage.objects for update to authenticated
  using (bucket_id = 'documents' and public.is_admin());
create policy "Coordinator deletes documents" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_admin());
