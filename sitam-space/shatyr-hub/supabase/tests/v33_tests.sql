-- SITAM SPACE v33 checks: certificates on the personal page, teacher accounts 2026.
-- Run on a scratch database after all migrations (any order with the other test files). Every line should print PASS.
\set QUIET 1
set client_min_messages = notice;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, false), set_config('role', 'authenticated', false);
$$;
create or replace function pg_temp.as_super() returns void language sql as $$
  select set_config('role', 'postgres', false), set_config('request.jwt.claim.sub', '', false);
$$;
grant select, insert, update, delete on storage.objects to authenticated; -- as on Supabase
\echo '── v33: certificates'
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000f0001', '230109001@sdu.edu.kz', '{"role":"student","first_name":"Cert","last_name":"Owner"}'),
 ('00000000-0000-0000-0000-0000000f0002', '230109002@sdu.edu.kz', '{"role":"student","first_name":"Other","last_name":"Student"}'),
 ('00000000-0000-0000-0000-0000000f0003', '230109003@sdu.edu.kz', '{"role":"student","first_name":"Lab","last_name":"Head"}'),
 ('00000000-0000-0000-0000-0000000f0004', '230109004@sdu.edu.kz', '{"role":"student","first_name":"Other","last_name":"Head"}')
on conflict do nothing;
-- f0003 heads lab A, f0004 heads lab B
select set_config('sitam.lab_a', (select id::text from labs order by name limit 1), false);
select set_config('sitam.lab_b', (select id::text from labs order by name offset 1 limit 1), false);
insert into lab_members (lab_id, user_id, full_name, role) values
 (current_setting('sitam.lab_a')::uuid, '00000000-0000-0000-0000-0000000f0003', 'Lab Head', 'lead'),
 (current_setting('sitam.lab_b')::uuid, '00000000-0000-0000-0000-0000000f0004', 'Other Head', 'lead');

select pg_temp.as_user('00000000-0000-0000-0000-0000000f0001');
insert into certificates (title, issuer, issued_on, lab_id, file_path, file_name)
values ('AWS Cloud Practitioner', 'Amazon', '2026-10-01', current_setting('sitam.lab_a')::uuid,
        '00000000-0000-0000-0000-0000000f0001/aws.pdf', 'aws.pdf');
insert into storage.objects (bucket_id, name) values ('certificates', '00000000-0000-0000-0000-0000000f0001/aws.pdf');
select 'the owner sees own certificate: ' || case when (select count(*) from certificates) = 1 then 'PASS' else 'FAIL' end;
do $$ begin
  insert into certificates (user_id, title, file_path) values ('00000000-0000-0000-0000-0000000f0002', 'Fake', '00000000-0000-0000-0000-0000000f0002/x.pdf');
  raise notice 'FAIL a certificate was added for another person';
exception when others then raise notice 'PASS nobody adds certificates for someone else (%)', sqlerrm; end $$;
do $$ begin
  insert into certificates (title, file_path) values ('Wrong folder', '00000000-0000-0000-0000-0000000f0002/x.pdf');
  raise notice 'FAIL a certificate points to another person''s folder';
exception when others then raise notice 'PASS the file must be in the own folder (%)', sqlerrm; end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('certificates', '00000000-0000-0000-0000-0000000f0002/x.pdf');
  raise notice 'FAIL a file was uploaded into another person''s folder';
exception when others then raise notice 'PASS uploads only into the own folder (%)', sqlerrm; end $$;
do $$ begin
  update certificates set user_id = '00000000-0000-0000-0000-0000000f0002';
  raise notice 'FAIL the owner of a certificate was changed';
exception when others then raise notice 'PASS the owner cannot be changed (%)', sqlerrm; end $$;
update certificates set lab_id = current_setting('sitam.lab_a')::uuid, title = 'AWS Certified Cloud Practitioner';
select 'the owner edits title and lab: ' || case when (select title from certificates) = 'AWS Certified Cloud Practitioner' then 'PASS' else 'FAIL' end;

do $$ begin
  update certificates set file_path = '00000000-0000-0000-0000-0000000f0001/other.pdf';
  raise notice 'FAIL the owner changed the stored file path';
exception when insufficient_privilege then raise notice 'PASS only title, issuer, date and lab can be changed (%)', sqlerrm; end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000f0002');
select 'another student does not see it: ' || case when (select count(*) from certificates) = 0
  and (select count(*) from storage.objects where bucket_id = 'certificates') = 0 then 'PASS' else 'FAIL' end;
do $$ declare n int; begin
  delete from certificates; get diagnostics n = row_count;
  raise notice '% another student cannot delete it', case when n = 0 then 'PASS' else 'FAIL' end;
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000f0003');
select 'the head of the chosen lab sees it and its file: ' || case when (select count(*) from certificates) = 1
  and (select count(*) from storage.objects where bucket_id = 'certificates') = 1 then 'PASS' else 'FAIL' end;
