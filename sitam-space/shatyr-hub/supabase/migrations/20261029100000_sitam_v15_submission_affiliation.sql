/* SITAM SPACE v15 — "Submit your research / project": link the submission to a lab OR a researcher
   ─────────────────────────────────────────────────────────────────────────────────────────────────
   • projects.related_lab_id: the lab the student worked with (no foreign key on purpose: projects already
     has lab_id → labs, a second link would make the site's "labs(name, slug)" lookups ambiguous).
   • projects.supervisor_id → professors: the researcher (supervisor) the work was done with.
   • set_submission_affiliation(project, lab, researcher): the author of a submission sets one of the two
     (or none). It does not make the work a lab project — lab heads still manage only their lab's own projects.
   Re-runnable. */

alter table public.projects add column if not exists related_lab_id uuid;
alter table public.projects add column if not exists supervisor_id uuid references public.professors(id) on delete set null;
do $$ begin
  alter table public.projects add constraint projects_one_affiliation check (related_lab_id is null or supervisor_id is null);
exception when duplicate_object then null; end $$;

create or replace function public.set_submission_affiliation(p_project uuid, p_lab uuid, p_supervisor uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if not exists (select 1 from public.projects where id = p_project and owner_id = auth.uid() and lab_id is null) and not public.is_admin() then
    raise exception 'NOT_ALLOWED: only the author of this submission can change it';
  end if;
  if p_lab is not null and p_supervisor is not null then raise exception 'BAD_INPUT: choose a lab or a researcher, not both'; end if;
  if p_lab is not null and not exists (select 1 from public.labs where id = p_lab) then raise exception 'NOT_FOUND: lab'; end if;
  if p_supervisor is not null and not exists (select 1 from public.professors where id = p_supervisor) then raise exception 'NOT_FOUND: researcher'; end if;
  update public.projects set related_lab_id = p_lab, supervisor_id = p_supervisor where id = p_project;
end;
$$;
revoke execute on function public.set_submission_affiliation(uuid, uuid, uuid) from anon, public;
grant execute on function public.set_submission_affiliation(uuid, uuid, uuid) to authenticated;
