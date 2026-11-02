-- SITAM SPACE — keep the "Ask SITAM" index up to date automatically (optional, run once).
-- Without it new labs, events and vacancies reach the assistant only when the coordinator presses
-- Admin → "Update AI index". With it the database calls the Edge Function "ai-index" every 5 minutes:
-- new or changed pages are indexed (a few per call) and closed vacancies / deleted items leave the index.
--
-- Before running:
--   1. Make up a long random secret (e.g. 40 letters and digits).
--   2. Supabase → Edge Functions → Secrets: add AI_CRON_SECRET = that secret.
--   3. Replace PASTE-THE-SAME-SECRET below with the same secret, then run this file in the SQL Editor.
-- To stop it later: select cron.unschedule('sitam-ai-index');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- the secret is kept in Supabase Vault, not in the job text
do $$ begin
  if exists (select 1 from vault.secrets where name = 'sitam_ai_cron_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'sitam_ai_cron_secret'), 'PASTE-THE-SAME-SECRET');
  else
    perform vault.create_secret('PASTE-THE-SAME-SECRET', 'sitam_ai_cron_secret');
  end if;
end $$;

select cron.unschedule('sitam-ai-index') where exists (select 1 from cron.job where jobname = 'sitam-ai-index');
select cron.schedule('sitam-ai-index', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://xcgxszlximwvqizwgphd.supabase.co/functions/v1/ai-index',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sitam_ai_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000)
$job$);
