-- SITAM SPACE v10 — results the labs reported in the lab form (awards), as external events with outcomes.
-- Re-runnable: rows are matched by title. Dates the form did not give stay empty (only the year is shown).

insert into public.event_series (title, kind, organizer, website) values
  ('RoboCup', 'competition', 'RoboCup Federation', 'https://www.robocup.org'),
  ('Republican Student Olympiad in Mathematics', 'olympiad', 'Ministry of Science and Higher Education of Kazakhstan', null),
  ('SDU Winter GameJam', 'hackathon', 'SDU Multimedia Lab', null),
  ('Global Game Jam', 'hackathon', 'Global Game Jam', 'https://globalgamejam.org')
on conflict ((lower(title))) do nothing;

with ev(title, kind, organizer, location, starts_on, ends_on, year, series) as (values
  ('RoboCup Central Asia', 'competition', 'RoboCup', null, null::date, null::date, null::int, 'RoboCup'),
  ('RoboCon Republic', 'competition', null, 'Kazakhstan', null, null, null, null),
  ('Freedom Hackathon 2025', 'hackathon', 'Freedom Holding Corp.', null, null, null, 2025, null),
  ('Freedom Ecosystem Challenge 2026', 'hackathon', 'SDU University × Freedom Holding Corp.', 'SDU University', '2026-05-17', '2026-05-17', 2026, null),
  ('Republican Student Subject Olympiad in Mathematics 2026', 'olympiad', 'Nazarbayev University', 'Astana', '2026-04-11', '2026-04-12', 2026, 'Republican Student Olympiad in Mathematics'),
  ('PunkVerse GameJam 2025', 'hackathon', 'PunkVerse', null, null, null, 2025, null),
  ('KBTU Global GameJam 2024', 'hackathon', 'KBTU', 'Almaty', null, null, 2024, 'Global Game Jam'),
  ('SDU Winter GameJam 2026', 'hackathon', 'SDU Multimedia Lab', 'SDU University', null, null, 2026, 'SDU Winter GameJam')
)
insert into public.external_events (title, kind, organizer, location, starts_on, ends_on, year, series_id, created_by)
select e.title, e.kind, e.organizer, e.location, e.starts_on, e.ends_on, e.year,
       (select s.id from public.event_series s where lower(s.title) = lower(e.series)), null
  from ev e
 where not exists (select 1 from public.external_events x where lower(x.title) = lower(e.title));

with r(event_title, lab_slug, result, notes) as (values
  ('RoboCup Central Asia', 'robotics-lab', '2nd place', null),
  ('RoboCon Republic', 'robotics-lab', '1st place', null),
  ('Freedom Hackathon 2025', 'ai-lab', '2nd place', null),
  ('Freedom Ecosystem Challenge 2026', 'data-analytics-lab', '1st place in all three tracks',
     'Tracks: Freedom Holding Corp., Freedom Insurance, Freedom Finance. Prizes: 500,000 ₸, 250,000 ₸, 100,000 ₸.'),
  ('Republican Student Subject Olympiad in Mathematics 2026', 'mcm-lab', '3rd prize (team competition)', 'SDU University team trained in the lab.'),
  ('PunkVerse GameJam 2025', 'multimedia-lab', 'Best Narrative · Best Game Design', null),
  ('KBTU Global GameJam 2024', 'multimedia-lab', 'Best Game', null),
  ('SDU Winter GameJam 2026', 'multimedia-lab', '1st place · 2nd place', null)
)
insert into public.external_event_labs (event_id, lab_id, result, notes, updated_by)
select e.id, l.id, r.result, r.notes, null
  from r
  join public.external_events e on lower(e.title) = lower(r.event_title)
  join public.labs l on l.slug = r.lab_slug
on conflict (event_id, lab_id) do nothing;

-- mentor of the olympiad team (from the MCM Lab form)
insert into public.external_event_people (entry_id, member_id, full_name, role)
select el.id, (select m.id from public.lab_members m where m.lab_id = el.lab_id and public.name_key(m.full_name) = public.name_key('Nurbek Kakharman') limit 1),
       'Nurbek Kakharman', 'mentor'
  from public.external_event_labs el
  join public.external_events e on e.id = el.event_id
  join public.labs l on l.id = el.lab_id
 where lower(e.title) = lower('Republican Student Subject Olympiad in Mathematics 2026') and l.slug = 'mcm-lab'
   and not exists (select 1 from public.external_event_people p where p.entry_id = el.id);
