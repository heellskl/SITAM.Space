-- SITAM SPACE — update to v25: real events (JANA TALKS, Research Poster Day, Wemathify, QazTech Meetup, DATA CHALLENGE '26, the Roblox talk). Safe to run more than once.
-- Run it AFTER update-to-v23.sql. Supabase → SQL Editor → New query → paste this whole file → Run.
create schema if not exists sitam_meta;
create table if not exists sitam_meta.applied_migrations (version text primary key, name text not null, applied_at timestamptz not null default now());

-- ════════ 20261103120000_sitam_v25_real_events ════════
/* ════════════════════════════════════════════════════════════════════════════
   SITAM SPACE v25 — real events sent by the user (2026-11-03), posters in public/events/
   • Posters may now also be a file of the site itself ("/events/…"), not only an https:// link.
   • Research Poster Day: only the date is known — the time is set to 10:00 and the room "to be announced" (organizers can edit it).
   • SDU events: JANA TALKS (4 Nov), Research Poster Day (13 Nov), past: Darkhonbek Mamataliev talk (7 Sep).
   • Outside SDU / competitions: QazTech Meetup "Tech Talqy" (3 Nov, Almaty), Wemathify (4 Nov, at SDU),
     DATA CHALLENGE '26 (7–8 Nov, Astana).
   • External events of kind "other" are shown as Industry events on the Events page.
   Safe to run more than once (each event is added only if it is not there yet).
   ════════════════════════════════════════════════════════════════════════════ */

alter table public.events drop constraint if exists events_poster_url_check;
alter table public.events add constraint events_poster_url_check check (poster_url is null or poster_url ~* '^(https?://|/events/)');
alter table public.external_events drop constraint if exists external_events_poster_url_check;
alter table public.external_events add constraint external_events_poster_url_check check (poster_url is null or poster_url ~* '^(https?://|/events/)');

/* ───────────── SDU events ───────────── */
insert into public.events (kind, title, description, starts_at, room, speaker, speaker_role, tags, poster_url)
select v.kind::public.event_kind, v.title, v.description, v.starts_at, v.room, v.speaker, v.speaker_role, v.tags, v.poster_url
  from (values
    ('industrial', 'JANA TALKS: «XXI ғасыр көшбасшысы»',
     'JANA TALKS is a new format at SDU University that brings experts from different fields and students together. The first guest is the Rector of SDU University, Arman Zhumazhanov: an open talk about leadership, education, growth and the future. Students can ask their own questions. 17:00–20:00, Blue Hall (304-305), SDU Life Centre.',
     timestamptz '2026-11-04 17:00:00+05', 'Blue Hall (304-305), SDU Life Centre', 'Arman Zhumazhanov', 'Rector of SDU University',
     array['Leadership', 'Talk', 'Q&A'], '/events/jana-talks.jpg'),
    ('research', 'Research Poster Day',
     'Have an idea you are curious about? Turn it into a project and share it with the SDU community. Open to all SDU students; no research experience or finished study is required, beginners are welcome. You can present research proposals, ongoing or completed research, practical projects, literature reviews and analytical studies, on any topic. Individually or in teams of up to 3, in English, Kazakh or Russian. Format: A1 poster + 3-minute presentation. Awards: EDU / SSBL / SITAM School Choice Award, Best Poster Design, Best Research Innovation, People''s Choice Award. Every participant gets a Certificate of Participation. Registration is open. The time and room will be announced.',
     timestamptz '2026-11-13 10:00:00+05', 'TBA', null, null,
     array['Research', 'Posters', 'Students'], '/events/research-poster-day.jpg'),
    ('industrial', 'How to Build a Global IT Career & Crack Tech Interviews',
     'Our first event of the semester. Darkhonbek Mamataliev, Senior iOS Engineer at Roblox (ex-TikTok, ex-Uber), shares his experience from Roblox, TikTok and Uber: FAANG resumes, tech interview strategies and a live Q&A. 10:30–11:30, SDU Campus, room I201.',
     timestamptz '2026-09-07 10:30:00+05', 'I201', 'Darkhonbek Mamataliev', 'Senior iOS Engineer at Roblox (ex-TikTok, ex-Uber)',
     array['Career', 'Interviews', 'iOS'], '/events/darkhonbek-mamataliev.jpg')
  ) as v(kind, title, description, starts_at, room, speaker, speaker_role, tags, poster_url)
 where not exists (select 1 from public.events e where lower(e.title) = lower(v.title) and e.starts_at::date = v.starts_at::date);

-- the posters are set again on every run (in case an event was already added by hand without one)
update public.events set poster_url = '/events/jana-talks.jpg' where title ilike 'JANA TALKS%' and starts_at::date = date '2026-11-04' and poster_url is null;
update public.events set poster_url = '/events/research-poster-day.jpg' where title ilike 'Research Poster Day%' and starts_at::date = date '2026-11-13' and poster_url is null;
update public.events set poster_url = '/events/darkhonbek-mamataliev.jpg' where title ilike 'How to Build a Global IT Career%' and poster_url is null;

/* ───────────── outside SDU and competitions ───────────── */
insert into public.external_events (kind, title, organizer, location, url, starts_on, ends_on, year, description, location_type, cohosted, poster_url)
select v.kind, v.title, v.organizer, v.location, v.url, v.starts_on, v.ends_on, 2026, v.description, v.location_type, false, v.poster_url
  from (values
    ('other', 'QazTech Meetup: Tech Talqy with Narikbi Maksut', 'QazTech Meetup · Activat VC',
     'Choco office, Almaty Towers, Baizakov St. 280, Almaty (separate entrance)', 'https://luma.com/15je1k26',
     date '2026-11-03', date '2026-11-03',
     'Speaker: Narikbi Maksut, iOS developer at Booking.com and author of the Narikbi LIVE podcast. His path started on the ballet stage and led to a global IT company. 2014–2019: iOS developer at iBEC Systems, Crystal Spring, Bugin Group, DAR Ecosystem and Toptal. Since 2019 at Booking.com in Amsterdam. Forbes Kazakhstan "30 under 30" (2022). Narikbi LIVE (since 2020) is a Kazakh-language podcast about professional and personal growth. 17:00. Free entry, registration on Luma. Partner: Freedom.',
     'outside', '/events/qaztech-tech-talqy.jpg'),
    ('olympiad', 'Wemathify — math tournament', 'WE · SITAM',
     'SDU, block I, room I301', 'https://docs.google.com/forms/d/e/1FAIpQLSd5A_7sJT9VIGJM4RLBhX_eJ_llbE83dxkC3AHq2iOOvcwBAQ/viewform',
     date '2026-11-04', date '2026-11-04',
     'A math tournament from simple logic tasks to real olympiad-level problems. 17:30, room I301. Prize pool: 1st place 40 000 ₸, 2nd 30 000 ₸, 3rd 20 000 ₸. Teams of 4; any SITAM student of any year can take part. A refundable deposit of 1 000 ₸ per team confirms participation (it is not returned if the team does not come). The team captain fills in the Google form.',
     'sdu', '/events/wemathify.jpg'),
    ('hackathon', 'DATA CHALLENGE ''26', 'DataSci · NU ADSL · NU Impact Foundation · Freedom',
     'Nazarbayev University, Astana', 'https://datachallenge.datasci.website/',
     date '2026-11-07', date '2026-11-08',
     'Work on a real-world case from the sponsor Freedom Broker and compete for a 1 000 000 ₸ prize pool. Teams of 2 to 4. Offline at Nazarbayev University, Astana. Registration deadline: November 5, 23:59. Free entry, open to all SDU students. Thanks to NU ADSL for the sponsorship and NU Impact Foundation for the support.',
     'outside', '/events/data-challenge-26.jpg')
  ) as v(kind, title, organizer, location, url, starts_on, ends_on, description, location_type, poster_url)
 where not exists (select 1 from public.external_events x where lower(x.title) = lower(v.title));

insert into sitam_meta.applied_migrations (version, name) values ('20261103120000', 'sitam_v25_real_events') on conflict do nothing;
