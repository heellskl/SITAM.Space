-- SITAM SPACE v20.2 — researcher Mohammed Alaa Ala'anzy (username m.al-hadeethi): Scopus author 59193748300
-- (Scopus author page, 2026-11-02: 49 documents, 571 citations, h-index 14). Papers are matched by title (no EIDs in the copy).
-- The citations of "Range wise busy checking…" (21) = 571 total − 550 of the other 48 papers. Re-runnable.
update public.professors set scopus_id = '59193748300', orcid_url = 'https://orcid.org/0000-0002-0005-7037',
  total_works = 49, total_citations = 571, h_index = 14, i10_index = 16, updated_at = now()
 where username = 'm.al-hadeethi';
drop table if exists pg_temp.v_alaa;
create temp table v_alaa (title text, year int, type text, venue text, citations int, oa boolean);
insert into v_alaa values
('Zero trust architecture for industry 5.0 and industrial IoT: A systematic review, taxonomy, and research roadmap', 2026, 'Review', 'Computer Networks', 0, false),
('End-to-end optimization based on residual neural networks for improved optical fiber communication', 2026, 'Article', 'ICT Express', 1, true),
('Connect-4 AI: A Comprehensive Taxonomy and Critical Review of Methods and Metrics', 2026, 'Review', 'Symmetry', 3, true),
('Performance evaluation of GPU-based parallel sorting algorithms', 2026, 'Article', 'PLOS ONE', 3, true),
('Privacy Leakage in Blockchain-Based Healthcare Systems: A Layered Taxonomy and Systematic Review', 2026, 'Review', 'IEEE Internet of Things Journal', 0, false),
('Solver-Integrated Deformation-Aware BVH Updates for Real-Time Soft-Body Simulation', 2026, 'Article', 'IEEE Transactions on Visualization and Computer Graphics', 0, false),
('Throughput and Latency Benchmarking of Backend Web Frameworks Under Resource-Constrained Environments', 2026, 'Conference paper', 'International Conference on Electrical, Computer, and Energy Technologies, ICECET 2026', 0, false),
('An Empirical Evaluation of LLM Function Calling in Enterprise Backend Systems: Latency, Reliability, and Development Trade-offs', 2026, 'Conference paper', 'International Conference on Electrical, Computer, and Energy Technologies, ICECET 2026', 0, false),
('PM2.5 Forecasting in Almaty: A Benchmarking of Advanced Deep Learning and Hybrid Models', 2026, 'Conference paper', '2026 11th International Conference on Information and Network Technologies, ICINT 2026', 0, false),
('In-Place Sorting Algorithms: A Comparative Analysis', 2026, 'Conference paper', '2026 11th International Conference on Information and Network Technologies, ICINT 2026', 0, false),
('Federated Learning Strategies for Fine-Tuning Large Language Models: A Systematic Literature Review', 2026, 'Conference paper', '2026 11th International Conference on Information and Network Technologies, ICINT 2026', 1, false),
('Autoencoder-Based Resnet Block for Laser Phase Noise in Optical Communications', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('Personalized Federated Learning for Sovereign Personal AI Agents: A Review', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 1, false),
('Interference-Aware Peak Localization in OTFS-Based Radar Sensing', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('A Blockchain-Integrated Confidence-Weighted Fusion Model for Diagnosing the Stages of Thyroid Cancer', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('Interoperability Challenges in Wearable Iot for Healthcare with Federated Learning: A Review', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 1, false),
('OFDM in Fiber Optical Communication Systems: Challenges and Mitigation Techniques', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('A Performance and Scalability Evaluation of Monolithic (Django) vs. Microservice (FastAPI) Architectures for Asynchronous API Workloads in Python', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 0, false),
('A Performance Evaluation of Flask (WSGI) and Fastapi (ASGI) under High-Concurrency Workloads', 2026, 'Conference paper', 'Proceedings - 2026 18th International Conference on Electronics, Computer, and Computation, ICECCO 2026', 1, false),
('A Review on Deep Learning Autoencoder in the Design of Next-Generation Communication Systems', 2026, 'Review', 'IEEE Open Journal of the Communications Society', 8, true),
('Incident-aware smart prioritization framework for penetration testing and prevention of URL-based cybersecurity attacks in industry 4.0 IoT networks', 2025, 'Article', 'Scientific Reports', 6, true),
('Real time smart parking system based on IoT and fog computing evaluated through a practical case study', 2025, 'Article', 'Scientific Reports', 7, true),
('Empowering cloud providers: optimised locust-inspired algorithm for SLA violation mitigation in green cloud computing', 2025, 'Article', 'Computing', 2, false),
('Hybrid Merge Sort Algorithms: A Review', 2025, 'Conference paper', 'International Conference on Electrical, Computer, and Energy Technologies, ICECET 2025', 0, false),
('Search Trees: A Review and Comparative Study', 2025, 'Conference paper', 'International Symposium on Wireless Personal Multimedia Communications, WPMC', 3, false),
('PLATOS: A POWER AND LATENCY AWARE TASK ORIENTED SCHEDULING STRATEGY FOR HEALTHCARE IOT IN FOG COMPUTING', 2025, 'Article', 'Eurasian Journal of Mathematical and Computer Applications', 2, true),
('Investigating Elastic-TCP in Mobile Ad Hoc Networks: A Performance Evaluation', 2025, 'Conference paper', 'International Conference on Communication, Computing, Networking, and Control in Cyber-Physical Systems, CCNCPS 2025', 2, false),
('MBISort Algorithm: A Novel Hybrid Sorting Approach for Efficient Data Processing', 2025, 'Conference paper', 'Proceedings of the 2025 17th International Conference on Electronics, Computers and Artificial Intelligence, ECAI 2025', 3, false),
('A Comparative Performance Analysis of Diverse Task Scheduling Algorithms for Cloud Computing', 2025, 'Conference paper', '2025 10th International Conference on Information and Network Technologies, ICINT 2025', 4, false),
('Design and Evaluation of Arabic Handwritten Digit Recognition System Using Biologically Plausible Methods', 2024, 'Article', 'Arabian Journal for Science and Engineering', 6, false),
('Design and Evaluation of a Low-Power Wide-Area Network (LPWAN)-Based Emergency Response System for Individuals with Special Needs in Smart Buildings', 2024, 'Article', 'Sensors', 29, true),
('Quality of interaction-based predictive model for support of online learning in pandemic situations', 2024, 'Article', 'Knowledge and Information Systems', 12, false),
('Dynamic Load Balancing for Enhanced Network Performance in IoT-Enabled Smart Healthcare With Fog Computing', 2024, 'Article', 'IEEE Access', 28, true),
('Real-Time Oversight of Parking Space Management in IoT Edge Computing for Industry 4.0: A Case Study', 2024, 'Conference paper', '2024 IEEE 7th International Symposium on Telecommunication Technologies: Exploring Future Frontiers in Telecommunication and Vehicular Technologies, ISTT 2024', 4, false),
('Optimizing Cloud Computing Performance With an Enhanced Dynamic Load Balancing Algorithm for Superior Task Allocation', 2024, 'Article', 'IEEE Access', 25, true),
('An Edge Computing-Based and Threat Behavior-Aware Smart Prioritization Framework for Cybersecurity Intrusion Detection and Prevention of IEDs in Smart Grids with Integration of Modified LGBM and One Class-SVM Models', 2024, 'Article', 'IEEE Access', 35, true),
('Predictive Energy Management for Docker Containers in Cloud Computing: A Time Series Analysis Approach', 2024, 'Article', 'IEEE Access', 21, true),
('Comparative Analysis of Sorting Algorithms: A Review', 2024, 'Conference paper', 'Proceedings of the International Conference on Soft Computing and Machine Intelligence, ISCMI', 12, false),
('Performance and Scalability Analysis of SDN-Based Large-Scale Wi-Fi Networks', 2023, 'Article', 'Applied Sciences (Switzerland)', 17, true),
('Replication-Based Dynamic Energy-Aware Resource Provisioning for Scientific Workflows', 2023, 'Article', 'Applied Sciences (Switzerland)', 7, true),
('An exploration to graphics processing unit spot price prediction', 2022, 'Article', 'Cluster Computing', 6, false),
('Mapping and Consolidation of VMs Using Locust-Inspired Algorithms for Green Cloud Computing', 2022, 'Article', 'Neural Processing Letters', 17, false),
('Locust inspired algorithm for cloudlet scheduling in cloud computing environments', 2021, 'Article', 'Sensors', 17, true),
('Fault-tolerant and data-intensive resource scheduling and management for scientific applications in cloud computing', 2021, 'Article', 'Sensors', 22, true),
('Scientific Workflows Management and Scheduling in Cloud Computing: Taxonomy, Prospects, and Challenges', 2021, 'Article', 'IEEE Access', 62, true),
('Optimising Cloud Servers Utilisation Based on Locust-Inspired Algorithm', 2020, 'Conference paper', '2020 7th International Conference on Soft Computing and Machine Intelligence, ISCMI 2020', 15, false),
('Dynamic energy efficient resource allocation strategy for load balancing in fog environment', 2020, 'Article', 'IEEE Access', 92, true),
('Load Balancing and Server Consolidation in Cloud Computing Environments: A Meta-Study', 2019, 'Article', 'IEEE Access', 75, true),
('Range wise busy checking 2-way imbalanced algorithm for cloudlet allocation in cloud environment', 2018, 'Conference paper', 'Journal of Physics: Conference Series', 21, true);
insert into public.publications (title, year, type, venue, citations, is_open_access, keywords)
select v.title, v.year, v.type, v.venue, v.citations, v.oa, '{}'::text[] from v_alaa v
 where not exists (select 1 from public.publications p where lower(btrim(p.title)) = lower(btrim(v.title)));
update public.publications p set citations = v.citations, year = coalesce(p.year, v.year), venue = coalesce(nullif(p.venue, ''), v.venue),
       is_open_access = p.is_open_access or v.oa
  from v_alaa v where lower(btrim(p.title)) = lower(btrim(v.title));
insert into public.publication_authors (publication_id, professor_id)
select p.id, (select id from public.professors where username = 'm.al-hadeethi')
  from public.publications p join v_alaa v on lower(btrim(p.title)) = lower(btrim(v.title))
on conflict do nothing;
select public.refresh_professor_metrics((select id from public.professors where username = 'm.al-hadeethi'));
update public.professors set publications_updated_at = now() where username = 'm.al-hadeethi'
  and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'professors' and column_name = 'publications_updated_at');
