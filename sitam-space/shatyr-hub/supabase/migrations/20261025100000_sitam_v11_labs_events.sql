/* SITAM SPACE v11 — lab focus & direction, past team members, upcoming activities, event posters
   ────────────────────────────────────────────────────────────────────────────────────────────
   • Lab focus is now 3 categories in this order: Industry & Commercial Projects · Research · Education
     ("Courses" and the old "Academic / Education" become "Education").
   • labs.direction: the second lab filter (AI & Data Science, Cloud & Cybersecurity, Robotics & IoT,
     Multimedia & Digital, Mathematics & Fundamental Sciences).
   • labs.upcoming_activities: what the lab plans next (shown on the lab page).
   • lab_members.is_past + graduation_year: past team members with the year they graduated.
   • Event posters: events.poster_url (SDU events) and external_events.poster_url (competitions, hackathons…).
   Re-runnable. */

/* ───────────── focus ───────────── */
update public.labs set focus = array_replace(array_replace(focus, 'Courses', 'Education'), 'Academic / Education', 'Education')
 where focus && array['Courses', 'Academic / Education'];
-- one entry per category, in the agreed order
update public.labs l set focus = coalesce((
  select array_agg(f order by case f when 'Industry & Commercial Projects' then 1 when 'Research' then 2 when 'Education' then 3 else 4 end, f)
    from (select distinct unnest(l.focus) as f) d), '{}')
 where cardinality(focus) > 0;

/* ───────────── direction ───────────── */
alter table public.labs add column if not exists direction text
  check (direction is null or direction in ('AI & Data Science', 'Cloud & Cybersecurity', 'Robotics & IoT', 'Multimedia & Digital', 'Mathematics & Fundamental Sciences'));
update public.labs set direction = d.direction
  from (values
    ('ai-lab', 'AI & Data Science'), ('computer-vision', 'AI & Data Science'), ('data-analytics-lab', 'AI & Data Science'), ('statistics', 'AI & Data Science'),
    ('cloud-computing', 'Cloud & Cybersecurity'), ('distributed-systems-and-computing-lab', 'Cloud & Cybersecurity'), ('cybersecurity-laboratory', 'Cloud & Cybersecurity'),
    ('cisco-networking-academy', 'Cloud & Cybersecurity'), ('fortinet', 'Cloud & Cybersecurity'), ('redhat-laboratory', 'Cloud & Cybersecurity'),
    ('robotics-lab', 'Robotics & IoT'), ('iot-laboratory', 'Robotics & IoT'), ('microelectronics-chip-lab', 'Robotics & IoT'),
    ('multimedia-studio-f06', 'Multimedia & Digital'), ('multimedia-3d-lab-1109', 'Multimedia & Digital'), ('multimedia-lab', 'Multimedia & Digital'),
    ('applied-mathematics', 'Mathematics & Fundamental Sciences'), ('analysis', 'Mathematics & Fundamental Sciences'), ('algebra', 'Mathematics & Fundamental Sciences'),
    ('physics-lab', 'Mathematics & Fundamental Sciences'), ('mcm-lab', 'Mathematics & Fundamental Sciences')
  ) as d(slug, direction)
 where labs.slug = d.slug and labs.direction is null;

/* ───────────── upcoming activities ───────────── */
alter table public.labs add column if not exists upcoming_activities text[] not null default '{}';

/* ───────────── past team members ───────────── */
alter table public.lab_members add column if not exists is_past boolean not null default false;
alter table public.lab_members add column if not exists graduation_year int check (graduation_year is null or graduation_year between 1990 and 2100);
-- heads edit these two through the lab form (column grants, like the other team fields)
grant insert (is_past, graduation_year) on public.lab_members to authenticated;
grant update (is_past, graduation_year) on public.lab_members to authenticated;

/* ───────────── event posters ───────────── */
alter table public.events add column if not exists poster_url text check (poster_url is null or poster_url ~* '^https?://');
alter table public.external_events add column if not exists poster_url text check (poster_url is null or poster_url ~* '^https?://');

-- SDU events: the people who manage the event set its poster
create or replace function public.set_event_poster(p_event uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_event(p_event) then raise exception 'NOT_ALLOWED: only the organizers of this event can change its poster'; end if;
  if p_url is not null and p_url !~* '^https?://' then raise exception 'BAD_INPUT: the poster must be an https:// link'; end if;
  update public.events set poster_url = nullif(trim(p_url), '') where id = p_event;
end;
$$;

-- external events: the author or the coordinator
create or replace function public.set_external_event_poster(p_event uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_external_event(p_event) then raise exception 'NOT_ALLOWED: only the person who added this event or the coordinator can change its poster'; end if;
  if p_url is not null and p_url !~* '^https?://' then raise exception 'BAD_INPUT: the poster must be an https:// link'; end if;
  update public.external_events set poster_url = nullif(trim(p_url), '') where id = p_event;
end;
$$;

revoke execute on function public.set_event_poster(uuid, text) from anon, public;
revoke execute on function public.set_external_event_poster(uuid, text) from anon, public;
grant execute on function public.set_event_poster(uuid, text) to authenticated;
grant execute on function public.set_external_event_poster(uuid, text) to authenticated;
