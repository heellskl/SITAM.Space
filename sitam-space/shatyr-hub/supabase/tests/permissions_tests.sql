\set QUIET 1
set client_min_messages = notice;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, false), set_config('role', 'authenticated', false);
$$;
create or replace function pg_temp.as_super() returns void language sql as $$
  select set_config('role', 'postgres', false), set_config('request.jwt.claim.sub', '', false);
$$;
\echo '── v9: registration form, coordinator, head/member'
-- Google OAuth sign-ups (metadata as Google sends it)
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000c001', '240183002@sdu.edu.kz', '{"full_name":"Coord Inator","avatar_url":"https://lh3.googleusercontent.com/a/x"}'),
 ('00000000-0000-0000-0000-00000000c002', 'aigerim.sarsen@sdu.edu.kz', '{"full_name":"Aigerim Sarsen"}'),
 ('00000000-0000-0000-0000-00000000c003', '220103045@sdu.edu.kz', '{"full_name":"Daniyar Bek"}'),
 ('00000000-0000-0000-0000-00000000c004', '220107012@sdu.edu.kz', '{"full_name":"Timur Ospan","role":"teacher"}');
select 'digits e-mail → student: ' || case when (select role::text from profiles where id='00000000-0000-0000-0000-00000000c003')='student' then 'PASS' else 'FAIL' end;
select 'name e-mail → teacher: ' || case when (select role::text from profiles where id='00000000-0000-0000-0000-00000000c002')='teacher' then 'PASS' else 'FAIL' end;
select 'registration form: chosen Teacher is kept: ' || case when (select role::text from profiles where id='00000000-0000-0000-0000-00000000c004')='teacher' then 'PASS' else 'FAIL' end;
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000c005', '230101010@sdu.edu.kz', '{"role":"student","first_name":"Dana","last_name":"Stud","course":"2","major":"Computer Science"}'),
 ('00000000-0000-0000-0000-00000000c006', 'hr@acme.kz', '{"role":"partner","first_name":"Pat","last_name":"Acme","company":"Acme LLC","position":"HR"}');
select 'registration form: student with course/major: ' || case when (select role::text||course||major from profiles where id='00000000-0000-0000-0000-00000000c005')='student2Computer Science' then 'PASS' else 'FAIL' end;
select 'registration form: industry partner with company: ' || case when (select role::text from profiles where id='00000000-0000-0000-0000-00000000c006')='partner'
  and exists (select 1 from company_members cm join companies c on c.id=cm.company_id where cm.user_id='00000000-0000-0000-0000-00000000c006' and c.name='Acme LLC') then 'PASS' else 'FAIL' end;
do $$ begin
  insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000c007', 'teacher@gmail.com', '{"role":"teacher","first_name":"Not","last_name":"SDU"}');
  raise notice 'FAIL teacher with a non-SDU e-mail accepted';
exception when others then raise notice 'PASS teachers / students need an SDU e-mail (%)', sqlerrm; end $$;
select 'name split from Google: ' || case when (select first_name||'|'||last_name from profiles where id='00000000-0000-0000-0000-00000000c002')='Aigerim|Sarsen' then 'PASS' else 'FAIL' end;
do $$ begin
  insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000c0ff', 'someone@gmail.com', '{"full_name":"Not SDU"}');
  raise notice 'FAIL non-SDU Google account was accepted';
exception when others then raise notice 'PASS non-SDU Google account refused (%)', sqlerrm; end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select 'listed e-mail is coordinator: ' || case when (public.my_context()->>'is_coordinator')::boolean and public.is_admin() then 'PASS' else 'FAIL' end;
do $$ declare l public.labs; begin
  l := public.admin_create_lab('Quantum Computing Lab', array['Research']);
  raise notice '% coordinator creates a lab (slug %)', case when l.slug = 'quantum-computing-lab' then 'PASS' else 'FAIL' end, l.slug;
  perform public.assign_lab_head(l.id, '00000000-0000-0000-0000-00000000c003');   -- a student becomes head
  raise notice '% coordinator assigns a student as head', case when exists (select 1 from lab_members where lab_id=l.id and user_id='00000000-0000-0000-0000-00000000c003' and role='lead' and can_edit) then 'PASS' else 'FAIL' end;
