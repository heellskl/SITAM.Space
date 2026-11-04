-- SITAM SPACE — fix "You do not have permission to do this" on a new Supabase project.
-- New Supabase projects can be created WITHOUT the usual default access for the website roles (anon, authenticated).
-- Then the site cannot read labs, research, events… and shows "You do not have permission to do this".
-- This file gives the standard Supabase access back and then re-applies every restriction of the SITAM migrations,
-- so the site's rules (who may write what) stay exactly as designed. Row-level security keeps protecting the rows.
-- Run: Supabase → SQL Editor → New query → paste → Run. Safe to run more than once.

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- the SITAM restrictions, in migration order
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (first_name, last_name, course, major, department, position, bio, links, cv_filename) on public.profiles to authenticated;
revoke update on public.companies from authenticated;
grant update (name, website, description, logo_url) on public.companies to authenticated;
revoke insert on public.opportunities from anon, authenticated;
revoke insert, update, delete on public.opportunity_hosts from anon, authenticated;
revoke insert, update, delete on public.applications from anon, authenticated;
revoke insert on public.events from anon, authenticated;
revoke insert, update, delete on public.event_hosts from anon, authenticated;
revoke insert, update, delete on public.event_registrations from anon, authenticated;
revoke select on public.professors from anon, authenticated;
grant select (id, username, first_name, last_name, full_name, job_title, degree, photo_url, orcid_url, scopus_id, scholar_url, h_index, i10_index, total_citations, total_works, keywords, topics, profile_id, updated_at) on public.professors to anon, authenticated;
grant select on public.event_stats, public.research_yearly to anon, authenticated;
grant update (phone) on public.profiles to authenticated;
revoke update on public.projects from authenticated;
grant update (kind, status, title, summary, tags, authors, year, github_url, demo_url, paper_url, sort_order, lab_id) on public.projects to authenticated;
revoke insert on public.projects from anon, authenticated;
grant insert (lab_id, kind, status, title, summary, tags, authors, year, github_url, demo_url, paper_url, sort_order) on public.projects to authenticated;
revoke execute on function public.refresh_professor_metrics(uuid) from anon, authenticated, public;
revoke insert, update on public.lab_members from anon, authenticated;
grant insert (lab_id, full_name, title, role, term, sort_order) on public.lab_members to authenticated;
grant update (full_name, title, role, term, sort_order) on public.lab_members to authenticated;
grant delete on public.lab_members to authenticated;
revoke execute on function public.add_lab_member(uuid, text, text, text, text) from anon, public;
grant execute on function public.add_lab_member(uuid, text, text, text, text) to authenticated;
revoke execute on function public.my_context() from anon, public;
grant execute on function public.my_context() to authenticated;
grant execute on function public.is_lab_head(uuid) to authenticated;
revoke insert, update, delete on public.lab_head_requests from anon, authenticated;
grant select on public.lab_head_requests to authenticated;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;
grant select (email) on public.professors to authenticated;
revoke all on public.coordinator_emails from anon, authenticated;
grant update (faculty, group_name, avatar_url) on public.profiles to authenticated;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;
revoke execute on function public.my_context() from anon, public;
grant execute on function public.my_context() to authenticated;
revoke execute on function public.submit_project(text, text, text, text[], text[], int, text, text, text, text, text) from anon, public;
grant execute on function public.submit_project(text, text, text, text[], text[], int, text, text, text, text, text) to authenticated;
grant select on public.event_series, public.external_events, public.external_event_labs, public.external_event_people to anon, authenticated;
revoke insert, update, delete on public.event_series, public.external_events, public.external_event_labs, public.external_event_people from anon, authenticated;
revoke execute on function public.save_external_event(uuid, text, text, text, text, text, date, date, text, boolean, uuid) from anon, public;
revoke execute on function public.delete_external_event(uuid) from anon, public;
revoke execute on function public.save_event_participation(uuid, uuid, jsonb, text, text, text, uuid, text) from anon, public;
revoke execute on function public.remove_event_participation(uuid, uuid) from anon, public;
grant execute on function public.save_external_event(uuid, text, text, text, text, text, date, date, text, boolean, uuid) to authenticated;
grant execute on function public.delete_external_event(uuid) to authenticated;
grant execute on function public.save_event_participation(uuid, uuid, jsonb, text, text, text, uuid, text) to authenticated;
grant execute on function public.remove_event_participation(uuid, uuid) to authenticated;
grant execute on function public.name_key(text) to anon, authenticated;
grant insert (is_past, graduation_year) on public.lab_members to authenticated;
grant update (is_past, graduation_year) on public.lab_members to authenticated;
revoke execute on function public.set_event_poster(uuid, text) from anon, public;
revoke execute on function public.set_external_event_poster(uuid, text) from anon, public;
grant execute on function public.set_event_poster(uuid, text) to authenticated;
grant execute on function public.set_external_event_poster(uuid, text) to authenticated;
revoke execute on function public.labs_kind_guard() from anon, authenticated, public;
grant update (personal_email) on public.profiles to authenticated;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;
revoke execute on function public.set_external_event_place(uuid, text, boolean) from anon, public;
grant execute on function public.set_external_event_place(uuid, text, boolean) to authenticated;
grant select on public.industry_partners to anon, authenticated;
grant insert, update, delete on public.industry_partners to authenticated;
revoke execute on function public.admin_rename_lab_tag(text, text, text) from anon, public;
grant execute on function public.admin_rename_lab_tag(text, text, text) to authenticated;
revoke execute on function public.set_event_photos(uuid, text[]) from anon, public;
grant execute on function public.set_event_photos(uuid, text[]) to authenticated;
grant select on public.academic_plans, public.academic_plan_items to anon, authenticated;
grant insert, update, delete on public.academic_plans, public.academic_plan_items to authenticated;
revoke execute on function public.set_submission_affiliation(uuid, uuid, uuid) from anon, public;
grant execute on function public.set_submission_affiliation(uuid, uuid, uuid) to authenticated;
revoke insert, update, delete on public.ai_documents from anon, authenticated;
grant select on public.ai_documents to anon, authenticated;
grant select on public.ai_faq to anon, authenticated;
revoke insert, update, delete on public.ai_faq from anon, authenticated;
revoke all on public.ai_sources from anon, authenticated, public;
revoke insert, update, delete on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
revoke execute on function public.ai_pending_documents(int) from anon, authenticated, public;
revoke execute on function public.ai_upsert_document(text, text, text, text, text, text, extensions.vector) from anon, authenticated, public;
revoke execute on function public.ai_remove_stale() from anon, authenticated, public;
revoke execute on function public.ai_take_quota(uuid, int) from anon, authenticated, public;
revoke execute on function public.match_documents(extensions.vector, int, float, text[]) from anon, public;
grant execute on function public.match_documents(extensions.vector, int, float, text[]) to authenticated;
grant execute on function public.ai_index_status() to authenticated;
grant execute on function public.ai_pending_documents(int), public.ai_upsert_document(text, text, text, text, text, text, extensions.vector), public.ai_remove_stale(), public.ai_take_quota(uuid, int), public.match_documents(extensions.vector, int, float, text[]), public.ai_index_status() to service_role;
revoke execute on function public.match_documents(extensions.vector, int, float, text[]) from anon, public;
grant execute on function public.match_documents(extensions.vector, int, float, text[]) to authenticated, service_role;
grant execute on function public.is_lab_lead(uuid) to authenticated;
grant update (graduation_year, company) on public.profiles to authenticated;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;
revoke insert, update, delete on public.help_offers from anon, authenticated;
grant select on public.help_offers to authenticated;
grant select (bio, office_hours, interests) on public.professors to anon, authenticated;
revoke insert, update, delete on public.researcher_profile_requests from anon, authenticated;
grant select on public.researcher_profile_requests to authenticated;
revoke execute on function public.offer_help(uuid, text, text) from anon, public;
revoke execute on function public.respond_help_offer(uuid, text) from anon, public;
revoke execute on function public.request_researcher_profile(uuid, text, text, text, text, text, text, text, text) from anon, public;
revoke execute on function public.review_researcher_request(uuid, boolean, text) from anon, public;
revoke execute on function public.update_my_researcher_profile(text, text, text[], text, text, text) from anon, public;
grant execute on function public.offer_help(uuid, text, text) to authenticated;
grant execute on function public.respond_help_offer(uuid, text) to authenticated;
grant execute on function public.request_researcher_profile(uuid, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.review_researcher_request(uuid, boolean, text) to authenticated;
grant execute on function public.update_my_researcher_profile(text, text, text[], text, text, text) to authenticated;
grant select (publications_updated_at) on public.professors to anon, authenticated;
revoke execute on function public.can_edit_professor(uuid) from anon, public;
grant execute on function public.can_edit_professor(uuid) to authenticated;
revoke execute on function public.save_publication(uuid, uuid, text, int, text, text, text, text, int, boolean) from anon, public;
revoke execute on function public.remove_publication(uuid, uuid) from anon, public;
revoke execute on function public.import_publications(uuid, jsonb) from anon, public;
grant execute on function public.save_publication(uuid, uuid, text, int, text, text, text, text, int, boolean) to authenticated;
grant execute on function public.remove_publication(uuid, uuid) to authenticated;
grant execute on function public.import_publications(uuid, jsonb) to authenticated;
grant update (experience) on public.profiles to authenticated;
revoke all on public.public_people from anon, public;
grant select on public.public_people to authenticated;
-- v20: account safety (guarded: this file may run before v20 exists)
do $$ begin
  if to_regprocedure('public.ai_refund_quota(uuid)') is not null then
    revoke execute on function public.ai_refund_quota(uuid) from anon, authenticated, public;
    grant execute on function public.ai_refund_quota(uuid) to service_role;
  end if;
  if to_regclass('public.account_claims') is not null then
    revoke insert, update, delete on public.account_claims from anon, authenticated;
  end if;
  if to_regprocedure('public.decide_account_claim(uuid, boolean)') is not null then
    revoke execute on function public.account_claims_inbox(), public.decide_account_claim(uuid, boolean),
      public.company_join_requests(), public.decide_company_member(uuid, uuid, boolean) from anon, public;
  end if;
  if to_regprocedure('public.create_account_claims(uuid, text)') is not null then
    revoke execute on function public.create_account_claims(uuid, text) from anon, authenticated, public;
  end if;
end $$;
revoke insert, update, delete on public.company_members from anon, authenticated;

-- v23: Startup Hub
do $$ begin
  if to_regprocedure('public.submit_startup(text, text, text, text, text[])') is not null then
    revoke execute on function public.submit_startup(text, text, text, text, text[]) from anon, public;
    grant execute on function public.submit_startup(text, text, text, text, text[]) to authenticated;
  end if;
end $$;

-- v27: Startups mentors and trackers (guarded)
do $$ begin
  if to_regclass('public.startup_people') is not null then
    revoke all on public.startup_people from anon, public;
    grant select on public.startup_people to anon, authenticated;
    revoke all on public.startup_people from authenticated;
    grant select, insert, delete on public.startup_people to authenticated;
    grant update on public.startup_people to authenticated;
  end if;
end $$;

-- v22: Ask SITAM archive (guarded)
do $$ begin
  if to_regclass('public.ask_questions') is not null then
    revoke all on public.ask_questions from anon, public;
    revoke update on public.ask_questions from authenticated;
    grant select, insert, delete on public.ask_questions to authenticated;
  end if;
end $$;

-- v28: mentors / trackers of a startup (guarded)
do $$ begin
  if to_regclass('public.project_startup_people') is not null then
    revoke all on public.project_startup_people from anon, authenticated, public;
    grant select on public.project_startup_people to anon, authenticated;
  end if;
  if to_regprocedure('public.submit_startup(text, text, text, text, text, text, uuid[])') is not null then
    revoke execute on function public.submit_startup(text, text, text, text, text, text, uuid[]) from anon, public;
    grant execute on function public.submit_startup(text, text, text, text, text, text, uuid[]) to authenticated;
  end if;
end $$;

-- v29: lab passports are read through RLS and written only through save_lab_passport / approve_lab_passport (guarded)
do $$ begin
  if to_regclass('public.lab_passports') is not null then
    revoke all on public.lab_passports from anon, authenticated, public;
    grant select on public.lab_passports to authenticated;
  end if;
  if to_regprocedure('public.save_lab_passport(uuid, integer, text, text, text, text, text, text, text, boolean)') is not null then
    revoke execute on function public.save_lab_passport(uuid, integer, text, text, text, text, text, text, text, boolean) from anon, public;
    grant execute on function public.save_lab_passport(uuid, integer, text, text, text, text, text, text, text, boolean) to authenticated;
    revoke execute on function public.approve_lab_passport(uuid, integer) from anon, public;
    grant execute on function public.approve_lab_passport(uuid, integer) to authenticated;
    revoke execute on function public.clear_must_change_password() from anon, public;
    grant execute on function public.clear_must_change_password() to authenticated;
  end if;
end $$;
