-- SITAM SPACE v9.2 — the coordinator e-mail is now 240183002@sdu.edu.kz (replaces 230183076@sdu.edu.kz).
-- Whoever registers (or is already registered) with this e-mail is the coordinator automatically:
-- is_coordinator() matches profiles.email against this table, and handle_new_user creates the profile at sign-up.
begin;
delete from public.coordinator_emails where email = '230183076@sdu.edu.kz';
insert into public.coordinator_emails (email) values ('240183002@sdu.edu.kz') on conflict do nothing;
commit;