do $$ declare n int; begin
  update certificates set title = 'Changed by head'; get diagnostics n = row_count;
  raise notice '% the lab head cannot edit it', case when n = 0 then 'PASS' else 'FAIL' end;
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000f0004');
select 'the head of another lab does not see it: ' || case when (select count(*) from certificates) = 0
  and (select count(*) from storage.objects where bucket_id = 'certificates') = 0 then 'PASS' else 'FAIL' end;

-- a member of the linked lab who is not a head sees nothing
select pg_temp.as_super();
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000f0005', '230109005@sdu.edu.kz', '{"role":"student","first_name":"Lab","last_name":"Member"}'),
 ('00000000-0000-0000-0000-0000000f0006', '230109006@sdu.edu.kz', '{"role":"student","first_name":"Coord","last_name":"V33"}')
on conflict do nothing;
insert into lab_members (lab_id, user_id, full_name, role) values (current_setting('sitam.lab_a')::uuid, '00000000-0000-0000-0000-0000000f0005', 'Lab Member', 'member');
insert into coordinator_emails (email) values ('230109006@sdu.edu.kz') on conflict do nothing;
select pg_temp.as_user('00000000-0000-0000-0000-0000000f0005');
select 'a member (not head) of the linked lab does not see it: ' || case when (select count(*) from certificates) = 0 then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-0000000f0006');
select 'the coordinator sees it and its file: ' || case when (select count(*) from certificates where user_id = '00000000-0000-0000-0000-0000000f0001') = 1
  and (select count(*) from storage.objects where bucket_id = 'certificates' and name like '00000000-0000-0000-0000-0000000f0001/%') = 1 then 'PASS' else 'FAIL' end;
-- moving the certificate to lab B: head A loses it, head B gets it
select pg_temp.as_user('00000000-0000-0000-0000-0000000f0001');
update certificates set lab_id = current_setting('sitam.lab_b')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000f0003');
select 'after moving to another lab the old head loses it: ' || case when (select count(*) from certificates) = 0 then 'PASS' else 'FAIL' end;
select pg_temp.as_user('00000000-0000-0000-0000-0000000f0004');
select 'and the new head sees it: ' || case when (select count(*) from certificates) = 1 then 'PASS' else 'FAIL' end;
select pg_temp.as_super();

set role anon;
do $$ begin
  perform count(*) from certificates;
  raise notice 'FAIL guests can query certificates';
exception when others then raise notice 'PASS guests cannot read certificates (%)', sqlerrm; end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000f0001');
delete from certificates;
select 'the owner deletes own certificate: ' || case when (select count(*) from certificates) = 0 then 'PASS' else 'FAIL' end;
select pg_temp.as_super();

\echo '── v33: teacher accounts 2026'
select 'all listed accounts exist: ' || case when (select count(*) from sitam_meta.staff_accounts_2026 s join auth.users u on lower(u.email) = s.email)
  = (select count(*) from sitam_meta.staff_accounts_2026) then 'PASS' else 'FAIL' end;
select 'they are verified teachers who must set a password: ' || case when not exists (
  select 1 from sitam_meta.staff_accounts_2026 s join profiles p on lower(p.email) = s.email
   where p.role::text <> 'teacher' or not p.staff_verified or not p.must_change_password) then 'PASS' else 'FAIL' end;
select 'first password works: ' || case when (select encrypted_password = extensions.crypt('SduLab2026!', encrypted_password)
  from auth.users where email = 'askhat.aitimov@sdu.edu.kz') then 'PASS' else 'FAIL' end;
select 'no admin rights: ' || case when not exists (select 1 from sitam_meta.staff_accounts_2026 s join coordinator_emails c on lower(c.email) = s.email)
  and not exists (select 1 from sitam_meta.staff_accounts_2026 s join profiles p on lower(p.email) = s.email where p.role::text = 'admin') then 'PASS' else 'FAIL' end;
select 'researcher cards with the same e-mail are linked: ' || case when not exists (
  select 1 from sitam_meta.staff_accounts_2026 s join professors pr on lower(pr.email) = s.email
   join profiles p on lower(p.email) = s.email where pr.profile_id is distinct from p.id) then 'PASS' else 'FAIL' end;
select 'no pending "This is me" requests left for them: ' || case when not exists (
  select 1 from researcher_profile_requests q join profiles p on p.id = q.user_id join sitam_meta.staff_accounts_2026 s on lower(p.email) = s.email
   where q.status = 'pending') then 'PASS' else 'FAIL' end;
