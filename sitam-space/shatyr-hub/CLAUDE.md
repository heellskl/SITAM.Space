# SITAM SPACE — instructions for the main Claude session

Talk to the user in **Russian**. Code, comments and UI copy stay in **English**.

Project context: @docs/PROJECT-BRIEF.md
Permission matrix (source of truth): @docs/PERMISSIONS.md
Conventions: @AGENTS.md

## Team
| Agent | Owns | Never does |
|---|---|---|
| `sitam-db` | Supabase migrations, RLS, RPCs, triggers, storage, permission tests, data contract in `src/lib/api.ts` + `src/lib/auth.tsx` | page layout / design |
| `sitam-ui` | routes, components, styles, copy, UX, accessibility | SQL, rights |
| `sitam-reviewer` | independent review + tests, read-only | edits files |

## How to run a task
1. **Understand.** Restate the request in one or two sentences. If anything is unclear (which role, which page, what should happen in edge cases), ask the user with AskUserQuestion **before** delegating. Max 3 questions, with a recommended option first.
2. **Plan.** Split into steps by owner. Data or rights first (`sitam-db`), then interface (`sitam-ui`), then review (`sitam-reviewer`). Do not run `sitam-db` and `sitam-ui` at the same time on the same feature, and never let two agents edit the same file in parallel.
3. **Delegate** with a precise brief: goal, roles affected, matrix rows, files likely involved, acceptance criteria ("head of own lab sees X; member does not; coordinator does").
4. **Relay questions.** Subagents cannot ask the user. When an agent returns `NEEDS_DECISION` or `QUESTIONS FOR THE USER`, **do not answer it yourself** unless the answer is clearly written in the docs above — ask the user (AskUserQuestion, options + the agent's recommendation), then resume the same agent with the answer.
5. **Review.** After every change run `sitam-reviewer`. On `FAIL`, send the blockers back to the owning agent, then review again. Only `PASS` / `PASS WITH NOTES` is done.
6. **Report to the user** in Russian: what changed for each role, what was tested, what still needs a decision. No step-by-step narration.

## Rules that never change without the user's explicit "yes"
- Only the coordinator assigns / removes lab heads; heads manage only their own lab; members are read-only.
- Account type comes from the SDU e-mail; sign-in is SDU Google (partners: e-mail).
- Only students apply. CVs only to owner + reviewer of that application.
- Rights are enforced in the database; the UI only reflects them.
- Updating `docs/PERMISSIONS.md` = changing the rules → ask first.

## Shipping
Work in a git branch, keep it building (`npm run build`). The project syncs to Lovable via GitHub — never force-push or rewrite pushed history. **Database:** since 2026-10-23 the site uses its own Supabase project `xcgxszlximwvqizwgphd` (see `.env`), not Lovable Cloud. Every database change (new migration, data fix, new lab/coordinator) must also be run in that project: Supabase dashboard → SQL Editor, then record it:
  `insert into sitam_meta.applied_migrations (version, name) values ('<YYYYMMDDHHMMSS>', '<topic>');`
- A brand-new empty project is set up with `supabase/setup-new-database.sql` (all migrations in order).
- Before any DB work, compare `supabase/migrations/` with `select version from sitam_meta.applied_migrations order by 1;` — anything missing is applied first (oldest first).
