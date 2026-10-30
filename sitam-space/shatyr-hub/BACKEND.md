# SITAM SPACE — backend notes (v3)

## 1. Data model (`supabase/migrations/20261014100000_sitam_schema.sql`)

| Area | Tables | Notes |
|---|---|---|
| People | `profiles` (role: student · phd · teacher · partner · admin; `phone`, `department`, custom `major`), `companies`, `company_members` | Partners may sign up with any e-mail; their company starts `verified = false`. Students/teachers need an `@sdu.edu.kz` address. |
| Labs | `labs`, `lab_internal`, `lab_members`, `lab_member_contacts`, `saved_labs` | Public lab page = `labs`. Internal fields (presenters, goals, resource gaps…) are visible to lab managers and staff only. |
| Projects | `projects` (kind research/startup/project, status ongoing/completed, `moderation` pending/approved/rejected) | Lab projects (`lab_id`) are published at once. Student / PhD submissions (`owner_id`, no lab) go through admin moderation; PhD research is approved immediately. Only approved rows are public. |
| Opportunities | `opportunities` + `opportunity_hosts` | `category` = industrial (with `industrial_type` vacancy/internship/project) · lab · research. Ownership is many-to-many through hosts: any number of labs, companies, projects or a verified professor in his own name (`person_id`, `person_name`, `person_username`). Industrial listings need a company host. |
| Applications | `applications` | Always points to one opportunity (`opportunity_id NOT NULL`) — no more “exactly one of lab / opportunity / project”. Lab RA, project join and diploma requests are all opportunities of category lab/research. `cv_path` is copied at submit time. |
| Events | `events` (general info only) + `event_hosts` + `event_registrations` | A host row has exactly one of lab_id / company_id / project_id, so “a lab introduces a company” = 2 host rows. |
| Research | `professors`, `publications`, `publication_authors`, views `research_yearly` | Imported from the Scopus export; professor e-mail is hidden from the public by column grants. |
| B2B | `partner_requests` | Briefs from the partners page. |

Writes to opportunities, events, hosts, applications and registrations go **only through RPCs**:
`save_opportunity` (with `p_as_me` for professors), `save_event`, `submit_project`, `moderate_project`, `submit_application`, `withdraw_application`, `review_application`, `register_for_event`, `cancel_registration`, `check_in`, `verify_staff`, `verify_company`. Reads: `my_context` (incl. `pending_moderation` for admins), `application_inbox` (applicant e-mail, phone, role, department), `event_attendees`, `moderation_queue`.

## 2. Auto-delegation (one entry → every section)

| Who | Publishes | Appears in |
|---|---|---|
| Head of lab / student lead (lab page → “+ Event / Vacancy / Project”) | event · opportunity · project with the lab as host | Events · Opportunities · Projects, and the lab page |
| Verified professor (profile → “Post an opportunity”) | opportunity hosted in his own name | Opportunities and his researcher page (“Open positions”) |
| Publication import / new `publication_authors` rows | papers | Research; the professor card (works, citations, h-index, i10) refreshes by trigger |
| Student (Projects / Research → “+ Submit”) | project / startup / research | after admin approval: Projects (“Student projects & startups”) or Research (“Student & PhD research”) |
| PhD student | research | Research immediately (no review) |

## 3. Permission rules

- **Apply**: students and PhD students only. Professors, partners and admins never see the Apply button; the database refuses it too. Nobody can apply to a listing they manage.
- **Professor dashboard**: Manage → Applications lists only applicants to listings the professor posted or hosts, with name, e-mail, phone and CV.

- **Lab manager** = `lab_members.can_edit` (lead, co-lead, student lead…). A lab head is linked automatically when they sign up with the e-mail listed in the lab form (`lab_member_contacts`).
- **Partner** acts for a company only after the SITAM office verifies it (Manage → Admin).
- **Professor** (`teacher`) becomes staff after `verify_staff`; staff can run events and see B2B briefs.
- Roles are additive: a student who heads a lab can still apply to industrial listings, but not to their own lab's listings.
- CVs: private bucket `cvs/{uid}/…`. A reviewer can open exactly the file attached to an application they can review (`can_view_cv`). The profile CV is attached automatically; the student can upload another one for a single application.
- Accepting a lab/research application adds the student to the host labs as research assistant.

## 3a. Leader-first labs (`20261017100000_sitam_v4_leader_first.sql`)

