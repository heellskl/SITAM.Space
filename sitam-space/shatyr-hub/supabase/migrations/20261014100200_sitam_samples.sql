-- SITAM SPACE — SAMPLE events and opportunities (safe to delete).
-- Labs, projects and professors come from the real data migration; the listings
-- and events below are placeholders so the pages are not empty. The company is
-- clearly marked as a sample. To remove everything here:
--   delete from public.events where created_at < now() and description like '%[sample]%';
--   delete from public.opportunities where description like '%[sample]%';
--   delete from public.companies where name = 'Demo Partner (sample)';

insert into public.companies (name, description, verified)
values ('Demo Partner (sample)', 'Placeholder company used for sample listings. [sample]', true)
on conflict ((lower(name))) do nothing;

-- Events: this week and the next three. Research Days (Tue 17:00) and Industrial Days (Thu 17:00), Room C1.2.
with weeks as (select generate_series(0, 3) as w),
base as (select (date_trunc('week', (now() at time zone 'Asia/Almaty'))::date) as monday),
rows as (
  select 'research'::public.event_kind as kind, b.monday + 1 + 7 * w.w as day, w.w,
         (array['AI Lab open demo: CampusTour & CareerQuest', 'Honest model evaluation: data leakage in practice', 'From idea to prototype: building AI projects', 'Explainable AI for clinical prediction'])[w.w + 1] as title,
         (array['ai-lab', 'data-analytics-lab', 'ai-lab', 'data-analytics-lab'])[w.w + 1] as lab_slug
    from base b, weeks w
  union all
  select 'industrial', b.monday + 3 + 7 * w.w, w.w,
         (array['Data careers: what partners look for in juniors', 'Industry case night: fraud detection with ML', 'MLOps in production: a partner talk', 'Internships Q&A with industry partners'])[w.w + 1],
         (array['data-analytics-lab', 'ai-lab', 'ai-lab', 'data-analytics-lab'])[w.w + 1]
    from base b, weeks w
),
ins as (
  insert into public.events (kind, title, description, starts_at, speaker, speaker_role, tags, organizer_id)
  select r.kind, r.title,
         case when r.kind = 'research' then 'Lab presentation with a live demo, followed by Q&A. [sample]'
              else 'A lab introduces an industry partner: talk, case discussion and networking. [sample]' end,
         (r.day + time '17:00') at time zone 'Asia/Almaty',
         null, null, case when r.kind = 'research' then array['Research'] else array['Industry', 'Career'] end, null
    from rows r
  returning id, kind, title
)
insert into public.event_hosts (event_id, lab_id)
select ins.id, l.id from ins join rows r on r.title = ins.title join public.labs l on l.slug = r.lab_slug;

-- Industrial Days are co-hosted by the sample company.
insert into public.event_hosts (event_id, company_id)
select e.id, c.id from public.events e, public.companies c
 where e.kind = 'industrial' and e.description like '%[sample]%' and c.name = 'Demo Partner (sample)'
on conflict do nothing;

-- Opportunities
with o as (
  insert into public.opportunities (category, industrial_type, title, description, requirements, tags, deadline, duration, paid, compensation, work_format, created_by)
  values
   ('industrial', 'vacancy', 'Junior Data Engineer', 'Build and maintain data pipelines for analytics teams, with a senior mentor. [sample]', array['3rd/4th year or graduate', 'SQL and Python'], array['Python', 'SQL', 'Airflow'], current_date + 30, 'Full-time', true, null, 'hybrid', null),
   ('industrial', 'internship', 'Machine Learning Intern', 'Three-month internship: train, evaluate and ship a model with a product team. [sample]', array['2nd year or above', 'Python, basic ML'], array['ML', 'Python'], current_date + 40, '3 months', true, 'Paid internship', 'onsite', null),
   ('industrial', 'project', 'Customer-support assistant with retrieval', 'A team project for the partner: prototype a retrieval-based assistant and measure answer quality. [sample]', array['Team of 2–3', 'Interest in LLMs'], array['LLM', 'RAG'], current_date + 25, '8 weeks', true, null, 'hybrid', null),
   ('lab', null, 'Research assistant · CampusTour', 'Join the AI Lab team building CampusTour: data collection, model training and demo preparation. [sample]', array['Python', '8–10 h/week'], array['AI', 'Python'], current_date + 21, '1 semester', false, null, 'onsite', null),
   ('lab', null, 'Research assistant · student dropout analytics', 'Help the MADRID Lab with learning-analytics experiments and a paper draft. [sample]', array['Statistics / ML course', 'Python or R'], array['Analytics', 'ML'], current_date + 28, '1 semester', false, null, 'onsite', null),
   ('research', null, 'Leakage-aware explainable AI for hypertension staging', 'Research case: reproduce the baseline, run leakage checks and SHAP analysis. [sample]', array['ML coursework', 'Interest in healthcare AI'], array['XAI', 'Healthcare'], current_date + 35, '1–2 semesters', false, null, 'onsite', null)
  returning id, title, category
)
insert into public.opportunity_hosts (opportunity_id, lab_id, company_id, project_id)
select o.id,
       case when o.title like '%CampusTour%' then (select id from public.labs where slug = 'ai-lab')
            when o.title like '%dropout%' then (select id from public.labs where slug = 'data-analytics-lab') end,
       case when o.category = 'industrial' then (select id from public.companies where name = 'Demo Partner (sample)') end,
       case when o.category = 'research' then (select id from public.projects where title ilike 'Leakage-aware explainable AI%' limit 1) end
  from o;

-- The research case is also hosted by its lab.
insert into public.opportunity_hosts (opportunity_id, lab_id)
select o.id, l.id from public.opportunities o, public.labs l
 where o.category = 'research' and o.description like '%[sample]%' and l.slug = 'data-analytics-lab'
on conflict do nothing;
