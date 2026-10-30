// "Ask SITAM" indexing: turns new or changed public items (labs, researchers, papers, projects, events, vacancies,
// partners, FAQ) into embeddings. Small batches, because Edge Functions have a short CPU budget per call —
// the Admin page calls it again until `remaining` is 0. Who may run it: the SITAM coordinator (their sign-in),
// or a scheduled job that sends the header x-cron-secret = secret AI_CRON_SECRET.

import { cors, embed, json, serviceClient, userClient } from '../_shared/ai.ts';

const BATCH = Number(Deno.env.get('AI_INDEX_BATCH') ?? '15') || 15;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const cron = Deno.env.get('AI_CRON_SECRET');
  const byCron = !!cron && req.headers.get('x-cron-secret') === cron;
  if (!byCron) {
    const { data: isCoordinator, error } = await userClient(req).rpc('is_coordinator');
    if (error || !isCoordinator) return json({ error: 'Only the SITAM coordinator can update the AI index.' }, 403);
  }

  const db = serviceClient();
  const { data: pending, error: pErr } = await db.rpc('ai_pending_documents', { p_limit: BATCH });
  if (pErr) return json({ error: pErr.message }, 500);

  let done = 0;
  const failed: string[] = [];
  for (const d of (pending ?? []) as { source_type: string; source_id: string; title: string; url: string; content: string; content_hash: string }[]) {
    try {
      const vector = await embed(`${d.title}\n${d.content}`);
      const { error } = await db.rpc('ai_upsert_document', {
        p_source_type: d.source_type, p_source_id: d.source_id, p_title: d.title, p_url: d.url,
        p_content: d.content, p_hash: d.content_hash, p_embedding: vector,
      });
      if (error) throw error;
      done += 1;
    } catch (e) {
      failed.push(`${d.source_type}:${d.source_id} ${(e as Error).message}`);
    }
  }

  const { data: status } = await db.rpc('ai_index_status');
  let removed = 0;
  if ((status?.pending ?? 1) === 0) {
    const { data } = await db.rpc('ai_remove_stale');
    removed = Number(data ?? 0);
  }
  return json({ indexed_now: done, failed, removed, remaining: status?.pending ?? null, total: status?.indexed ?? null });
});
