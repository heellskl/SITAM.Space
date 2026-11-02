-- SITAM SPACE v20.5 — researcher Ramis Akhmedov (ramis.akhmedov): Scopus author 57189049749
-- (Scopus author page, 2026-11-02: 8 documents, 50 citations, h-index 3), ORCID 0009-0004-2292-2978.
-- Papers are matched by title, so papers shared with co-authors on SITAM SPACE are linked, not copied. Re-runnable.
update public.professors set scopus_id = '57189049749', orcid_url = 'https://orcid.org/0009-0004-2292-2978',
  total_works = 8, total_citations = 50, h_index = 3, i10_index = 2, updated_at = now()
 where username = 'ramis.akhmedov';
drop table if exists sitam_meta.v_ramis;
create schema if not exists sitam_meta;
create table sitam_meta.v_ramis (title text, year int, type text, venue text, citations int, oa boolean);
insert into sitam_meta.v_ramis values
('FEW-SHOT IMAGE CLASSIFICATION: A SURVEY', 2026, 'Article', 'Eurasian Journal of Mathematical and Computer Applications', 0, true),
('A Performance Evaluation of Flask (WSGI) and Fastapi (ASGI) under High-Concurrency Workloads', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 1, false),
('Search Trees: A Review and Comparative Study', 2025, 'Conference paper', 'International Symposium on Wireless Personal Multimedia Communications, WPMC', 3, false),
('Investigating Elastic-TCP in Mobile Ad Hoc Networks: A Performance Evaluation', 2025, 'Conference paper', 'International Conference on Communication, Computing, Networking, and Control in Cyber-Physical Systems, CCNCPS 2025', 2, false),
('A Comparative Performance Analysis of Diverse Task Scheduling Algorithms for Cloud Computing', 2025, 'Conference paper', '2025 10th International Conference on Information and Network Technologies, ICINT 2025', 4, false),
('Dynamic Load Balancing for Enhanced Network Performance in IoT-Enabled Smart Healthcare With Fog Computing', 2024, 'Article', 'IEEE Access', 28, true),
('Comparative Analysis of Sorting Algorithms: A Review', 2024, 'Conference paper', 'Proceedings of the International Conference on Soft Computing and Machine Intelligence, ISCMI', 12, false),
('Social networking to expand brand awareness and influence on purchase intention', 2016, 'Article', 'Actual Problems of Economics', 0, false);
insert into public.publications (title, year, type, venue, citations, is_open_access, keywords)
select v.title, v.year, v.type, v.venue, v.citations, v.oa, '{}'::text[] from sitam_meta.v_ramis v
 where not exists (select 1 from public.publications p where lower(btrim(p.title)) = lower(btrim(v.title)));
update public.publications p set citations = v.citations, year = coalesce(p.year, v.year), venue = coalesce(nullif(p.venue, ''), v.venue),
       is_open_access = p.is_open_access or v.oa
  from sitam_meta.v_ramis v where lower(btrim(p.title)) = lower(btrim(v.title));
insert into public.publication_authors (publication_id, professor_id)
select p.id, (select id from public.professors where username = 'ramis.akhmedov')
  from public.publications p join sitam_meta.v_ramis v on lower(btrim(p.title)) = lower(btrim(v.title))
on conflict do nothing;
select public.refresh_professor_metrics((select id from public.professors where username = 'ramis.akhmedov'));
update public.professors set publications_updated_at = now() where username = 'ramis.akhmedov';
drop table if exists sitam_meta.v_ramis;
