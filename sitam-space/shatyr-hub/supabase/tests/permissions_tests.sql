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

-- v17: a listed e-mail alone is not enough (sign-up does not prove the e-mail); the project owner binds the account
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select 'v17 listed e-mail alone does not make a coordinator: ' || case when not public.is_coordinator() and not public.is_admin() then 'PASS' else 'FAIL' end;
select pg_temp.as_super();
update public.coordinator_emails c set user_id = u.id from auth.users u where lower(u.email) = c.email and c.email = '240183002@sdu.edu.kz';
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select 'bound coordinator account is coordinator: ' || case when (public.my_context()->>'is_coordinator')::boolean and public.is_admin() then 'PASS' else 'FAIL' end;
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

\echo '── v29: centers, lab leads 2026, lab passports'
select 'v29 every lab is in the AI center: ' || case when not exists (select 1 from labs where kind='lab' and center is distinct from 'ai') then 'PASS' else 'FAIL' end;
select 'v29 one account per lead, first password to change: ' || case when (select count(*) from auth.users u join profiles p on p.id=u.id where u.email in (select email from sitam_meta.lab_leads_2026) and p.must_change_password and u.encrypted_password is not null)=(select count(distinct email) from sitam_meta.lab_leads_2026) then 'PASS' else 'FAIL' end;
select 'v29 s.manbay heads 5 labs, Kavokin and Duisen head applied mathematics: ' || case when (select count(*) from lab_members m join profiles p on p.id=m.user_id where p.email='s.manbay@sdu.edu.kz' and m.can_edit)=5
  and (select count(*) from lab_members m join labs l on l.id=m.lab_id where l.slug='applied-mathematics' and m.user_id is not null and m.can_edit)>=2 then 'PASS' else 'FAIL' end;
select 'v29 no duplicate head rows (Kalieva matched): ' || case when (select count(*) from lab_members m join labs l on l.id=m.lab_id where l.slug='physics-lab' and m.role in ('lead','co_lead'))=1 then 'PASS' else 'FAIL' end;
select 'v29 no pending claims left for the leads: ' || case when not exists (select 1 from account_claims a join profiles p on p.id=a.user_id join lab_members m on m.id=a.member_id join labs l on l.id=m.lab_id join sitam_meta.lab_leads_2026 x on x.slug=l.slug and x.email=p.email where a.status='pending') then 'PASS' else 'FAIL' end;
select set_config('sitam.lead', (select id::text from profiles where email='s.manbay@sdu.edu.kz'), false);
select pg_temp.as_user(current_setting('sitam.lead')::uuid);
select 'v29 a lead sees own context with must_change_password: ' || case when (public.my_context()->'profile'->>'must_change_password')::boolean then 'PASS' else 'FAIL' end;
select (public.save_lab_passport((select id from labs where slug='fortinet'), 2026, 'Fortinet Lab', 'F 101', 'Manbay', 'FortiGate', null, null, null, true)).status;
select 'v29 a lead fills and submits the passport of own lab: ' || case when exists (select 1 from lab_passports where year=2026 and status='submitted') then 'PASS' else 'FAIL' end;
do $$ begin perform public.save_lab_passport((select id from labs where slug='algebra'), 2026, 'x', null, null, null, null, null, null, false); raise notice 'v29 lead cannot fill another lab passport: FAIL'; exception when others then raise notice 'ok'; end $$;
select 'v29 lead cannot fill another lab passport: ' || case when not exists (select 1 from lab_passports where lab_id=(select id from labs where slug='algebra')) then 'PASS' else 'FAIL' end;
do $$ begin update labs set center='math' where slug='fortinet'; exception when others then null; end $$;
select 'v29 a lead cannot move a lab to another center: ' || case when (select center from labs where slug='fortinet')='ai' then 'PASS' else 'FAIL' end;
do $$ begin perform public.approve_lab_passport((select id from labs where slug='fortinet'), 2026); exception when others then null; end $$;
select 'v29 a lead cannot approve: ' || case when (select status from lab_passports where year=2026 and lab_id=(select id from labs where slug='fortinet'))='submitted' then 'PASS' else 'FAIL' end;
select public.clear_must_change_password();
select 'v29 the flag clears after the new password: ' || case when not (select must_change_password from profiles where id=current_setting('sitam.lead')::uuid) then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c095');
select public.approve_lab_passport((select id from labs where slug='fortinet'), 2026);
update labs set center='math' where slug='algebra';
select 'v29 the coordinator approves and moves a lab: ' || case when (select status from lab_passports where lab_id=(select id from labs where slug='fortinet'))='approved' and (select center from labs where slug='algebra')='math' then 'PASS' else 'FAIL' end;
select pg_temp.as_super();
-- the v10 / v17 checks below register s.manbay and dilnaz.suleimenova from scratch, so the v29 accounts are removed first
update lab_members set user_id = null where user_id in (select id from auth.users where email in ('s.manbay@sdu.edu.kz', 'dilnaz.suleimenova@sdu.edu.kz'));
delete from auth.identities where user_id in (select id from auth.users where email in ('s.manbay@sdu.edu.kz', 'dilnaz.suleimenova@sdu.edu.kz'));
delete from profiles where email in ('s.manbay@sdu.edu.kz', 'dilnaz.suleimenova@sdu.edu.kz');
delete from auth.users where email in ('s.manbay@sdu.edu.kz', 'dilnaz.suleimenova@sdu.edu.kz');

