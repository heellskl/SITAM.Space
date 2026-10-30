# Ask SITAM — AI assistant (RAG) setup

The chat button **Ask SITAM** (bottom right, signed-in people) answers questions from SITAM SPACE's own public data —
labs, communities, researchers and their Scopus papers, projects, events, competitions, vacancies, partners and the FAQ —
and lists the pages it used.

## Parts
| Part | File | What it does |
|---|---|---|
| Database | `supabase/migrations/20261030100000_sitam_v16_ask_sitam.sql` (in `supabase/update-to-v16.sql`) | pgvector, `ai_documents` (one row per page + embedding), view `ai_sources` (public text only), `match_documents`, daily limit `ai_take_quota` |
| Indexing | `supabase/functions/ai-index` | embeds new / changed pages with the free Supabase AI model `gte-small` (384 numbers) |
| Answering | `supabase/functions/ask-sitam` | question → embedding → `match_documents` (top 8) → LLM answers only from those pages, with [1] [2] citations |
| Site | `src/components/ask-sitam.tsx`, `src/components/ai-index-panel.tsx` (Admin) | chat panel; "Update AI index" button for the coordinator |

Never indexed: CVs, phone numbers, e-mails, applications, registrations, lab "Internal" answers, B2B briefs.

## Set up (once)
1. **SQL**: Supabase → SQL Editor → run `supabase/update-to-v16.sql` (contains v12 → v16, safe to run again).
2. **Edge Functions** (Supabase → Edge Functions → Deploy a new function → via editor), or with the CLI:
   ```bash
   supabase functions deploy ask-sitam
   supabase functions deploy ai-index
   ```
   With the editor: create `ask-sitam` and `ai-index`, paste each `index.ts`, and add the shared file `_shared/ai.ts`
   (or paste its content above the function code and remove the `import … from '../_shared/ai.ts'` line).
3. **Secrets** (Supabase → Edge Functions → Secrets). In Edge Functions they are read with `Deno.env.get('NAME')` —
   the same thing as `process.env.NAME` in Node:
   | Secret | Needed | Meaning |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | one of the three | Claude (console.anthropic.com) |
   | `OPENAI_API_KEY` | one of the three | OpenAI |
   | `GEMINI_API_KEY` | one of the three | Google Gemini (aistudio.google.com) |
   | `AI_PROVIDER` | optional | `anthropic` / `openai` / `gemini` when several keys are set |
   | `AI_MODEL` | optional | model name; defaults: `claude-haiku-4-5`, `gpt-4o-mini`, `gemini-2.0-flash` — check the provider's current list |
   | `AI_DAILY_LIMIT` | optional | questions per person per day (default 30) |
   | `AI_CRON_SECRET` | optional | lets a scheduled job call `ai-index` with header `x-cron-secret` |
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase automatically.
   **No key yet?** Ask SITAM still works: it shows the most relevant pages without a written answer.
4. **Index**: sign in as the coordinator → Admin → "Ask SITAM — AI index" → **Update AI index**. Repeat after big changes
   (or schedule `ai-index` with pg_cron + pg_net and `x-cron-secret`).

## Costs and limits
- Embeddings (`gte-small`) are free and run inside Supabase.
- Each question = one LLM call with ~8 short pages (a few thousand tokens). Cost depends on the provider and model.
- Daily limit per person: `AI_DAILY_LIMIT` (table `ai_usage`).