end $$;
select pg_temp.as_super();
select pg_temp.as_user('00000000-0000-0000-0000-00000000c002');
select 'teacher is not coordinator: ' || case when not (public.my_context()->>'is_coordinator')::boolean and not public.is_admin() then 'PASS' else 'FAIL' end;
do $$ begin
  perform public.admin_create_lab('Fake Lab');
  raise notice 'FAIL teacher created a lab';
exception when others then raise notice 'PASS only the coordinator creates labs (%)', sqlerrm; end $$;
do $$ begin
  perform public.assign_lab_head((select id from labs where slug='quantum-computing-lab'), auth.uid());
  raise notice 'FAIL teacher made self head';
exception when others then raise notice 'PASS nobody else assigns heads (%)', sqlerrm; end $$;
do $$ declare n int; begin
  update labs set description = 'x' where slug = 'quantum-computing-lab'; get diagnostics n = row_count;
  raise notice '% non-head cannot edit the lab', case when n = 0 then 'PASS' else 'FAIL' end;
end $$;
select pg_temp.as_super();

select pg_temp.as_user('00000000-0000-0000-0000-00000000c003');
select 'student head keeps student type and manages the lab: ' || case when (public.my_context()->'profile'->>'role')='student'
  and jsonb_array_length(public.my_context()->'managed_labs')=1 then 'PASS' else 'FAIL' end;
do $$ declare n int; begin
  update labs set description = 'Quantum algorithms and simulators.' where slug = 'quantum-computing-lab'; get diagnostics n = row_count;
  raise notice '% head edits lab info', case when n = 1 then 'PASS' else 'FAIL' end;
end $$;
do $$ declare r jsonb; begin
  r := public.add_lab_member((select id from labs where slug='quantum-computing-lab'), null, 'aigerim.sarsen@sdu.edu.kz', 'member');
  raise notice '% head adds a registered user as member', case when exists (select 1 from lab_members where user_id='00000000-0000-0000-0000-00000000c002' and role='member' and not can_edit) then 'PASS' else 'FAIL' end;
end $$;
do $$ begin
  perform public.add_lab_member((select id from labs where slug='quantum-computing-lab'), null, 'nobody@sdu.edu.kz', 'member');
  raise notice 'FAIL added an unregistered e-mail';
exception when others then raise notice 'PASS only registered users can be added (%)', sqlerrm; end $$;
do $$ begin
  perform public.add_lab_member((select id from labs where slug='quantum-computing-lab'), null, '220107012@sdu.edu.kz', 'lead');
  raise notice 'FAIL head appointed another head';
exception when others then raise notice 'PASS heads cannot appoint heads (%)', sqlerrm; end $$;
do $$ begin
  update lab_members set role = 'lead' where user_id = '00000000-0000-0000-0000-00000000c002';
  raise notice 'FAIL head promoted a member to head';
exception when others then raise notice 'PASS heads cannot promote to head (%)', sqlerrm; end $$;
do $$ declare n int; begin
  insert into projects (lab_id, kind, status, title) values ((select id from labs where slug='quantum-computing-lab'), 'research', 'ongoing', 'Qubit simulator');
  raise notice 'PASS head creates a lab project';
exception when others then raise notice 'FAIL head project: %', sqlerrm; end $$;
do $$ declare e uuid; begin
  e := public.save_event(null, 'research', 'Quantum meetup', '', now() + interval '3 days', 'C1.2', null, null, 40, array[(select id from labs where slug='quantum-computing-lab')], '{}', '{}');
  raise notice 'PASS head creates an event for the lab';