\echo '── v10: heads from the coordinator list, competitions & hackathons'
-- a head on the list registers → becomes head of every lab where the list names them (5 labs for s.manbay)
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000d001', 's.manbay@sdu.edu.kz', '{"role":"teacher","first_name":"Shakhnazar-Sultan","last_name":"Manbay","department":"Computer Science"}'),
 ('00000000-0000-0000-0000-00000000d002', 'dilnaz.suleimenova@sdu.edu.kz', '{"role":"teacher","first_name":"Dilnaz","last_name":"Suleimenova","department":"Computer Science"}'),
 ('00000000-0000-0000-0000-00000000d003', '230000303@sdu.edu.kz', '{"role":"student","first_name":"Aru","last_name":"Student","course":"3","major":"Computer Science"}');
-- v17: the registration only creates claims; the head rights come after the coordinator confirms them
select 'v17 listed head registers → 5 claims, no rights yet: ' || case when (select count(*) from account_claims where user_id='00000000-0000-0000-0000-00000000d001' and status='pending')=5
  and not exists (select 1 from lab_members where user_id='00000000-0000-0000-0000-00000000d001') then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select count(public.decide_account_claim(id, true)) from account_claims where user_id='00000000-0000-0000-0000-00000000d001' and status='pending';
select pg_temp.as_super();
select 'listed head confirmed by the coordinator → head of all 5 of their labs: ' || case when (select count(*) from lab_members where user_id='00000000-0000-0000-0000-00000000d001' and role='lead' and can_edit)=5 then 'PASS' else 'FAIL' end;
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

\echo '── v15: submission done with a lab or a researcher'
select pg_temp.as_user('00000000-0000-0000-0000-00000000d001');
do $$ declare v uuid; begin
  select (public.submit_project('research', 'Student study of Kazakh NER', 'A student study of named entity recognition for Kazakh texts.', '{}', '{}', 2026, 'ongoing', null, null, null, null)).id into v;
  perform set_config('sitam.sub', v::text, false);
end $$;
select public.set_submission_affiliation(current_setting('sitam.sub')::uuid, (select id from labs where slug='ai-lab'), null);
do $$ begin
  perform public.set_submission_affiliation(current_setting('sitam.sub')::uuid, (select id from labs where slug='ai-lab'), (select id from professors limit 1));
  raise notice 'FAIL a submission linked to a lab and a researcher at once';
exception when others then raise notice 'PASS a lab or a researcher, not both (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d003');
do $$ begin
  perform public.set_submission_affiliation(current_setting('sitam.sub')::uuid, null, null);
  raise notice 'FAIL someone else changed the submission';
exception when others then raise notice 'PASS only the author links the submission (%)', sqlerrm; end $$;
select pg_temp.as_super();
select 'author links the submission to a lab: ' || case when (select related_lab_id = (select id from labs where slug='ai-lab') and lab_id is null from projects where id = current_setting('sitam.sub')::uuid) then 'PASS' else 'FAIL' end;

