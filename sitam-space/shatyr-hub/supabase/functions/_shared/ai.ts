// Shared helpers for the "Ask SITAM" Edge Functions (Deno, Supabase Edge Runtime).
// Secrets are read with Deno.env.get(...) — in Edge Functions this is the same as process.env in Node.
// Set them in Supabase → Edge Functions → Secrets (or `supabase secrets set NAME=value`).

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

/* ───────────── answer generation: Anthropic (Claude), OpenAI or Gemini — whichever key is set ───────────── */
export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type Provider = 'anthropic' | 'openai' | 'gemini';

export function provider(): Provider | null {
  const forced = env('AI_PROVIDER').toLowerCase();
  if (forced === 'anthropic' && env('ANTHROPIC_API_KEY')) return 'anthropic';
  if (forced === 'openai' && env('OPENAI_API_KEY')) return 'openai';
  if (forced === 'gemini' && env('GEMINI_API_KEY')) return 'gemini';
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

  if (p === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('OPENAI_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...turns] }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
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