exception when others then raise notice 'FAIL head event: %', sqlerrm; end $$;
do $$ declare n int; begin
  delete from lab_members where user_id = '00000000-0000-0000-0000-00000000c002'; get diagnostics n = row_count;
  raise notice '% head removes a member', case when n = 1 then 'PASS' else 'FAIL' end;
end $$;
do $$ begin
  delete from lab_members where user_id = auth.uid();
  raise notice 'FAIL head removed own head row';
exception when others then raise notice 'PASS heads cannot remove a head (%)', sqlerrm; end $$;
select pg_temp.as_super();

select pg_temp.as_user('00000000-0000-0000-0000-00000000c002');
do $$ begin
  perform public.save_event(null, 'research', 'Rogue event', '', now() + interval '3 days', 'C1.2', null, null, 40, array[(select id from labs where slug='quantum-computing-lab')], '{}', '{}');
  raise notice 'FAIL non-head created an event';
exception when others then raise notice 'PASS non-heads cannot create events (%)', sqlerrm; end $$;
do $$ begin
  perform public.save_event(null, 'research', 'Rogue event', '', now() + interval '3 days', 'C1.2', null, null, 40, '{}', '{}', '{}');
  raise notice 'FAIL event without a lab';
exception when others then raise notice 'PASS events need a lab the user heads (%)', sqlerrm; end $$;
do $$ begin
  insert into projects (lab_id, kind, status, title) values ((select id from labs where slug='quantum-computing-lab'), 'research', 'ongoing', 'Rogue project');
  raise notice 'FAIL non-head created a project';
exception when others then raise notice 'PASS non-heads cannot create projects (%)', sqlerrm; end $$;
do $$ declare r public.projects; begin
  r := public.submit_project('research', 'My thesis research', 'Summary of my research work.', '{}', '{}', 2026, 'ongoing', '', '', '', '');
  raise notice '% research submission goes to review (moderation=%)', case when r.moderation = 'pending' then 'PASS' else 'FAIL' end, r.moderation;
end $$;
do $$ begin
  perform public.submit_project('startup', 'My startup', 'x', '{}', '{}', 2026, 'ongoing', '', '', '', '');
  raise notice 'FAIL startup accepted';
exception when others then raise notice 'PASS startups stay removed (%)', sqlerrm; end $$;
do $$ declare n int; begin
  update profiles set faculty = 'Engineering', group_name = 'IS-22' where id = auth.uid(); get diagnostics n = row_count;
  raise notice '% user edits faculty / group', case when n = 1 then 'PASS' else 'FAIL' end;
end $$;
do $$ begin
  update profiles set role = 'admin' where id = auth.uid();
  raise notice 'FAIL changed own type';
exception when others then raise notice 'PASS account type cannot be changed by the user (%)', sqlerrm; end $$;
select pg_temp.as_super();

select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
do $$ begin
  perform public.remove_lab_head((select id from labs where slug='quantum-computing-lab'), '00000000-0000-0000-0000-00000000c003');
  raise notice '% coordinator removes a head (stays member)',
    case when exists (select 1 from lab_members where user_id='00000000-0000-0000-0000-00000000c003' and role='member' and not can_edit) then 'PASS' else 'FAIL' end;
end $$;
select pg_temp.as_super();
select 'lab focus uses Education (no Courses / Academic / Education): ' || case when not exists (select 1 from labs where focus && array['Courses', 'Academic / Education']) then 'PASS' else 'FAIL' end;
select 'student leads lost management (heads only): ' || case when not exists (select 1 from lab_members where can_edit and role::text not in ('lead','co_lead')) then 'PASS' else 'FAIL' end;