- **Lab position ≠ platform role.** `profiles.role` stays student / phd / teacher / partner / admin. Inside a lab, `lab_members.role` is the position: lead, co_lead, student_lead, deputy_student_lead, project_coordinator, research_assistant, student_researcher, member, former_lead.
- **Rights follow the position.** `can_edit` is set by trigger: lead · co_lead · student_lead · deputy_student_lead manage the lab; any other position does not. Clients cannot write `can_edit`, `user_id` or `lab_id` (column grants).
- **Head positions are protected.** Only a linked lab lead / co-lead (or admin) can add, change, remove or link an account to a lead / co-lead row (`lab_members_guard`). Student leads manage everyone else.
- **No orphan labs.** A manager cannot remove or demote themselves when no other linked manager would remain (`LAST_MANAGER`).
- **Add people:** `add_lab_member(lab, full_name, email, position, title)` — links an existing account at once, otherwise on sign-up via `lab_member_contacts`.
- **Labs:** new `skills`, `contact_email`, `setup_completed_at` (set when the leader finishes the first-setup checklist).
- **`my_context()`** also returns `lab_memberships` (every lab the user belongs to, with position, `can_edit`, `is_head`) — used by the sidebar, Home dashboard and Labs page.

## 3b. Multiple roles & Lab Head approval (`20261018100000_sitam_v5_roles.sql`)

- **Primary role** (`profiles.role`): Student, Teacher or Industry partner (PhD is no longer offered at sign-up; old PhD accounts keep working). It never changes because of lab positions.
- **Lab Head is an extra role per lab.** Requested at registration ("I am the head of an existing laboratory" → lab + Lab head / Co-head) or later in Profile → *Lab Head status* (`request_lab_head`). Only existing labs can be chosen; nothing creates a lab.
- **Admin approval** in Manage → *Lab heads* (`lab_head_queue`, `decide_lab_head_request`). Approval links the person to the lab as `lead` / `co_lead`; rights follow from the position. Rejected/pending requests are listed in `my_context().lab_head_requests`.
- People listed by e-mail in a lab form (entered by the SITAM office) are still linked automatically at sign-up.
- **New position:** `mentor` (no management rights). Approved heads add/remove members and set Member / Mentor / Project coordinator / … in *Manage members*.
- **Contacts:** `public_people` view = name, primary role, study/work details and e-mail of every registered user, readable by signed-in users only (no phone, no CV). `professors.email` is readable by signed-in users.

## 3c. v7 — Google sign-in, coordinator, head / member (`20261019100000_sitam_v7_coordinator.sql`)

- **Sign-in = Google OAuth only** (industry partners keep e-mail sign-in, hidden link on /login). Non-SDU Google accounts are refused by `enforce_signup_email`.
- **Account type from the e-mail:** local part starts with digits → `student`, otherwise → `teacher` (`account_type_from_email`). Not selectable.
- **Coordinator:** e-mails in `public.coordinator_emails` (server config, no client access; currently `230183076@sdu.edu.kz` and `240183002@sdu.edu.kz` — see migration v9_3). `is_admin()` is true for them → Admin page (/admin): create / edit / delete labs, assign / remove lab heads (`admin_create_lab`, `assign_lab_head`, `remove_lab_head`). Add another coordinator: `insert into coordinator_emails values ('name@sdu.edu.kz');`
- **Inside a lab:** head (`lead` / `co_lead`) or member (any other position). Only heads manage the lab (info, members via `add_lab_member` — registered users only —, projects, events). Only the coordinator touches head rows.
- Profile: `faculty`, `group_name`, `avatar_url` (bucket `avatars`, own folder).
- Projects: lab projects only (startups converted to projects, `submit_project` closed). Events: `save_event` / `can_manage_event` = heads of a hosting lab or the coordinator.