\echo '── v17: alumni, offers of help, Co-Heads by the Head, researcher profile requests, B2B to a lab'
select pg_temp.as_super();
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000a001', 'alum.dana@gmail.com', '{"role":"alumni","first_name":"Dana","last_name":"Alum","faculty":"SITAM","graduation_year":"2019","position":"ML Engineer","company":"Kaspi.kz"}');
select 'alumni sign up with a personal e-mail and job details: ' || case when (select role::text = 'alumni' and graduation_year = 2019 and company = 'Kaspi.kz' and position = 'ML Engineer' and faculty = 'SITAM' from profiles where id = '00000000-0000-0000-0000-00000000a001') then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-00000000a001');
select set_config('sitam.offer', public.offer_help((select id from labs where slug='robotics-lab'), 'mentor', 'I can mentor a student robotics project on weekends.')::text, false);
do $$ begin
  perform public.submit_project('project', 'Alumni side project', 'An alumni project that should not be accepted as a student submission.', '{}', '{}', 2026, 'ongoing', null, null, null, null);
  raise notice 'FAIL alumni submitted a student project';
exception when others then raise notice 'PASS alumni do not submit student projects (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c005');
do $$ begin
  perform public.offer_help((select id from labs where slug='robotics-lab'), 'mentor', 'A student trying to offer mentoring.');
  raise notice 'FAIL a student sent an alumni offer';
exception when others then raise notice 'PASS only alumni offer help (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d001');
do $$ begin
  perform public.respond_help_offer(current_setting('sitam.offer')::uuid, 'accepted');
  raise notice 'FAIL a head of another lab answered the offer';
exception when others then raise notice 'PASS only the heads of that lab answer (%)', sqlerrm; end $$;
select 'heads of other labs do not see the offer: ' || case when (select count(*) from help_offers) = 0 then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d003');
select public.respond_help_offer(current_setting('sitam.offer')::uuid, 'accepted');
select 'the lab head sees and accepts the offer: ' || case when (select status from help_offers where id = current_setting('sitam.offer')::uuid) = 'accepted' then 'PASS' else 'FAIL' end;

-- Co-Heads: the Head appoints and removes them; nobody but the coordinator touches the Head
select set_config('sitam.cohead', (public.add_lab_member((select id from labs where slug='robotics-lab'), null, '230101010@sdu.edu.kz', 'co_lead', null)->>'id'), false);
select 'the Head appoints a Co-Head (who can manage): ' || case when (select role::text = 'co_lead' and can_edit from lab_members where id = current_setting('sitam.cohead')::uuid) then 'PASS' else 'FAIL' end;
do $$ begin
  perform public.add_lab_member((select id from labs where slug='robotics-lab'), null, '220107012@sdu.edu.kz', 'tech_lead', null);
  raise notice 'FAIL a head added a Tech lead';
exception when others then raise notice 'PASS member positions stay as before (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c005');
do $$ begin
  update lab_members set role = 'lead' where id = current_setting('sitam.cohead')::uuid;
  raise notice 'FAIL a Co-Head made themselves the Head';
exception when others then raise notice 'PASS a Co-Head cannot become the Head (%)', sqlerrm; end $$;
do $$ begin
  perform public.add_lab_member((select id from labs where slug='robotics-lab'), null, 'aigerim.sarsen@sdu.edu.kz', 'co_lead', null);
  raise notice 'FAIL a Co-Head appointed another Co-Head';
exception when others then raise notice 'PASS only the Head appoints Co-Heads (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000d003');
do $$ declare n int; begin
  update lab_members set role = 'member' where id = current_setting('sitam.cohead')::uuid; get diagnostics n = row_count;
  raise notice '% the Head turns a Co-Head back into a member', case when n = 1 then 'PASS' else 'FAIL' end;
end $$;
select pg_temp.as_super();

-- researcher profile: request → coordinator approves → the teacher edits only their card
select pg_temp.as_user('00000000-0000-0000-0000-00000000c005');
do $$ begin
  perform public.request_researcher_profile(null, 'Dana Stud', null, null, null, null, null, null, null);
  raise notice 'FAIL a student asked for a researcher profile';
exception when others then raise notice 'PASS researcher profiles are for teachers (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c002');
select set_config('sitam.rreq', public.request_researcher_profile(null, 'Aigerim Sarsen', 'Computer Science', 'Senior Lecturer', 'PhD', 'https://www.scopus.com/authid/detail.uri?authorId=57190000001', 'https://orcid.org/0000-0001-2345-6789', null, null)::text, false);
do $$ begin
  perform public.review_researcher_request(current_setting('sitam.rreq')::uuid, true, null);
  raise notice 'FAIL a teacher approved their own request';
