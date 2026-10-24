-- SITAM SPACE v9.6 — coordinator e-mails match reliably.
-- An address typed into coordinator_emails by hand (Table Editor) could carry spaces, and a profile could
-- miss its e-mail; then the coordinator was not recognised. Now addresses are trimmed + lower-cased on save,
-- and the check compares trimmed, lower-case e-mails from the profile AND the sign-in account.
begin;

-- clean what is already there
delete from public.coordinator_emails a
 using public.coordinator_emails b
 where a.email <> b.email and lower(trim(a.email)) = lower(trim(b.email)) and a.email <> lower(trim(a.email));
update public.coordinator_emails set email = lower(trim(email)) where email <> lower(trim(email));

create or replace function public.normalize_coordinator_email()
returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;
drop trigger if exists normalize_coordinator_email on public.coordinator_emails;
create trigger normalize_coordinator_email before insert or update on public.coordinator_emails
  for each row execute function public.normalize_coordinator_email();

create or replace function public.is_coordinator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.coordinator_emails c
     where lower(trim(c.email)) in (
       (select lower(trim(p.email)) from public.profiles p where p.id = auth.uid()),
       (select lower(trim(u.email)) from auth.users u where u.id = auth.uid())
     )
  )
$$;

-- profiles without an e-mail get it from the sign-in account
update public.profiles p set email = lower(trim(u.email))
  from auth.users u
 where u.id = p.id and coalesce(p.email, '') = '' and u.email is not null;

commit;