### Google sign-in setup (once)
1. Google Cloud Console → APIs & Services → Credentials → *OAuth client ID* (Web). Authorized redirect URI: `https://<your-supabase-project>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → Google: paste Client ID and Secret, enable.
3. Supabase → Authentication → URL Configuration: add the site URL(s) (preview and production) to *Redirect URLs*.
(On Lovable Cloud: Cloud → Users → Auth settings → Google.)

## 4. Loading real data

```bash
node scripts/build-seed.mjs data/labs.json data/professors.json > supabase/migrations/20261014100100_sitam_data.sql
```
`data/labs.json` = the Google-Form export (array or comma-separated objects), `data/professors.json` = the Scopus/abc.py export. The script is upsert-based and safe to re-run; phone numbers and e-mails go to the private `lab_member_contacts` table.

Remove sample rows (events, listings, demo company) once real ones exist:
```sql
delete from opportunities where description like '%[sample]%';
delete from events where description like '%[sample]%';
delete from companies where name = 'Demo Partner (sample)';
```

## 5. Setup checklist

1. Run the migrations in order (schema → data → samples → v3 → v4 leader-first → v5 roles → v7 coordinator).
2. Auth → E-mail templates → “Confirm signup”: include `{{ .Token }}` (the app verifies a 6-digit code). Keep Auth → Rate limits at the default 60 s per e-mail — the sign-up page shows a matching 60-second timer before “Send the code again”. For reliable delivery set up custom SMTP (Auth → SMTP) with a sender like technopark@sdu.edu.kz; the built-in mailer is heavily rate-limited.
3. Make the first admin: `update profiles set role = 'admin' where email = 'you@sdu.edu.kz';`
4. Link a lab head manually if needed: `insert into lab_member_contacts (member_id, email) values ('<member uuid>', 'head@sdu.edu.kz');`
5. Hero video: put your own `public/hero.mp4` (falls back to a free Mixkit clip, then to a gradient).

## 6. Recommendations

- Keep the Google Form only as an intake; edits should happen on the lab page (`/labs/<slug>?edit=1`) so the DB stays the source of truth.
- Re-import Scopus data each semester with the same script; it updates citations in place.
- Add an e-mail notification (Supabase Edge Function + Resend) on `review_application` status changes — the schema already stores everything needed.
- Back up the `cvs` bucket; CVs are personal data, keep retention to the academic year.

## v9 (2026-10-21)
- Google sign-in removed. Registration form (Student / Teacher / Industry partner) + e-mail code confirmation restored; login by e-mail + password, with "e-mail me a sign-in code" fallback.
- Migration `20261021100000_sitam_v9_registration.sql`: `handle_new_user` keeps the role chosen in the form (teacher/student need an @sdu.edu.kz e-mail), stores course/major/department/company/position; `submit_project` reopened for kinds `project` and `research` (startups stay closed); `my_context` returns pending moderation count again.
- Tests: `supabase/tests/permissions_tests.sql` (35 checks).

## v9.5 (2026-10-23)
- `20261023100000_sitam_v9_5_no_email_codes.sql` (applied to the live database): trigger `auto_confirm_signup` on `auth.users` confirms new accounts at once, so registration needs no e-mail code; stuck unconfirmed accounts that have a profile were confirmed. The register form signs the person in with the chosen password right after sign-up.
- Tests: `supabase/tests/permissions_tests.sql` — 37 checks.
- `20261023120000_sitam_v9_6_coordinator_match.sql`: coordinator e-mails are trimmed + lower-cased on save; `is_coordinator()` also checks the sign-in account e-mail. The site shows a yellow notice when `my_context` fails (database not set up / no access) instead of silently treating everyone as a plain student.
- New Supabase project `xcgxszlximwvqizwgphd` (2026-10-23): set up with `supabase/setup-new-database.sql`.

## v10 (2026-10-24)
- `20261024100000_sitam_v10_competitions.sql`: external events (`event_series` for annual events, `external_events`, `external_event_labs` = a lab's participation + result + submitted project, `external_event_people` = students / mentors). Public read; writes only via `save_external_event`, `delete_external_event` (author or coordinator), `save_event_participation`, `remove_event_participation` (heads of that lab or coordinator; result only after the event started). `name_key()`; `assign_lab_head` reuses an imported head row with the same name.
- `20261024100100_sitam_v10_data.sql` (generated by `scripts/build-seed.mjs data/labs.json data/professors.json`): 21 labs with the coordinator's heads list (head e-mails from the Scopus export link the head row when that person registers), the 7 lab forms, Scopus v7 (83 researchers, 315 publications). Non-destructive: only empty fields are filled, nobody is removed.
- `20261024100200_sitam_v10_competitions_seed.sql`: the labs' reported awards as results.
- Existing database → `supabase/update-to-v10.sql`; empty database → `supabase/setup-new-database.sql`. Tests: 51 checks.

## v11 (2026-10-25)
- `20261025100000_sitam_v11_labs_events.sql`: focus Courses / Academic / Education → Education, order Industry · Research · Education; `labs.direction` (filled for the 21 labs; RedHat → Cloud & Cybersecurity), `labs.upcoming_activities`, `lab_members.is_past` + `graduation_year` (column grants for heads), `events.poster_url` + `set_event_poster` (organizers), `external_events.poster_url` + `set_external_event_poster` (author / coordinator).
- Existing database → `supabase/update-to-v11.sql`. Tests: 57 checks.

## v12 (2026-10-27)
- Migration `20261027100000_sitam_v12_industry_communities.sql` (run `supabase/update-to-v12.sql` on the live project; re-runnable).
- `labs.kind` ('lab' | 'community') + trigger `labs_kind_guard` (only `is_admin()` changes it). Seeds 3 communities: AWS Student Builders Group, Competitive Programming Team, SDU Official Hackathon Team.
- Focus "Industry & Commercial Projects" → "Commercial Projects".
- `profiles.personal_email` (column grant update; in `public_people`, signed-in users only).
- `external_events.location_type` ('sdu' | 'outside' | 'online'), `external_events.cohosted`; RPC `set_external_event_place(event, location_type, cohosted)` — author or coordinator.
- `industry_partners` (name, short_name, logo_url, website, ceo, founded_year, sdu_alumni[], upcoming_projects[], completed_projects[], lab_ids[]): public read, coordinator writes (RLS). Seeded from the lab forms (5 partners); CEO / year / alumni are left empty for the coordinator.
- v12.1 `20261027120000_sitam_v12_1_lab_tags.sql`: `admin_rename_lab_tag(kind, old, new)` — coordinator renames / merges / removes a research area, skill or equipment item in every lab (case-insensitive, no duplicates).
- Tests: `supabase/tests/permissions_tests.sql` — 72 checks.

## v13 (2026-10-28)
- Migration `20261028100000_sitam_v13_photos_academic_plan.sql`; run `supabase/update-to-v13.sql` (contains v12, v12.1 and v13; re-runnable).
- `events.photo_urls` + RPC `set_event_photos(event, urls[])` (can_manage_event; ≤ 80 https links).
- `academic_plans`, `academic_plan_items`: public read, coordinator (`is_admin()`) writes. Seeded: "Academic Year 2026–2027" (current, no dates — the coordinator adds them).
- Storage bucket `documents` (public, PDF ≤ 20 MB), coordinator-only upload.
- Tests: 77 checks.

## v15 (2026-10-29)
- Migration `20261029100000_sitam_v15_submission_affiliation.sql`: `projects.related_lab_id`, `projects.supervisor_id`, RPC `set_submission_affiliation`. Run `supabase/update-to-v15.sql` (contains v12 → v15, re-runnable). Tests: 80 checks.

## v16 (2026-10-30) — Ask SITAM
- Migration `20261030100000_sitam_v16_ask_sitam.sql` (in `update-to-v16.sql`, which contains v12 → v16): pgvector, `ai_documents`, `ai_faq`, view `ai_sources`, `ai_pending_documents`, `ai_upsert_document`, `ai_remove_stale`, `ai_index_status`, `match_documents`, `ai_usage` + `ai_take_quota`. Service-role-only helpers; `match_documents` / `ai_index_status` for signed-in users.
- Edge Functions `ask-sitam`, `ai-index`; setup in docs/ASK-SITAM.md.

## v17 (2026-10-31) — roles & onboarding
- Migration `20261031100000_sitam_v17_roles_onboarding.sql` (now in `update-to-v18.sql`): `app_role` + alumni, `is_lab_lead`, new `lab_members_guard` / `add_lab_member` (Head appoints Co-Heads), profiles.graduation_year / company, `public_people` + those, `enforce_signup_email` / `handle_new_user` (alumni), `submit_project` (no alumni), `help_offers` + `offer_help` / `respond_help_offer`, professors.bio / office_hours / interests, `researcher_profile_requests` + `request_researcher_profile` / `review_researcher_request` / `update_my_researcher_profile`, partner_request_type + internship / contact_lab, partner_requests.requested_lab_id.
- Tests: 98 checks (v16 needs pgvector, not in the local test database).
- v18: migration `20261101100000_sitam_v18_publications.sql` (in `update-to-v18.sql` = v12 → v18): professors.publications_updated_at, `can_edit_professor`, `save_publication`, `remove_publication`, `import_publications` — the linked teacher or the coordinator keeps the papers of a researcher card up to date. Tests: + 8 checks.
- v17.1 `20261031110000_sitam_v17_1_member_positions.sql`: `add_lab_member` again offers only member, mentor, research assistant, student researcher, project coordinator (+ Co-Head for the Head / coordinator). No Tech lead.
