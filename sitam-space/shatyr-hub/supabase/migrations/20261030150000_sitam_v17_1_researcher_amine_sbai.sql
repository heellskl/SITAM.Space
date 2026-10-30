-- SITAM SPACE v17.1 — researcher Amine Sbai (Statistics lab head): profile + 7 papers (zbMATH/MaRDI, arXiv, publisher pages).
-- Citations / h-index stay 0 until they are taken from Scopus. Generated with scripts/build-seed.mjs. Re-runnable.

-- Amine Sbai
insert into public.professors (username, first_name, last_name, full_name, job_title, degree, email, photo_url, orcid_url, scopus_id, scholar_url,
  h_index, i10_index, total_citations, total_works, keywords, topics)
values ('amine.sbai', 'Amine', 'Sbai', 'Amine Sbai', 'Assistant Professor SDU', 'PhD', null,
  null, null, '57223768105', 'https://scholar.google.com/citations?user=Mr3jVPgAAAAJ&hl=en',
  0, 0, 0, 7,
  array['control theory', 'controllability', 'degenerate/singular equations', 'parabolic equations', 'wave equations', 'stabilization', 'moment method', 'B-splines']::text[], '[]'::jsonb)
on conflict (username) do update set first_name = excluded.first_name, last_name = excluded.last_name, full_name = excluded.full_name,
  job_title = excluded.job_title, degree = excluded.degree, email = excluded.email, photo_url = coalesce(excluded.photo_url, public.professors.photo_url),
  orcid_url = excluded.orcid_url, scopus_id = excluded.scopus_id, scholar_url = excluded.scholar_url, h_index = excluded.h_index,
  i10_index = excluded.i10_index, total_citations = excluded.total_citations, total_works = excluded.total_works,
  keywords = excluded.keywords, topics = excluded.topics, updated_at = now();
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Boundary controllability for a coupled system of parabolic equations with singular potentials', 2022, 'Article', 'https://doi.org/10.1007/s00030-022-00792-1', 'Nonlinear Differential Equations and Applications NoDEA',
  'Springer Nature', 0, false, 'https://doi.org/10.1007/s00030-022-00792-1', null, array['controllability', 'singular parabolic systems', 'biorthogonal families', 'spectral analysis', 'moment method']::text[]
where not exists (select 1 from public.publications where lower(doi) = lower('https://doi.org/10.1007/s00030-022-00792-1'));
update public.publications set citations = 0, keywords = array['controllability', 'singular parabolic systems', 'biorthogonal families', 'spectral analysis', 'moment method']::text[] where lower(doi) = lower('https://doi.org/10.1007/s00030-022-00792-1');
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'amine.sbai') from public.publications where lower(doi) = lower('https://doi.org/10.1007/s00030-022-00792-1') on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Boundary controllability for a coupled system of degenerate/singular parabolic equations', 2022, 'Article', 'https://doi.org/10.3934/eect.2021055', 'Evolution Equations and Control Theory',
  'American Institute of Mathematical Sciences (AIMS)', 0, false, 'https://doi.org/10.3934/eect.2021055', null, array['boundary controllability', 'coupled systems', 'degenerate parabolic equations', 'singular potentials', 'moment method']::text[]
where not exists (select 1 from public.publications where lower(doi) = lower('https://doi.org/10.3934/eect.2021055'));
update public.publications set citations = 0, keywords = array['boundary controllability', 'coupled systems', 'degenerate parabolic equations', 'singular potentials', 'moment method']::text[] where lower(doi) = lower('https://doi.org/10.3934/eect.2021055');
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'amine.sbai') from public.publications where lower(doi) = lower('https://doi.org/10.3934/eect.2021055') on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Stabilization for degenerate equations with drift and small singular term', 2025, 'Article', 'https://doi.org/10.1002/mma.10593', 'Mathematical Methods in the Applied Sciences',
  'Wiley', 0, true, 'https://doi.org/10.1002/mma.10593', null, array['degenerate wave equation', 'singular potentials', 'drift', 'stabilization', 'exponential decay']::text[]
