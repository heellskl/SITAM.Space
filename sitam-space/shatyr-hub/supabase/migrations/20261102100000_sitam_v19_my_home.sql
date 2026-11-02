/* ════════════════════════════════════════════════════════════════════════════
   SITAM SPACE v19 — personal Home page
   • profiles.experience: where the person worked or did an internship
     [{kind: 'work' | 'internship', company, role, start: 'YYYY-MM', end: 'YYYY-MM' | null}], max 30.
     Edited only by the person (own row, column grant); shown to signed-in users (public_people), like the job title.
   Everything else on the Home page is read from existing data (labs, registrations, applications, researcher card).
   Safe to run more than once.
   ════════════════════════════════════════════════════════════════════════════ */

create or replace function public.valid_experience(p jsonb)
returns boolean language sql immutable as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 30
     and not exists (
       select 1 from jsonb_array_elements(p) e
        where jsonb_typeof(e) <> 'object'
           or coalesce(e->>'kind', '') not in ('work', 'internship')
           or char_length(btrim(coalesce(e->>'company', ''))) not between 1 and 120
           or char_length(coalesce(e->>'role', '')) > 120
           or coalesce(e->>'start', '') !~ '^(\d{4}-\d{2})?$'
           or coalesce(e->>'end', '') !~ '^(\d{4}-\d{2})?$')
$$;

alter table public.profiles add column if not exists experience jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_experience_valid') then
    alter table public.profiles add constraint profiles_experience_valid check (public.valid_experience(experience));
  end if;
end $$;
grant update (experience) on public.profiles to authenticated;

drop view if exists public.public_people;
create view public.public_people as
  select p.id, p.first_name, p.last_name, p.role::text as role, p.email, p.course, p.major, p.department, p.position, p.bio,
         p.faculty, p.group_name, p.avatar_url, p.personal_email, p.graduation_year, p.company, p.experience
    from public.profiles p;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;
