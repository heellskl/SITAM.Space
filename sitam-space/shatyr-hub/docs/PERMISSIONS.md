# SITAM SPACE — permission matrix (source of truth)

Every agent checks its work against this file. **If code and this file disagree, stop and ask — do not silently "fix" either side.**
Changing a rule here needs the user's explicit approval (the main session asks).

Legend: ✅ allowed · ❌ not allowed · 🔒 only for own items · — not applicable
"Where enforced" = the database object that actually decides. The UI only shows/hides buttons.

## Actors

| Actor | How it is defined |
|---|---|
| Guest | not signed in |
| Student | `profiles.role = 'student'` (SDU e-mail starting with digits). Legacy `phd` accounts behave like students. |
| Teacher | `profiles.role = 'teacher'` (SDU e-mail starting with a name). **Verified teacher** = `staff_verified = true` (`is_staff()`). |
| Partner | `profiles.role = 'partner'`, member of a company. **Verified partner** = the company has `verified = true`. |
| Lab member | has a `lab_members` row in a lab with a non-head position (member, mentor, project_coordinator, research_assistant, student_researcher, and legacy student_lead / deputy_student_lead). |
| Lab head | `lab_members.role` in (`lead`, `co_lead`) for **that** lab → `can_edit = true` → `is_lab_manager(lab)`. A student or a teacher. Extra to the base role, never replaces it. |
| Coordinator | e-mail in `coordinator_emails` → `is_coordinator()`; `is_admin()` is true for them. |

## Matrix

| # | Action | Guest | Student | Teacher | Partner | Lab member | Lab head (own lab) | Coordinator | Where enforced |
|---|---|---|---|---|---|---|---|---|---|
| 1 | View labs, projects, events, opportunities, research | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | public RLS select |
| 2 | See people's contacts (name, role, e-mail), `/people/$id` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | view `public_people` (authenticated only) |
| 3 | Sign in | Google SDU | Google SDU | Google SDU | e-mail + password | — | — | Google SDU | `enforce_signup_email`, `handle_new_user` |
| 4 | Choose own account type | ❌ | ❌ (from e-mail) | ❌ (from e-mail) | ❌ | — | — | ❌ | `account_type_from_email` |
| 5 | Edit own profile (name, photo, faculty, group, major) + CV | — | ✅ | ✅ | ✅ (no CV) | — | — | ✅ | column grants on `profiles`, storage `cvs`/`avatars` own folder |
| 6 | Apply to an opportunity (with CV) | ❌ (login modal) | ✅ | ❌ | ❌ | ✅ (as student) | ❌ on own lab's listings | ❌ | `submit_application` (role student/phd, not own listing) |
| 7 | Withdraw own application | — | 🔒 | — | — | — | — | — | `withdraw_application` |
| 8 | Register for an event / get QR ticket | ❌ (login modal) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `register_for_event` (any signed-in, seats left, not over) |
| 9 | Save a lab | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | RLS `saved_labs` own rows |
| 10 | Create / rename / delete a lab | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | `admin_create_lab`, RLS `labs` (admin) |
| 11 | Edit lab information (about, logo, socials, photos, achievements, teaching, partners, alumni) | ❌ | ❌ | ❌ | ❌ | ❌ | 🔒 | ✅ | RLS `labs` update: `is_lab_manager` |
| 12 | Read lab Internal section | ❌ | ❌ | ⚠️ verified teachers can read **all** labs' internals (`is_staff`) — confirm with the user if this is intended | ❌ | ❌ | 🔒 | ✅ | RLS `lab_internal` select |
| 13 | Assign / remove a lab head | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | `assign_lab_head`, `remove_lab_head`, trigger `lab_members_guard` |
| 14 | Add / remove members, change a member's position (non-head positions only) | ❌ | ❌ | ❌ | ❌ | ❌ | 🔒 | ✅ | `add_lab_member` (registered users only), RLS + `lab_members_guard` |
| 15 | Create / edit / delete lab projects | ❌ | ❌ | ❌ | ❌ | ❌ | 🔒 | ✅ | RLS `projects` (`is_lab_manager(lab_id)`), column grants |
| 16 | Submit own (non-lab) project / research | ❌ | ❌ (closed) | ❌ | ❌ | ❌ | ❌ | ❌ | `submit_project` raises NOT_ALLOWED |
| 17 | Create / edit an event | ❌ | ❌ | ❌ | ❌ | ❌ | 🔒 hosted by own lab | ✅ | `save_event`, `can_manage_event` |
| 18 | See attendees, check-in by QR | ❌ | ❌ | ❌ | ❌ | ❌ | 🔒 | ✅ | `event_attendees`, `check_in` (`can_manage_event`) |
| 19 | Post a Lab / Research case for a lab | ❌ | ❌ | ❌ | ❌ | ❌ | 🔒 | ✅ | `save_opportunity` (`is_lab_manager` per lab host) |
| 20 | Post an opportunity in own name ("Prof. X") | ❌ | ❌ | ✅ verified only | ❌ | — | — | ✅ | `save_opportunity(p_as_me)` → `can_post_as_person` (`is_staff`) |
| 21 | Post an industrial case (vacancy / internship / project) | ❌ | ❌ | ❌ | ✅ verified company only | — | — | ✅ | `save_opportunity` (`is_company_member`, industrial needs company host) |
| 22 | Review applications + open applicant CV | ❌ | ❌ | 🔒 own listings | 🔒 own company's listings | ❌ | 🔒 own lab's listings | ✅ | `application_inbox`, `review_application`, `can_view_cv` |
| 23 | Accept on a lab / research case adds the student to the lab as research_assistant | — | — | — | — | — | automatic | automatic | `review_application` |
| 24 | Verify teachers and companies | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | `verify_staff`, `verify_company` |
| 25 | Submit a B2B brief (/partners) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | RLS insert `partner_requests` |
| 26 | Read B2B briefs | ❌ | ❌ | ✅ verified (all) | 🔒 own | ❌ | ❌ | ✅ | RLS `partner_requests` select |
| 27 | See the Admin page (/admin) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | UI `caps.isCoordinator`; every action re-checked in SQL |

## Invariants (must always hold)

1. A lab position never changes `profiles.role`. A student lab head is still a student (can apply elsewhere).
2. Only `lead` / `co_lead` manage a lab. No other position gives rights.
3. Nobody but the coordinator creates, changes or removes a head row.
4. A head removed by the coordinator stays in the lab as `member`.
5. Clients never write `lab_members.user_id`, `lab_members.can_edit`, `lab_members.lab_id`, nor insert directly into `applications`, `events`, `event_hosts`, `opportunity_hosts`, `opportunities`, `event_registrations`.
6. CVs: visible only to the owner and to reviewers of the exact application. Phones are never public.
7. Whatever a lab creates (event, project, case) appears in every matching section automatically (Events / Projects / Opportunities + the lab page).

## Open questions (ask the user before relying on them)

- Row 12: should verified teachers read the Internal section of **every** lab, or only heads + coordinator?
- Row 8: should partners be able to register for events?
- Row 26: should all verified teachers read all B2B briefs?
