-- SITAM SPACE v9.3 — two coordinators: 230183076@sdu.edu.kz and 240183002@sdu.edu.kz.
-- The old 230183076 account (created 2026-10-13, password unknown) was removed on the owner's request,
-- so this e-mail registers from scratch and becomes coordinator automatically (is_coordinator() matches profiles.email).
begin;
insert into public.coordinator_emails (email) values ('230183076@sdu.edu.kz'), ('240183002@sdu.edu.kz') on conflict do nothing;
commit;
