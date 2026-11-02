/* SITAM SPACE v12 — communities, "Commercial Projects", two e-mails, event location / organizer, industry partners
   ────────────────────────────────────────────────────────────────────────────────────────────────────────────
   • labs.kind: 'lab' or 'community'. Communities live on the Labs page (tab "Communities") and work like labs
     (own page, heads, team). Only the coordinator turns a lab into a community or back (trigger labs_kind_guard).
     Seeded: AWS Student Builders Group, Competitive Programming Team, SDU Official Hackathon Team.
   • Lab focus "Industry & Commercial Projects" is renamed "Commercial Projects" (order: Commercial Projects · Research · Education).
   • profiles.personal_email: a second, personal e-mail next to the SDU e-mail; shown to signed-in users (public_people).
   • external_events.location_type ('sdu' | 'outside' | 'online') and external_events.cohosted (SDU co-hosts it),
     set with set_external_event_place() by the author or the coordinator. SDU events: "Online" when the room says so.
   • industry_partners: partner companies shown on the Industry page. Everyone reads; only the coordinator edits.
   Re-runnable. */

/* ───────────── communities ───────────── */
alter table public.labs add column if not exists kind text not null default 'lab' check (kind in ('lab', 'community'));

create or replace function public.labs_kind_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind is distinct from old.kind and not public.is_admin() then
    raise exception 'NOT_ALLOWED: only the SITAM coordinator can turn a lab into a community';
  end if;
  return new;
end;
$$;
drop trigger if exists labs_kind_guard on public.labs;
create trigger labs_kind_guard before update of kind on public.labs for each row execute function public.labs_kind_guard();
revoke execute on function public.labs_kind_guard() from anon, authenticated, public;

insert into public.labs (slug, name, kind, focus, description, location)
values
  ('aws-student-builders-group', 'AWS Student Builders Group', 'community', '{}',
   'Student community around Amazon Web Services: cloud workshops, study groups for AWS certifications and hands-on builder sessions.', 'SDU University'),
  ('competitive-programming-team', 'Competitive Programming Team', 'community', '{}',
   'SDU students who train together for programming olympiads and contests (ICPC and others).', 'SDU University'),
  ('sdu-official-hackathon-team', 'SDU Official Hackathon Team', 'community', '{}',
   'The official SDU team for hackathons: students who build prototypes in teams and represent the university at hackathons.', 'SDU University')
on conflict (slug) do update set kind = 'community';

/* ───────────── focus: "Commercial Projects" ───────────── */
update public.labs set focus = array_replace(focus, 'Industry & Commercial Projects', 'Commercial Projects')
 where 'Industry & Commercial Projects' = any(focus);
update public.labs l set focus = coalesce((
  select array_agg(f order by case f when 'Commercial Projects' then 1 when 'Research' then 2 when 'Education' then 3 else 4 end, f)
    from (select distinct unnest(l.focus) as f) d), '{}')
 where cardinality(focus) > 0;

/* ───────────── second (personal) e-mail ───────────── */
alter table public.profiles add column if not exists personal_email text
  check (personal_email is null or personal_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
grant update (personal_email) on public.profiles to authenticated;

-- drop first: an older version of this view may have other columns ("cannot drop columns from view")
drop view if exists public.public_people;
create view public.public_people as
  select p.id, p.first_name, p.last_name, p.role::text as role, p.email, p.course, p.major, p.department, p.position, p.bio,
         p.faculty, p.group_name, p.avatar_url, p.personal_email
    from public.profiles p;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;

/* ───────────── external events: location and organizer ───────────── */
alter table public.external_events add column if not exists location_type text not null default 'outside'
  check (location_type in ('sdu', 'outside', 'online'));
alter table public.external_events add column if not exists cohosted boolean not null default false;

-- known editions held at SDU together with a partner
update public.external_events set location_type = 'sdu', cohosted = true
 where (title ilike 'Freedom Ecosystem Challenge%' or title ilike 'SDU Winter GameJam%') and location_type = 'outside' and not cohosted;
update public.external_events set location_type = 'online'
 where location_type = 'outside' and location ~* '(^|\W)(online|zoom|remote)(\W|$)';

create or replace function public.set_external_event_place(p_event uuid, p_location_type text, p_cohosted boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_external_event(p_event) then raise exception 'NOT_ALLOWED: only the person who added this event or the coordinator can change it'; end if;
  if p_location_type not in ('sdu', 'outside', 'online') then raise exception 'BAD_INPUT: location must be At SDU, Outside SDU or Online'; end if;
  update public.external_events set location_type = p_location_type, cohosted = coalesce(p_cohosted, false), updated_at = now() where id = p_event;
end;
$$;
revoke execute on function public.set_external_event_place(uuid, text, boolean) from anon, public;
grant execute on function public.set_external_event_place(uuid, text, boolean) to authenticated;

/* ───────────── industry partners ───────────── */
create table if not exists public.industry_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  short_name text check (short_name is null or char_length(short_name) <= 40),
  logo_url text check (logo_url is null or logo_url ~* '^https?://'),
  website text check (website is null or website ~* '^https?://'),
  ceo text check (ceo is null or char_length(ceo) <= 160),
  founded_year int check (founded_year is null or founded_year between 1800 and 2100),
  sdu_alumni text[] not null default '{}',
  upcoming_projects text[] not null default '{}',
  completed_projects text[] not null default '{}',
  lab_ids uuid[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists industry_partners_name_ci on public.industry_partners (lower(name));
alter table public.industry_partners enable row level security;
drop policy if exists "Partners are public" on public.industry_partners;
create policy "Partners are public" on public.industry_partners for select using (true);
drop policy if exists "Coordinator manages partners" on public.industry_partners;
create policy "Coordinator manages partners" on public.industry_partners for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.industry_partners to anon, authenticated;
grant insert, update, delete on public.industry_partners to authenticated;

-- partners the labs named in their forms; CEO, year and alumni are filled in by the coordinator
insert into public.industry_partners (name, short_name, lab_ids, sort_order)
select v.name, v.short_name,
       coalesce((select array_agg(l.id) from public.labs l where l.slug = any(v.slugs)), '{}'), v.ord
  from (values
    ('Freedom Holding Corp.', 'Freedom', array['data-analytics-lab'], 1),
    ('Alash Electronics', 'Alash', array['robotics-lab'], 2),
    ('USTEM Foundation', 'USTEM', array['robotics-lab'], 3),
    ('qcloudy', 'qcloudy', array['ai-lab'], 4),
    ('Institute of Mathematics and Mathematical Modeling', 'IMMM', array['mcm-lab'], 5)
  ) as v(name, short_name, slugs, ord)
on conflict ((lower(name))) do nothing;
