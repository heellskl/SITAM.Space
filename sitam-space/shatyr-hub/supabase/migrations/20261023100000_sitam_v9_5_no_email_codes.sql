-- SITAM SPACE v9.5 — registration without e-mail codes.
-- People did not receive the confirmation codes, so new accounts are confirmed at once:
-- a BEFORE INSERT trigger on auth.users fills email_confirmed_at. The site then signs the person in
-- with the password they just chose. Roles, profile fields and handle_new_user stay exactly as before.
-- Note: this means the site no longer proves that a person owns the e-mail they typed.
begin;

create or replace function public.auto_confirm_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists auto_confirm_signup on auth.users;
create trigger auto_confirm_signup
  before insert on auth.users
  for each row execute function public.auto_confirm_signup();

-- Accounts that registered but got stuck on the code step: confirm them so they can sign in
-- (only those that already have a SITAM profile, i.e. passed the registration rules).
update auth.users u
   set email_confirmed_at = now()
 where u.email_confirmed_at is null
   and exists (select 1 from public.profiles p where p.id = u.id);

commit;
