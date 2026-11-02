-- SITAM SPACE v22.1 — researcher Ualikhan Sadyk (ualikhan.sadyk): Scopus author 57460291500
-- (Scopus author page, 2026-11-02: 17 documents, 84 citations, h-index 6), ORCID 0000-0002-2674-1611.
-- Papers are matched by title, so papers shared with co-authors on SITAM SPACE are linked, not copied. Re-runnable.
update public.professors set scopus_id = '57460291500', orcid_url = 'https://orcid.org/0000-0002-2674-1611',
  total_works = 17, total_citations = 84, h_index = 6, i10_index = 3, updated_at = now()
 where username = 'ualikhan.sadyk';
drop table if exists sitam_meta.v_sadyk;
create schema if not exists sitam_meta;
create table sitam_meta.v_sadyk (title text, year int, type text, venue text, citations int, oa boolean);
insert into sitam_meta.v_sadyk values
('Kazakh banknote image dataset', 2026, 'Article', 'Data in Brief', 0, true),
('Physicochemical and Ecotoxicological Characterization of Therapeutic Sulfide–Silt Peloids from Lake Maly Akkol', 2026, 'Article', 'Water (Switzerland)', 2, true),
('Interpretable Hybrid CNN-BiLSTM-Attention Model for ECG Arrhythmia Classification', 2026, 'Conference paper', 'SIST 2026 - 2026 IEEE 6th International Conference on Smart Information Systems and Technologies, Conference Proceedings', 0, false),
('Development of Multimodal Neural Network for Suicidal Ideation Detection Using Kazakh-Russian BERT and Attention Mechanism', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('Benchmarking Deep Transfer Learning for Banknote Recognition: Vision Transformers Vs. CNNs on the KZ-BD Dataset', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('Development of Novel Neural Network Architecture for Automated Pharmaceutical and Vitamin Identification Using Image Classification', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('A Comprehensive Survey of Methods and Challenges of Vehicle Routing Problem with Uncertainties', 2025, 'Review', 'Mathematics', 14, true),
('An Adaptive Steganographic Method for Reversible Information Embedding in X-Ray Images', 2025, 'Article', 'Computers', 5, true),
('Comparative analysis of machine learning approaches in Kazakh banknote classification', 2024, 'Article', 'Bulletin of Electrical Engineering and Informatics', 8, true),
('KZ-BD: Dataset of Kazakhstan banknotes with annotations', 2024, 'Data paper', 'Data in Brief', 5, true),
('Enhanced U-Net Architecture for Lung Segmentation on Computed Tomography and X-Ray Images', 2024, 'Article', 'International Journal of Advanced Computer Science and Applications', 15, true),
('State-of-the-Art Review of Deep Learning Methods in Fake Banknote Recognition Problem', 2024, 'Article', 'International Journal of Advanced Computer Science and Applications', 14, true),
('Overview of Deep Learning Models for Banknote Recognition', 2023, 'Conference paper', 'Proceedings - 2023 17th International Conference on Electronics Computer and Computation, ICECCO 2023', 7, false),
('Design and Evaluation of a Personalized Job Recommendation System for Computer Science Students Using Hybrid Approach', 2023, 'Conference paper', 'Proceedings - 2023 17th International Conference on Electronics Computer and Computation, ICECCO 2023', 7, false),
('MBTI-based recommendation system for extracurricular activities for high school students', 2023, 'Conference paper', 'Proceedings - 2023 17th International Conference on Electronics Computer and Computation, ICECCO 2023', 5, false),
('A Comparative Study of the Impact of Electronic Devices on University Students'' Academic Performance', 2023, 'Conference paper', 'Proceedings - 2023 17th International Conference on Electronics Computer and Computation, ICECCO 2023', 1, false),
('Effective Ways to Pass Exams in Programming Disciplines and Optimize the Process of Analyzing Results. Case Study: Suleyman Demirel University', 2021, 'Conference paper', 'Proceedings - 2021 16th International Conference on Electronics Computer and Computation, ICECCO 2021', 1, false);
insert into public.publications (title, year, type, venue, citations, is_open_access, keywords)
select v.title, v.year, v.type, v.venue, v.citations, v.oa, '{}'::text[] from sitam_meta.v_sadyk v
 where not exists (select 1 from public.publications p where lower(btrim(p.title)) = lower(btrim(v.title)));
update public.publications p set citations = v.citations, year = coalesce(p.year, v.year), venue = coalesce(nullif(p.venue, ''), v.venue),
       is_open_access = p.is_open_access or v.oa
  from sitam_meta.v_sadyk v where lower(btrim(p.title)) = lower(btrim(v.title));
insert into public.publication_authors (publication_id, professor_id)
select p.id, (select id from public.professors where username = 'ualikhan.sadyk')
  from public.publications p join sitam_meta.v_sadyk v on lower(btrim(p.title)) = lower(btrim(v.title))
on conflict do nothing;
select public.refresh_professor_metrics((select id from public.professors where username = 'ualikhan.sadyk'));
update public.professors set publications_updated_at = now() where username = 'ualikhan.sadyk';
drop table if exists sitam_meta.v_sadyk;
