-- SITAM SPACE v25.1: past event FAIO (Fizmat AI Olympiad) final at SDU University, 27-29 October 2026. Safe to run more than once.
insert into public.external_events (kind, title, organizer, location, starts_on, ends_on, year, description, location_type, cohosted, poster_url)
select 'olympiad', 'FAIO International AI Olympiad: final at SDU University', 'Fizmat AI Olympiad (FAIO)', 'SDU University', '2026-10-27'::date, '2026-10-29'::date, 2026,
       'The final of the Fizmat AI Olympiad (FAIO), an international olympiad in artificial intelligence, took place at SDU University. The 20 best school students from 25 countries came, including Thailand, Vietnam, Turkey and several European countries. SDU students helped as volunteers.',
       'sdu', false, '/events/faio-2026.jpg'
 where not exists (select 1 from public.external_events where lower(title) = lower('FAIO International AI Olympiad: final at SDU University'));
insert into sitam_meta.applied_migrations (version, name) values ('20261103130000', 'sitam_v25_1_faio') on conflict do nothing;
