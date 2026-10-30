// "Ask SITAM" indexing: turns new or changed public items (labs, researchers, papers, projects, events, vacancies,
// partners, FAQ) into embeddings. Small batches, because Edge Functions have a short CPU budget per call —
// the Admin page calls it again until `remaining` is 0. Who may run it: the SITAM coordinator (their sign-in),
// or a scheduled job that sends the header x-cron-secret = secret AI_CRON_SECRET.
//
// ONE FILE: paste this whole file into Supabase → Edge Functions → Deploy a new function → Via editor.

/* ───────────── shared helpers (same in ask-sitam and ai-index) ───────────── */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const env = (k: string) => Deno.env.get(k) ?? '';

/** Server client (service role): bypasses row-level security — only for the ai_* helper functions. */
export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

/** Client that acts as the signed-in caller (their JWT) — used to know who is asking and their rights. */
export function userClient(req: Request): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

/* ───────────── embeddings: free model "gte-small" built into Supabase Edge Runtime (384 numbers) ───────────── */
// deno-lint-ignore no-explicit-any
declare const Supabase: any;
let session: { run: (text: string, o: { mean_pool: boolean; normalize: boolean }) => Promise<number[]> } | null = null;

export async function embed(text: string): Promise<number[]> {
  session ??= new Supabase.ai.Session('gte-small');
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 2000); // the model reads ~512 tokens; the start of the text matters most
  const out = await session!.run(clean, { mean_pool: true, normalize: true });
  return Array.from(out);
}

/* ───────────── answer generation: Anthropic (Claude), OpenAI, Gemini or DeepSeek — whichever key is set ───────────── */
export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type Provider = 'anthropic' | 'openai' | 'gemini' | 'deepseek';

export function provider(): Provider | null {
  const forced = env('AI_PROVIDER').toLowerCase();
  if (forced === 'anthropic' && env('ANTHROPIC_API_KEY')) return 'anthropic';
  if (forced === 'openai' && env('OPENAI_API_KEY')) return 'openai';
  if (forced === 'gemini' && env('GEMINI_API_KEY')) return 'gemini';
  if (forced === 'deepseek' && env('DEEPSEEK_API_KEY')) return 'deepseek';
  if (env('DEEPSEEK_API_KEY')) return 'deepseek';
  if (env('ANTHROPIC_API_KEY')) return 'anthropic';
  if (env('OPENAI_API_KEY')) return 'openai';
  if (env('GEMINI_API_KEY')) return 'gemini';
  return null;
}

// Default model names; override any of them with the secret AI_MODEL (check the provider's current model list).
const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  deepseek: 'deepseek-chat',
};

export async function generate(system: string, turns: ChatTurn[], maxTokens = 700): Promise<string> {
  const p = provider();
  if (!p) throw new Error('NO_PROVIDER');
  const model = env('AI_MODEL') || DEFAULT_MODEL[p];

  if (p === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: turns }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const d = await r.json();
    return (d.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n').trim();
  }

  if (p === 'openai' || p === 'deepseek') {
    // DeepSeek uses the same request format as OpenAI
    const url = p === 'deepseek' ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions';
    const key = p === 'deepseek' ? env('DEEPSEEK_API_KEY') : env('OPENAI_API_KEY');
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...turns] }),
    });
    if (!r.ok) throw new Error(`${p === 'deepseek' ? 'DeepSeek' : 'OpenAI'} ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const d = await r.json();
    return (d.choices?.[0]?.message?.content ?? '').trim();
  }

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env('GEMINI_API_KEY')}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return (d.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? '').join('').trim();
}

/* ───────────── the function ───────────── */


// Small batches: an Edge Function has a short CPU budget per call (the embedding model is CPU-heavy).
// The Admin page calls again until `remaining` is 0.
const BATCH = Number(Deno.env.get('AI_INDEX_BATCH') ?? '4') || 4;
const TIME_BUDGET_MS = 15_000;

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
  const started = Date.now();
  for (const d of (pending ?? []) as { source_type: string; source_id: string; title: string; url: string; content: string; content_hash: string }[]) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
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