-- v9.5: no e-mail codes — new accounts are confirmed at once, the form data is still saved
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000c095', '250000095@sdu.edu.kz', null, '{"role":"student","first_name":"New","last_name":"Student","course":"1","major":"Computer Science"}');
select 'registration without code: account confirmed at once: ' || case when (select email_confirmed_at is not null from auth.users where id='00000000-0000-0000-0000-00000000c095') then 'PASS' else 'FAIL' end;
select 'registration without code: profile saved with form data: ' || case when (select role::text||course||major from profiles where id='00000000-0000-0000-0000-00000000c095')='student1Computer Science' then 'PASS' else 'FAIL' end;

-- v9.6: an address typed by hand with capitals / spaces still makes its owner coordinator
insert into public.coordinator_emails (email) values ('  250000095@SDU.edu.kz ');
select pg_temp.as_user('00000000-0000-0000-0000-00000000c095');
select 'coordinator e-mail typed with spaces/capitals still works: ' || case when public.is_coordinator() and (public.my_context()->>'is_coordinator')::boolean then 'PASS' else 'FAIL' end;
select pg_temp.as_super();
select 'coordinator e-mails stored trimmed and lower-case: ' || case when exists (select 1 from public.coordinator_emails where email = '250000095@sdu.edu.kz') then 'PASS' else 'FAIL' end;

\echo '── v10: heads from the coordinator list, competitions & hackathons'
-- a head on the list registers → becomes head of every lab where the list names them (5 labs for s.manbay)
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000d001', 's.manbay@sdu.edu.kz', '{"role":"teacher","first_name":"Shakhnazar-Sultan","last_name":"Manbay","department":"Computer Science"}'),
 ('00000000-0000-0000-0000-00000000d002', 'dilnaz.suleimenova@sdu.edu.kz', '{"role":"teacher","first_name":"Dilnaz","last_name":"Suleimenova","department":"Computer Science"}'),
 ('00000000-0000-0000-0000-00000000d003', '230000303@sdu.edu.kz', '{"role":"student","first_name":"Aru","last_name":"Student","course":"3","major":"Computer Science"}');
select 'listed head registers → head of all 5 of their labs: ' || case when (select count(*) from lab_members where user_id='00000000-0000-0000-0000-00000000d001' and role='lead' and can_edit)=5 then 'PASS' else 'FAIL' end;
-- coordinator assigns a head who was imported by name: the same row is linked, no second head
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select public.assign_lab_head((select id from labs where slug='ai-lab'), '00000000-0000-0000-0000-00000000d002');
select pg_temp.as_super();
select 'assign_lab_head links the imported head row (no duplicate): ' || case when (select count(*) from lab_members where lab_id=(select id from labs where slug='ai-lab') and role in ('lead','co_lead'))=1
  and exists (select 1 from lab_members where lab_id=(select id from labs where slug='ai-lab') and user_id='00000000-0000-0000-0000-00000000d002' and role='lead') then 'PASS' else 'FAIL' end;

-- a head adds an annual hackathon; a student cannot
select pg_temp.as_user('00000000-0000-0000-0000-00000000d001');
select set_config('sitam.ev', public.save_external_event(null, 'hackathon', 'CyberDefence Cup 2027', 'Astana Hub', 'Astana', 'https://example.org', (current_date + 30), (current_date + 31), null, true)::text, false);
select pg_temp.as_super();
select 'lab head adds an annual external event (series created): ' || case when exists (select 1 from external_events e join event_series s on s.id=e.series_id where e.id=current_setting('sitam.ev')::uuid and s.title='CyberDefence Cup') then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d003');
do $$ begin
  perform public.save_external_event(null, 'hackathon', 'Student Hack', null, null, null, current_date, null, null, false);
  raise notice 'FAIL student added an external event';
exception when others then raise notice 'PASS students cannot add external events (%)', sqlerrm; end $$;
do $$ begin
  perform public.save_external_event(current_setting('sitam.ev')::uuid, 'hackathon', 'Renamed', null, null, null, current_date, null, null, false);
  raise notice 'FAIL student edited an external event';