exception when others then raise notice 'PASS only the coordinator approves (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select set_config('sitam.newprof', public.review_researcher_request(current_setting('sitam.rreq')::uuid, true, 'Welcome')::text, false);
select pg_temp.as_super();
select 'approved: a new researcher card linked to the teacher: ' || case when (select profile_id = '00000000-0000-0000-0000-00000000c002' and scopus_id = '57190000001' from professors where id = current_setting('sitam.newprof')::uuid) then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c002');
select public.update_my_researcher_profile('I work on NLP for Kazakh.', 'Tue 14:00–16:00, room F305', array['NLP', 'Kazakh language'], 'https://orcid.org/0000-0001-2345-6789', null, '57190000001');
select 'the teacher edits their own card: ' || case when (select bio like 'I work%' and 'NLP' = any(interests) from professors where id = current_setting('sitam.newprof')::uuid) then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c004');
do $$ begin
  perform public.update_my_researcher_profile('Not mine', null, null, null, null, null);
  raise notice 'FAIL a teacher without a card edited one';
exception when others then raise notice 'PASS teachers edit only their own card (%)', sqlerrm; end $$;
select set_config('sitam.claim', public.request_researcher_profile((select id from professors where profile_id is null limit 1), 'Timur Ospan', null, null, null, null, null, null, 'This is me')::text, false);
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select public.review_researcher_request(current_setting('sitam.claim')::uuid, true, null);
select pg_temp.as_super();
select '"This is me" links the existing card: ' || case when exists (select 1 from professors p join researcher_profile_requests r on r.professor_id = p.id where r.id = current_setting('sitam.claim')::uuid and p.profile_id = '00000000-0000-0000-0000-00000000c004') then 'PASS' else 'FAIL' end;

-- B2B "Contact a lab"
set role anon;
insert into partner_requests (company_name, contact_name, contact_email, request_type, has_budget, tech_stack, description, requested_lab_id)
values ('Acme', 'Pat', 'pat@acme.kz', 'contact_lab', false, 'Python', 'We would like to talk to the robotics lab about a joint drone project.', (select id from labs where slug='robotics-lab'));
reset role;
select 'B2B "Contact a lab" stored with the lab: ' || case when exists (select 1 from partner_requests where request_type::text = 'contact_lab' and requested_lab_id is not null) then 'PASS' else 'FAIL' end;

\echo '── v18: researchers keep their own publications up to date'
select pg_temp.as_user('00000000-0000-0000-0000-00000000c002');
select set_config('sitam.pub', public.save_publication(current_setting('sitam.newprof')::uuid, null, 'Kazakh NER with small data', 2026, 'Article', 'Journal of NLP', 'https://doi.org/10.1000/KAZ.1', null, 7, true)::text, false);
select 'the teacher adds a paper to their card: ' || case when exists (select 1 from publication_authors where publication_id = current_setting('sitam.pub')::uuid and professor_id = current_setting('sitam.newprof')::uuid) and (select doi from publications where id = current_setting('sitam.pub')::uuid) = '10.1000/kaz.1' then 'PASS' else 'FAIL' end;
select 'the card totals and "updated" date follow: ' || case when (select total_citations >= 7 and publications_updated_at is not null from professors where id = current_setting('sitam.newprof')::uuid) then 'PASS' else 'FAIL' end;
select public.import_publications(current_setting('sitam.newprof')::uuid, '[{"title":"Kazakh NER with small data","year":"2026","doi":"10.1000/kaz.1","citations":"12"},{"title":"Speech corpus for Kazakh","year":"2025","citations":"3","eid":"2-s2.0-1"}]'::jsonb);
select 'import adds new papers and refreshes citations: ' || case when (select citations from publications where id = current_setting('sitam.pub')::uuid) = 12 and exists (select 1 from publications where scopus_eid = '2-s2.0-1') then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c004');
do $$ begin
  perform public.save_publication(current_setting('sitam.newprof')::uuid, null, 'Not my card', 2026, null, null, null, null, 0, false);
  raise notice 'FAIL a teacher changed another researcher''s papers';
exception when others then raise notice 'PASS teachers change only their own card (%)', sqlerrm; end $$;
do $$ begin
  perform public.remove_publication(current_setting('sitam.newprof')::uuid, current_setting('sitam.pub')::uuid);
  raise notice 'FAIL a teacher removed another researcher''s paper';
