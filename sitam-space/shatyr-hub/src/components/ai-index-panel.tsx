// Admin → "Ask SITAM": how many pages the assistant knows and a button to index new / changed ones.
// Runs the Edge Function ai-index in small batches until nothing is left.

import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

type Status = { indexed: number; pending: number; last_update: string | null };

export function AiIndexPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const load = async () => {
    const { data, error } = await supabase.rpc('ai_index_status' as never);
    if (!error) setStatus(data as unknown as Status);
  };
  useEffect(() => { void load(); }, []);

  // one call of the Edge Function; its own error text when it fails (not just "non-2xx status code")
  async function callOnce(): Promise<{ indexed_now?: number; remaining?: number | null }> {
    const { data, error } = await supabase.functions.invoke('ai-index', { body: {} });
    if (!error && !data?.error) return data;
    let msg = data?.error as string | undefined;
    try { msg ??= (await (error as { context?: Response })?.context?.json())?.error; } catch { /* not JSON */ }
    try { msg ??= `HTTP ${(error as { context?: Response })?.context?.status}`; } catch { /* no status */ }
    throw new Error(msg ?? error?.message ?? 'Indexing failed');
  }

  async function run() {
    setBusy(true);
    setDone(0);
    let fails = 0;
    try {
      for (let i = 0; i < 400; i++) {
        let data: { indexed_now?: number; remaining?: number | null };
        try {
          data = await callOnce();
          fails = 0;
        } catch (e) {
          // a busy or cold function: wait and try again (3 times in a row at most)
          fails += 1;
          if (fails > 3) throw e;
          await new Promise((r) => setTimeout(r, 2000 * fails));
          continue;
        }
        setDone((n) => n + (data.indexed_now ?? 0));
        if (i % 3 === 0) await load();
        if (!data.remaining) break;
      }
      toast.success('Ask SITAM is up to date');
    } catch (e) {
      toast.error('The AI index was not updated', { description: (e as Error).message });
    } finally {
      setBusy(false);
      void load();
    }
  }

  return (
    <section className="panel mt-6" aria-labelledby="ai-index">
      <h3 className="panel-title" id="ai-index"><Sparkles size={15} />Ask SITAM — AI index</h3>
      {status ? (
        <p className="small-note mb-3">
          {status.indexed} pages indexed · {status.pending} new or changed{status.last_update ? ` · last update ${new Date(status.last_update).toLocaleString('en-GB')}` : ''}
        </p>
      ) : <p className="small-note mb-3">The AI tables are not set up yet (run the v16 SQL) or the status could not be read.</p>}
      <Button size="sm" onClick={() => void run()} disabled={busy}>
        <RefreshCw className={busy ? 'animate-spin' : ''} />{busy ? `Indexing… ${done}` : 'Update AI index'}
      </Button>
      <p className="small-note mt-3">Run it after big changes (new labs, a Scopus import, many events). Only public information is indexed.</p>
    </section>
  );
}