exception when others then raise notice 'PASS only the author / coordinator edits the event (%)', sqlerrm; end $$;
select pg_temp.as_super();

-- the head marks the lab as participating with a student and a mentor (before the event), not another lab
select pg_temp.as_user('00000000-0000-0000-0000-00000000d001');
select public.save_event_participation(current_setting('sitam.ev')::uuid, (select id from labs where slug='cybersecurity-laboratory'),
  '[{"full_name":"Aru Student","role":"student"},{"full_name":"Shakhnazar-Sultan Manbay","role":"mentor"}]'::jsonb);
do $$ begin
  perform public.save_event_participation(current_setting('sitam.ev')::uuid, (select id from labs where slug='ai-lab'), '[]'::jsonb);
  raise notice 'FAIL head registered another lab';
exception when others then raise notice 'PASS heads register only their own labs (%)', sqlerrm; end $$;
do $$ begin
  perform public.save_event_participation(current_setting('sitam.ev')::uuid, (select id from labs where slug='cybersecurity-laboratory'), '[]'::jsonb, '1st place');
  raise notice 'FAIL result before the event';
exception when others then raise notice 'PASS no result before the event starts (%)', sqlerrm; end $$;
select pg_temp.as_super();
select 'participating lab shows a student and a mentor: ' || case when (select string_agg(p.role, ',' order by p.sort_order) from external_event_people p join external_event_labs el on el.id=p.entry_id where el.event_id=current_setting('sitam.ev')::uuid)='student,mentor' then 'PASS' else 'FAIL' end;
-- after the event: result + project
update external_events set starts_on = current_date - 2, ends_on = current_date - 1 where id = current_setting('sitam.ev')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d001');
select public.save_event_participation(current_setting('sitam.ev')::uuid, (select id from labs where slug='cybersecurity-laboratory'),
  '[{"full_name":"Aru Student","role":"student"}]'::jsonb, '1st place', 'Honeypot dashboard', 'https://github.com/example/honeypot');
select pg_temp.as_super();
select 'result and project recorded after the event: ' || case when exists (select 1 from external_event_labs where event_id=current_setting('sitam.ev')::uuid and result='1st place' and project_title='Honeypot dashboard') then 'PASS' else 'FAIL' end;
-- next year's edition links to the same series
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select public.save_external_event(null, 'hackathon', 'CyberDefence Cup 2028', 'Astana Hub', 'Astana', null, (current_date + 400), null, null, true);
select pg_temp.as_super();
select 'new annual edition joins the series: ' || case when (select count(*) from external_events e join event_series s on s.id=e.series_id where s.title='CyberDefence Cup')=2 then 'PASS' else 'FAIL' end;
select 'lab form awards became results (8): ' || case when (select count(*) from external_event_labs where result is not null and updated_by is null)=8 then 'PASS' else 'FAIL' end;
set role anon;
select 'guests can read competitions and results: ' || case when (select count(*) from external_event_labs) >= 9 then 'PASS' else 'FAIL' end;
reset role;

\echo '── v11: focus order, directions, past members, posters'
select 'focus in the order Commercial Projects · Research · Education: ' || case when (select focus from labs where slug='ai-lab') = array['Commercial Projects', 'Research', 'Education'] then 'PASS' else 'FAIL' end;
select 'every listed lab has a direction (21): ' || case when (select count(*) from labs where direction is not null) = 21 then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d001');
select set_config('sitam.m', (select id::text from lab_members where lab_id = (select id from labs where slug='robotics-lab') and role::text not in ('lead','co_lead','former_lead') limit 1), false);
do $$ declare n int; begin
  update lab_members set is_past = true where id = current_setting('sitam.m')::uuid; get diagnostics n = row_count;
  raise notice '% head of another lab cannot mark a past member', case when n = 0 then 'PASS' else 'FAIL' end;
