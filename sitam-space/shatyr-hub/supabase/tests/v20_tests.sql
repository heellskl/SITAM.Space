-- SITAM SPACE v20 checks: run after permissions_tests.sql on the same scratch database (it reuses its coordinator).
-- The local stub needs: alter table auth.users add column encrypted_password text;
\set QUIET 1
set client_min_messages = notice;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, false), set_config('role', 'authenticated', false);
$$;
create or replace function pg_temp.as_super() returns void language sql as $$
  select set_config('role', 'postgres', false), set_config('request.jwt.claim.sub', '', false);
$$;
\echo '── v20: account safety, personal e-mail sign-in'

-- 1. someone registers with a lab head's e-mail: only a claim, no rights
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000e0001', 'ingkar.baidaly@sdu.edu.kz', '{"role":"student","first_name":"Fake","last_name":"Head"}');
select pg_temp.as_user('00000000-0000-0000-0000-0000000e0001');
select 'unproven e-mail gets no lab rights: ' || case when not public.is_lab_manager((select id from labs where slug = 'robotics-lab'))
  and jsonb_array_length(public.my_context()->'managed_labs') = 0 and jsonb_array_length(public.my_context()->'pending_claims') >= 1 then 'PASS' else 'FAIL' end;
do $$ declare n int; begin
  update labs set description = 'HACKED' where slug = 'robotics-lab'; get diagnostics n = row_count;
  raise notice '% unproven head cannot edit the lab', case when n = 0 then 'PASS' else 'FAIL' end;
end $$;
do $$ begin
  perform public.decide_account_claim((select id from account_claims where user_id = auth.uid() limit 1), true);
  raise notice 'FAIL a user confirmed own claim';
exception when others then raise notice 'PASS only the coordinator confirms claims (%)', sqlerrm; end $$;
select 'user cannot read other claims inbox: ' || case when (select count(*) from public.account_claims_inbox()) = 0 then 'PASS' else 'FAIL' end;
select pg_temp.as_super();
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select 'coordinator sees the claim: ' || case when exists (select 1 from public.account_claims_inbox() where email = 'ingkar.baidaly@sdu.edu.kz' and lab_slug = 'robotics-lab') then 'PASS' else 'FAIL' end;
select count(public.decide_account_claim(id, false)) from account_claims where user_id = '00000000-0000-0000-0000-0000000e0001';
select pg_temp.as_super();
select 'rejected claim leaves the seat free: ' || case when exists (select 1 from lab_members m join labs l on l.id = m.lab_id join lab_member_contacts c on c.member_id = m.id
  where l.slug = 'robotics-lab' and c.email = 'ingkar.baidaly@sdu.edu.kz' and m.user_id is null)
  and not exists (select 1 from account_claims where user_id = '00000000-0000-0000-0000-0000000e0001' and status = 'pending') then 'PASS' else 'FAIL' end;

-- 2. researcher card: a "This is me" request for the coordinator, not linked
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000e0002', 'abay.magauiya@sdu.edu.kz', '{"role":"teacher","first_name":"A","last_name":"M","department":"Computer Science"}');
select 'researcher card is not linked before confirmation: ' || case when (select profile_id from professors where username = 'abay.magauiya') is null
  and exists (select 1 from researcher_profile_requests r join professors pr on pr.id = r.professor_id
               where r.user_id = '00000000-0000-0000-0000-0000000e0002' and r.status = 'pending' and pr.username = 'abay.magauiya') then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select count(public.review_researcher_request(id, true)) from researcher_profile_requests where user_id = '00000000-0000-0000-0000-0000000e0002' and status = 'pending';
select pg_temp.as_super();
select 'confirmed professor page is linked: ' || case when (select profile_id from professors where username = 'abay.magauiya') = '00000000-0000-0000-0000-0000000e0002' then 'PASS' else 'FAIL' end;

-- 3. a coordinator e-mail listed before anybody registered it
insert into public.coordinator_emails (email) values ('260000001@sdu.edu.kz');
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000e0003', '260000001@sdu.edu.kz', '{"role":"student"}');
select pg_temp.as_user('00000000-0000-0000-0000-0000000e0003');
select 'registering a listed coordinator e-mail gives no rights: ' || case when not public.is_coordinator() and not public.is_admin() then 'PASS' else 'FAIL' end;
select pg_temp.as_super();