where not exists (select 1 from public.publications where lower(doi) = lower('https://doi.org/10.1002/mma.10593'));
update public.publications set citations = 0, keywords = array['degenerate wave equation', 'singular potentials', 'drift', 'stabilization', 'exponential decay']::text[] where lower(doi) = lower('https://doi.org/10.1002/mma.10593');
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'amine.sbai') from public.publications where lower(doi) = lower('https://doi.org/10.1002/mma.10593') on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Boundary Controllability for Degenerate/Singular Hyperbolic Equations in Nondivergence Form with Drift', 2025, 'Article', 'https://doi.org/10.1007/s00245-025-10236-8', 'Applied Mathematics and Optimization',
  'Springer Nature', 0, true, 'https://doi.org/10.1007/s00245-025-10236-8', null, array['boundary controllability', 'degenerate hyperbolic equations', 'drift term', 'singular potentials']::text[]
where not exists (select 1 from public.publications where lower(doi) = lower('https://doi.org/10.1007/s00245-025-10236-8'));
update public.publications set citations = 0, keywords = array['boundary controllability', 'degenerate hyperbolic equations', 'drift term', 'singular potentials']::text[] where lower(doi) = lower('https://doi.org/10.1007/s00245-025-10236-8');
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'amine.sbai') from public.publications where lower(doi) = lower('https://doi.org/10.1007/s00245-025-10236-8') on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Controllability for a 2×2 nonlinear degenerate parabolic system via one boundary control force', 2025, 'Article', 'https://doi.org/10.48550/arXiv.2411.05773', 'Evolution Equations and Control Theory',
  'American Institute of Mathematical Sciences (AIMS)', 0, false, 'https://doi.org/10.48550/arXiv.2411.05773', null, array['boundary controllability', 'nonlinear systems', 'degenerate parabolic equations', 'moment method']::text[]
where not exists (select 1 from public.publications where lower(doi) = lower('https://doi.org/10.48550/arXiv.2411.05773'));
update public.publications set citations = 0, keywords = array['boundary controllability', 'nonlinear systems', 'degenerate parabolic equations', 'moment method']::text[] where lower(doi) = lower('https://doi.org/10.48550/arXiv.2411.05773');
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'amine.sbai') from public.publications where lower(doi) = lower('https://doi.org/10.48550/arXiv.2411.05773') on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Minimal time of the pointwise controllability for a degenerate/singular parabolic equation and related numerical results via B-splines', 2026, 'Article', 'https://doi.org/10.1016/j.cam.2025.116892', 'Journal of Computational and Applied Mathematics',
  'Elsevier', 0, true, 'https://doi.org/10.1016/j.cam.2025.116892', null, array['controllability', 'pointwise control', 'minimal null control time', 'moment method', 'B-splines']::text[]
where not exists (select 1 from public.publications where lower(doi) = lower('https://doi.org/10.1016/j.cam.2025.116892'));
update public.publications set citations = 0, keywords = array['controllability', 'pointwise control', 'minimal null control time', 'moment method', 'B-splines']::text[] where lower(doi) = lower('https://doi.org/10.1016/j.cam.2025.116892');
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'amine.sbai') from public.publications where lower(doi) = lower('https://doi.org/10.1016/j.cam.2025.116892') on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Degenerate/singular beam-type equations: a controllability result', 2026, 'Article', null, 'Mathematical Control and Related Fields',
  'American Institute of Mathematical Sciences (AIMS)', 0, false, null, null, array['beam equation', 'degenerate equations', 'singular potentials', 'controllability']::text[]
where not exists (select 1 from public.publications where lower(title) = lower('Degenerate/singular beam-type equations: a controllability result'));
update public.publications set citations = 0, keywords = array['beam equation', 'degenerate equations', 'singular potentials', 'controllability']::text[] where lower(title) = lower('Degenerate/singular beam-type equations: a controllability result');
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'amine.sbai') from public.publications where lower(title) = lower('Degenerate/singular beam-type equations: a controllability result') on conflict do nothing;
