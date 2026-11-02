-- SITAM SPACE v20.3 — researcher Yerbol Palzhanov: Scopus author 57223905820 (2026-11-02: 5 documents, 46 citations,
-- h-index 4), ORCID 0000-0002-8997-8675. Generated with scripts/build-seed.mjs. Re-runnable.
-- Yerbol Palzhanov
insert into public.professors (username, first_name, last_name, full_name, job_title, degree, email, photo_url, orcid_url, scopus_id, scholar_url,
  h_index, i10_index, total_citations, total_works, keywords, topics)
values ('yerbol.palzhanov', 'Yerbol', 'Palzhanov', 'Yerbol Palzhanov', null, null, null,
  null, 'https://orcid.org/0000-0002-8997-8675', '57223905820', 'https://scholar.google.com/citations?view_op=search_authors&mauthors=Yerbol+Palzhanov',
  4, 2, 46, 5,
  array['finite element methods', 'phase-field models', 'Cahn–Hilliard equation', 'surface PDEs', 'two-phase flow', 'lipid vesicles', 'computational mathematics']::text[], '[]'::jsonb)
on conflict (username) do update set first_name = excluded.first_name, last_name = excluded.last_name, full_name = excluded.full_name,
  job_title = excluded.job_title, degree = excluded.degree, email = excluded.email, photo_url = coalesce(excluded.photo_url, public.professors.photo_url),
  orcid_url = excluded.orcid_url, scopus_id = excluded.scopus_id, scholar_url = excluded.scholar_url, h_index = excluded.h_index,
  i10_index = excluded.i10_index, total_citations = excluded.total_citations, total_works = excluded.total_works,
  keywords = excluded.keywords, topics = excluded.topics, updated_at = now();
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'A Scalar Auxiliary Variable Unfitted FEM for the Surface Cahn–Hilliard Equation', 2023, 'Article', null, 'Journal of Scientific Computing',
  null, 4, false, 'https://www.scopus.com/pages/publications/85174525693?origin=resultslist', '2-s2.0-85174525693', array['unfitted finite element method', 'scalar auxiliary variable', 'Cahn–Hilliard equation', 'surface PDEs']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-85174525693');
update public.publications set citations = 4, keywords = array['unfitted finite element method', 'scalar auxiliary variable', 'Cahn–Hilliard equation', 'surface PDEs']::text[] where scopus_eid = '2-s2.0-85174525693';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'yerbol.palzhanov') from public.publications where scopus_eid = '2-s2.0-85174525693' on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'On Fusogenicity of Positively Charged Phased-Separated Lipid Vesicles: Experiments and Computational Simulations', 2023, 'Article', null, 'Biomolecules',
  null, 6, true, 'https://www.scopus.com/pages/publications/85175066301?origin=resultslist', '2-s2.0-85175066301', array['lipid vesicles', 'fusogenicity', 'phase separation', 'computational simulation']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-85175066301');
update public.publications set citations = 6, keywords = array['lipid vesicles', 'fusogenicity', 'phase separation', 'computational simulation']::text[] where scopus_eid = '2-s2.0-85175066301';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'yerbol.palzhanov') from public.publications where scopus_eid = '2-s2.0-85175066301' on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'A Comparison of Cahn–Hilliard and Navier–Stokes–Cahn–Hilliard Models on Manifolds', 2022, 'Article', null, 'Vietnam Journal of Mathematics',
  null, 5, false, 'https://www.scopus.com/pages/publications/85130712098?origin=resultslist', '2-s2.0-85130712098', array['Cahn–Hilliard equation', 'Navier–Stokes–Cahn–Hilliard', 'manifolds', 'phase-field models']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-85130712098');
update public.publications set citations = 5, keywords = array['Cahn–Hilliard equation', 'Navier–Stokes–Cahn–Hilliard', 'manifolds', 'phase-field models']::text[] where scopus_eid = '2-s2.0-85130712098';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'yerbol.palzhanov') from public.publications where scopus_eid = '2-s2.0-85130712098' on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'Lipid domain coarsening and fluidity in multicomponent lipid vesicles: A continuum based model and its experimental validation', 2022, 'Article', null, 'Biochimica et Biophysica Acta - Biomembranes',
  null, 11, true, 'https://www.scopus.com/pages/publications/85126832666?origin=resultslist', '2-s2.0-85126832666', array['lipid domains', 'multicomponent vesicles', 'continuum model', 'phase separation']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-85126832666');
update public.publications set citations = 11, keywords = array['lipid domains', 'multicomponent vesicles', 'continuum model', 'phase separation']::text[] where scopus_eid = '2-s2.0-85126832666';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'yerbol.palzhanov') from public.publications where scopus_eid = '2-s2.0-85126832666' on conflict do nothing;
insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select 'A decoupled, stable, and linear FEM for a phase-field model of variable density two-phase incompressible surface flow', 2021, 'Article', null, 'Computer Methods in Applied Mechanics and Engineering',
  null, 20, true, 'https://www.scopus.com/pages/publications/85116256299?origin=resultslist', '2-s2.0-85116256299', array['finite element method', 'phase-field model', 'two-phase flow', 'surface flow']::text[]
where not exists (select 1 from public.publications where scopus_eid = '2-s2.0-85116256299');
update public.publications set citations = 20, keywords = array['finite element method', 'phase-field model', 'two-phase flow', 'surface flow']::text[] where scopus_eid = '2-s2.0-85116256299';
insert into public.publication_authors (publication_id, professor_id)
select id, (select id from public.professors where username = 'yerbol.palzhanov') from public.publications where scopus_eid = '2-s2.0-85116256299' on conflict do nothing;