-- 4. partner types the name of an existing verified company
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000e0004', 'evil@gmail.com', '{"role":"partner","first_name":"E","last_name":"Vil","company":"demo partner (SAMPLE)"}'),
 ('00000000-0000-0000-0000-0000000e0005', 'boss@newco.kz', '{"role":"partner","first_name":"B","last_name":"Oss","company":"NewCo Labs"}');
select 'existing company name → pending request only: ' || case when exists (select 1 from company_members where user_id = '00000000-0000-0000-0000-0000000e0004' and status = 'pending') then 'PASS' else 'FAIL' end;
select 'new company name → own unverified company, owner: ' || case when exists (select 1 from company_members cm join companies c on c.id = cm.company_id
  where cm.user_id = '00000000-0000-0000-0000-0000000e0005' and cm.role = 'owner' and cm.status = 'active' and not c.verified and c.name = 'NewCo Labs') then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-0000000e0004');
select 'pending partner acts for nobody: ' || case when not public.is_company_member((select id from companies where name ilike 'demo partner%'))
  and (select count(*) from public.application_inbox()) = 0
  and jsonb_array_length(public.my_context()->'companies') = 0 and jsonb_array_length(public.my_context()->'pending_companies') = 1 then 'PASS' else 'FAIL' end;
do $$ begin
  perform public.decide_company_member((select id from companies where name ilike 'demo partner%'), auth.uid(), true);
  raise notice 'FAIL a pending partner approved themself';
exception when others then raise notice 'PASS a request cannot approve itself (%)', sqlerrm; end $$;
select pg_temp.as_super();
select pg_temp.as_user('00000000-0000-0000-0000-0000000e0005');
do $$ begin
  perform public.decide_company_member((select id from companies where name ilike 'demo partner%'), '00000000-0000-0000-0000-0000000e0004', true);
  raise notice 'FAIL an owner of another company approved';
exception when others then raise notice 'PASS only owners of that company or the coordinator decide (%)', sqlerrm; end $$;
select pg_temp.as_super();
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select 'coordinator sees the join request: ' || case when exists (select 1 from public.company_join_requests() where email = 'evil@gmail.com') then 'PASS' else 'FAIL' end;
select public.decide_company_member((select id from companies where name ilike 'demo partner%'), '00000000-0000-0000-0000-0000000e0004', true);
select pg_temp.as_super();
select pg_temp.as_user('00000000-0000-0000-0000-0000000e0004');
select 'approved partner is an active member: ' || case when public.is_company_member((select id from companies where name ilike 'demo partner%')) then 'PASS' else 'FAIL' end;
select pg_temp.as_super();

-- 5. personal e-mail
update auth.users set encrypted_password = extensions.crypt('Student-pass1', extensions.gen_salt('bf')) where id = '00000000-0000-0000-0000-00000000c005';
update auth.users set encrypted_password = extensions.crypt('Other-pass22', extensions.gen_salt('bf')) where id = '00000000-0000-0000-0000-00000000c003';
select pg_temp.as_user('00000000-0000-0000-0000-00000000c005');
update profiles set personal_email = ' Dana.Personal@Gmail.com ' where id = auth.uid();
select 'personal e-mail saved lower-case: ' || case when (select personal_email from profiles where id = auth.uid()) = 'dana.personal@gmail.com' then 'PASS' else 'FAIL' end;
select pg_temp.as_super();
select pg_temp.as_user('00000000-0000-0000-0000-00000000c003');
do $$ begin
  update profiles set personal_email = 'dana.personal@gmail.com' where id = auth.uid();
  raise notice 'FAIL two accounts share a personal e-mail';
exception when others then raise notice 'PASS a personal e-mail belongs to one account (%)', sqlerrm; end $$;
do $$ begin
  update profiles set personal_email = '230101010@sdu.edu.kz' where id = auth.uid();
  raise notice 'FAIL personal e-mail = another account''s sign-in e-mail';