exception when others then raise notice 'PASS head of another lab cannot mark a past member (%)', sqlerrm; end $$;
select pg_temp.as_super();
select public.assign_lab_head((select id from labs where slug='robotics-lab'), '00000000-0000-0000-0000-00000000d003') from (select pg_temp.as_user('00000000-0000-0000-0000-00000000c001')) x;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d003');
do $$ declare n int; begin
  update lab_members set is_past = true, graduation_year = 2025 where id = current_setting('sitam.m')::uuid; get diagnostics n = row_count;
  raise notice '% head marks a past member with graduation year', case when n = 1 then 'PASS' else 'FAIL' end;
end $$;
do $$ begin
  perform public.set_external_event_poster(current_setting('sitam.ev')::uuid, 'https://example.org/p.jpg');
  raise notice 'FAIL a non-author set an external poster';
exception when others then raise notice 'PASS only the author / coordinator sets an external poster (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d001');
select public.set_external_event_poster(current_setting('sitam.ev')::uuid, 'https://example.org/poster.jpg');
select pg_temp.as_super();
select 'author sets the poster of an external event: ' || case when (select poster_url from external_events where id = current_setting('sitam.ev')::uuid) = 'https://example.org/poster.jpg' then 'PASS' else 'FAIL' end;

\echo '── v12: communities, personal e-mail, event place, industry partners'
select 'three communities, 21 labs: ' || case when (select count(*) from labs where kind='community') = 3 and (select count(*) from labs where kind='lab') >= 21 then 'PASS' else 'FAIL' end;
select 'no lab keeps the old focus name: ' || case when not exists (select 1 from labs where 'Industry & Commercial Projects' = any(focus)) then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d003');
do $$ begin
  update labs set kind = 'community' where slug = 'robotics-lab';
  raise notice 'FAIL a head turned the lab into a community';
exception when others then raise notice 'PASS a head cannot turn the lab into a community (%)', sqlerrm; end $$;
do $$ declare n int; begin
  update labs set description = description || '' where slug = 'robotics-lab'; get diagnostics n = row_count;
  raise notice '% the head still edits the lab info', case when n = 1 then 'PASS' else 'FAIL' end;
end $$;
update profiles set personal_email = 'aru.personal@gmail.com' where id = auth.uid();
select 'a user adds a personal e-mail, visible in public_people: ' || case when (select personal_email from public_people where id = '00000000-0000-0000-0000-00000000d003') = 'aru.personal@gmail.com' then 'PASS' else 'FAIL' end;
do $$ begin
  perform public.set_external_event_place(current_setting('sitam.ev')::uuid, 'online', false);
  raise notice 'FAIL a non-author changed the event place';
exception when others then raise notice 'PASS only the author / coordinator sets the event place (%)', sqlerrm; end $$;
do $$ declare n int; begin
  insert into industry_partners (name) values ('Fake Partner LLC'); get diagnostics n = row_count;
  raise notice '% a head added an industry partner', case when n = 0 then 'PASS' else 'FAIL' end;
exception when others then raise notice 'PASS only the coordinator adds industry partners (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d001');
select public.set_external_event_place(current_setting('sitam.ev')::uuid, 'sdu', true);
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
update labs set kind = 'community' where slug = 'robotics-lab';
update labs set kind = 'lab' where slug = 'robotics-lab';
insert into industry_partners (name, short_name, founded_year) values ('Test Partner LLC', 'TP', 2015);
select pg_temp.as_super();
select 'author marks an external event as at SDU, co-hosted: ' || case when (select location_type = 'sdu' and cohosted from external_events where id = current_setting('sitam.ev')::uuid) then 'PASS' else 'FAIL' end;
select 'seeded GameJam / Freedom Challenge are co-hosted at SDU: ' || case when (select count(*) from external_events where cohosted and location_type='sdu' and (title ilike 'SDU Winter GameJam%' or title ilike 'Freedom Ecosystem Challenge%')) >= 2 then 'PASS' else 'FAIL' end;
select 'coordinator adds a partner; seeded partners linked to labs: ' || case when exists (select 1 from industry_partners where name='Test Partner LLC') and (select count(*) from industry_partners where cardinality(lab_ids) > 0) = 5 then 'PASS' else 'FAIL' end;
set role anon;
select 'guests read the partners: ' || case when (select count(*) from industry_partners) >= 6 then 'PASS' else 'FAIL' end;
reset role;

