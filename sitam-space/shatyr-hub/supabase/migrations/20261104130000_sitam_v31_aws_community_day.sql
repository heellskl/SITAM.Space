/* SITAM SPACE v31 — AWS Student Community Day Kaskelen (27 Nov 2026), sent by the user 2026-11-04.
   Hosted by the AWS Student Builders Group community. Poster in public/events/. Registration on Meetup
   (the link is written with chr(47) for the slash). Plain statements, safe to run more than once. */
insert into public.events (kind, title, description, starts_at, room, speaker, speaker_role, tags, poster_url, capacity)
select 'industrial'::public.event_kind, 'AWS Student Community Day Kaskelen',
  replace('Registration is open. AWS Student Builder Group at SDU University brings students together for a full day of cloud technologies, talks from industry practitioners and networking with students and tech professionals. A great opportunity to learn directly from professionals, ask questions and get insights into building a career in tech. 27 November 2026, 10:00–17:00, Blue Hall, SDU Life, Kaskelen. Free, by registration. Seats are limited. Register on Meetup: https:||www.meetup.com|aws-sbg-at-suleyman-demirel-university|events|317103795| . Come with your friends and groupmates.', '|', chr(47)),
  '2026-11-27 10:00:00+05'::timestamptz, 'Blue Hall, SDU Life', null, null, array['AWS', 'Cloud', 'Networking', 'Career']::text[], '/events/aws-student-community-day.jpg', 300
 where not exists (select 1 from public.events where lower(title) = lower('AWS Student Community Day Kaskelen') and starts_at::date = ('2026-11-27 10:00:00+05'::timestamptz)::date);
insert into public.event_hosts (event_id, lab_id)
select e.id, l.id from public.events e, public.labs l
 where e.title = 'AWS Student Community Day Kaskelen' and l.slug = 'aws-student-builders-group'
   and not exists (select 1 from public.event_hosts h where h.event_id = e.id and h.lab_id = l.id);