exception when others then raise notice 'PASS another account''s sign-in e-mail is refused (%)', sqlerrm; end $$;
select pg_temp.as_super();
do $$ begin
  insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000e0006', 'dana.personal@gmail.com', '{"role":"partner","company":"Dana Co"}');
  raise notice 'FAIL a second account was made with someone''s personal e-mail';
exception when others then raise notice 'PASS sign-up with someone''s personal e-mail is refused (%)', sqlerrm; end $$;
set role anon;
select 'personal e-mail + right password → SDU sign-in e-mail: ' || case when public.sign_in_email('DANA.personal@gmail.com', 'Student-pass1') = '230101010@sdu.edu.kz' then 'PASS' else 'FAIL' end;
select 'wrong password → nothing: ' || case when public.sign_in_email('dana.personal@gmail.com', 'nope') is null then 'PASS' else 'FAIL' end;
select 'unknown e-mail → nothing: ' || case when public.sign_in_email('nobody@gmail.com', 'Student-pass1') is null then 'PASS' else 'FAIL' end;
do $$ begin
  for i in 1..12 loop perform public.sign_in_email('dana.personal@gmail.com', 'guess' || i); end loop;
  raise notice 'FAIL no limit on password guesses';
exception when others then raise notice 'PASS password guesses are limited (%)', sqlerrm; end $$;
reset role;
select 'anon cannot read the sign-in log: ' || case when not has_schema_privilege('anon', 'sitam_meta', 'usage') then 'PASS' else 'FAIL' end;

-- 6. Ask SITAM helpers
insert into ai_usage (user_id, day, questions) values ('00000000-0000-0000-0000-00000000c005', current_date, 3) on conflict (user_id, day) do update set questions = 3;
select public.ai_refund_quota('00000000-0000-0000-0000-00000000c005');
select 'failed question goes back to the limit: ' || case when (select questions from ai_usage where user_id = '00000000-0000-0000-0000-00000000c005' and day = current_date) = 2 then 'PASS' else 'FAIL' end;
select 'users cannot refund questions: ' || case when not has_function_privilege('authenticated', 'public.ai_refund_quota(uuid)', 'execute') then 'PASS' else 'FAIL' end;
select 'FAQ has no duplicate "join a laboratory" and no weekday schedule: ' || case when not exists (select 1 from ai_faq where question = 'How do I join a laboratory?')
  and not exists (select 1 from ai_faq where answer ~* 'tuesday|thursday|registration is attached') then 'PASS' else 'FAIL' end;

-- 7. a personal e-mail that matches a researcher card (old e-mail on the papers) → request, not a link
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000e0007', 'amine.sbai.test@sdu.edu.kz', '{"role":"teacher","first_name":"Amine","last_name":"Sbai","department":"Mathematics"}');
select 'registering with an unlisted SDU e-mail makes no request: ' || case when not exists (select 1 from researcher_profile_requests where user_id = '00000000-0000-0000-0000-0000000e0007')
  and not exists (select 1 from account_claims where user_id = '00000000-0000-0000-0000-0000000e0007') then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-0000000e0007');
update profiles set personal_email = 'A.Sbai@uhp.ac.ma' where id = auth.uid();
select 'personal e-mail = old e-mail on the papers → request, not linked: ' || case when exists (select 1 from researcher_profile_requests r join professors pr on pr.id = r.professor_id
    where r.user_id = auth.uid() and r.status = 'pending' and pr.username = 'amine.sbai' and r.note like '%a.sbai@uhp.ac.ma%')
  and (select profile_id from professors where username = 'amine.sbai') is null then 'PASS' else 'FAIL' end;
select 'nobody on the site reads the old e-mails: ' || case when not has_column_privilege('authenticated', 'public.professors', 'alt_emails', 'select')
  and not has_column_privilege('anon', 'public.professors', 'alt_emails', 'select') then 'PASS' else 'FAIL' end;
select pg_temp.as_super();
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select count(public.review_researcher_request(id, true)) from researcher_profile_requests where user_id = '00000000-0000-0000-0000-0000000e0007' and status = 'pending';
select pg_temp.as_super();
select 'confirmed: the SDU account owns the researcher card: ' || case when (select profile_id from professors where username = 'amine.sbai') = '00000000-0000-0000-0000-0000000e0007' then 'PASS' else 'FAIL' end;