exception when others then raise notice 'PASS teachers remove only from their own card (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c005');
do $$ begin
  perform public.import_publications(current_setting('sitam.newprof')::uuid, '[]'::jsonb);
  raise notice 'FAIL a student imported papers';
exception when others then raise notice 'PASS students cannot change publications (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select public.save_publication(current_setting('sitam.newprof')::uuid, current_setting('sitam.pub')::uuid, 'Kazakh NER with small data', 2026, 'Article', 'Journal of NLP', null, null, 15, true);
select 'the coordinator updates any card: ' || case when (select citations from publications where id = current_setting('sitam.pub')::uuid) = 15 then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c002');
select public.remove_publication(current_setting('sitam.newprof')::uuid, current_setting('sitam.pub')::uuid);
select pg_temp.as_super();
select 'the teacher removes a paper (deleted when nobody else has it): ' || case when not exists (select 1 from publications where id = current_setting('sitam.pub')::uuid) then 'PASS' else 'FAIL' end;

\echo '── v19: work and internship history on the personal Home page'
select pg_temp.as_user('00000000-0000-0000-0000-00000000c005');
do $$ declare n int; begin
  update profiles set experience = '[{"kind":"internship","company":"Kaspi.kz","role":"Data intern","start":"2026-06","end":"2026-08"}]' where id = auth.uid();
  get diagnostics n = row_count;
  raise notice '% a person saves their own work / internship history', case when n = 1 then 'PASS' else 'FAIL' end;
end $$;
do $$ begin
  update profiles set experience = '[{"kind":"party","company":""}]' where id = auth.uid();
  raise notice 'FAIL a broken history entry was saved';
exception when others then raise notice 'PASS history entries are checked (%)', sqlerrm; end $$;
do $$ declare n int; begin
  update profiles set experience = '[{"kind":"work","company":"Hacked"}]' where id = '00000000-0000-0000-0000-00000000c002';
  get diagnostics n = row_count;
  raise notice '% nobody edits another person''s history', case when n = 0 then 'PASS' else 'FAIL' end;
end $$;
select 'signed-in users see the history: ' || case when (select experience->0->>'company' from public_people where id = '00000000-0000-0000-0000-00000000c005') = 'Kaspi.kz' then 'PASS' else 'FAIL' end;
select pg_temp.as_super();

\echo '── v23: Startup Hub (moderated) and no made-up events'
select 'made-up [sample] events are removed: ' || case when not exists (select 1 from events where description like '%[sample]%') then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c003');
select set_config('sitam.startup', (public.submit_startup('CampusEats', 'Order food from SDU cafes ahead of the break and skip the queue.', 'https://campuseats.kz', 'mvp', array['React', 'Supabase'])).id::text, false);
select 'a student proposes a startup (waits for review): ' || case when (select moderation = 'pending' and kind::text = 'startup' and stage = 'mvp' from projects where id = current_setting('sitam.startup')::uuid) then 'PASS' else 'FAIL' end;
do $$ begin
  perform public.submit_startup('Bad', 'This one has a stage that does not exist.', null, 'unicorn', null);
  raise notice 'FAIL a startup with an unknown stage was saved';
exception when others then raise notice 'PASS the stage is checked (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c006');
do $$ begin
  perform public.submit_startup('Partner idea', 'Partners should not submit student startups here.', null, 'idea', null);
  raise notice 'FAIL a partner proposed a student startup';
exception when others then raise notice 'PASS only SDU accounts propose startups (%)', sqlerrm; end $$;
set role anon;
select 'guests do not see a startup before review: ' || case when not exists (select 1 from projects where id = current_setting('sitam.startup')::uuid) then 'PASS' else 'FAIL' end;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c003');
do $$ begin
  perform public.moderate_project(current_setting('sitam.startup')::uuid, 'approved', null);
  raise notice 'FAIL the author approved their own startup';
exception when others then raise notice 'PASS only the coordinator approves (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select (public.moderate_project(current_setting('sitam.startup')::uuid, 'approved', null)).moderation;
reset role;
set role anon;
select 'after approval everybody sees the startup: ' || case when exists (select 1 from projects where id = current_setting('sitam.startup')::uuid) then 'PASS' else 'FAIL' end;
reset role;
select pg_temp.as_super();