\echo '── v12.1: shared tags, coordinator renames / merges / removes'
update labs set tags = array['pytorch', 'NLP'], skills = array['Python'], equipment = 'GPU server, 3D printer' where slug = 'ai-lab';
update labs set tags = array['PyTorch'], equipment = 'gpu server; Oscilloscope' where slug = 'robotics-lab';
select pg_temp.as_user('00000000-0000-0000-0000-00000000d003');
do $$ begin
  perform public.admin_rename_lab_tag('area', 'pytorch', 'Torch');
  raise notice 'FAIL a lab head renamed a tag in every lab';
exception when others then raise notice 'PASS only the coordinator renames tags (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select public.admin_rename_lab_tag('area', 'pytorch', 'PyTorch');
select public.admin_rename_lab_tag('equipment', 'GPU server', 'GPU cluster');
select public.admin_rename_lab_tag('skill', 'python', null);
select pg_temp.as_super();
select 'merge keeps one spelling per lab: ' || case when (select tags from labs where slug='ai-lab') = array['PyTorch', 'NLP'] and (select tags from labs where slug='robotics-lab') = array['PyTorch'] then 'PASS' else 'FAIL' end;
select 'equipment renamed in every lab: ' || case when (select equipment from labs where slug='ai-lab') = 'GPU cluster, 3D printer' and (select equipment from labs where slug='robotics-lab') = 'GPU cluster, Oscilloscope' then 'PASS' else 'FAIL' end;
select 'removed tag is gone: ' || case when not exists (select 1 from labs where 'Python' = any(skills)) then 'PASS' else 'FAIL' end;

\echo '── v13: event photos, Academic Year Plan'
do $$ declare v uuid; begin
  insert into events (kind, title, starts_at) values ('research', 'Robotics demo day', now() - interval '3 days') returning id into v;
  insert into event_hosts (event_id, lab_id) values (v, (select id from labs where slug='robotics-lab'));
  perform set_config('sitam.sduev', v::text, false);
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d001');
do $$ begin
  perform public.set_event_photos(current_setting('sitam.sduev')::uuid, array['https://example.org/a.jpg']);
  raise notice 'FAIL a head of another lab set event photos';
exception when others then raise notice 'PASS only the organizers set event photos (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d003');
select public.set_event_photos(current_setting('sitam.sduev')::uuid, array['https://example.org/a.jpg', 'https://example.org/b.jpg']);
select pg_temp.as_super();
select 'organizer adds event photos: ' || case when (select cardinality(photo_urls) from events where id = current_setting('sitam.sduev')::uuid) = 2 then 'PASS' else 'FAIL' end;
select 'one current academic plan: ' || case when (select count(*) from academic_plans where is_current) = 1 then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d003');
do $$ begin
  insert into academic_plan_items (plan_id, title, kind, starts_on) select id, 'Fake date', 'other', starts_on from academic_plans limit 1;
  raise notice 'FAIL a lab head added a plan date';
exception when others then raise notice 'PASS only the coordinator edits the plan (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
insert into academic_plan_items (plan_id, title, kind, starts_on, audiences) select id, 'Research Poster Day', 'poster_day', date '2026-12-08', array['students', 'researchers'] from academic_plans where is_current;
select pg_temp.as_super();
set role anon;
select 'guests read the plan: ' || case when (select count(*) from academic_plan_items where title = 'Research Poster Day') = 1 then 'PASS' else 'FAIL' end;
reset role;
