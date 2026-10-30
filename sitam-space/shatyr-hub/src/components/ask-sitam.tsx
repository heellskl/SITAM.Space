// "Ask SITAM": a chat button (bottom right, signed-in people) → Edge Function ask-sitam.
// Answers come only from SITAM SPACE pages and always list their sources. Without an AI key on the server it
// still shows the most relevant pages. The assistant never sees CVs, phones, applications or lab Internal data.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from '@tanstack/react-router';
import { ArrowUp, Loader2, Sparkles, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

type Source = { n: number; title: string; url: string; type: string };
type Msg = { role: 'user' | 'assistant'; content: string; sources?: Source[]; error?: boolean };

const TYPE_LABEL: Record<string, string> = {
  lab: 'Lab', researcher: 'Researcher', publication: 'Paper', project: 'Project', event: 'Event',
  external_event: 'Competition', opportunity: 'Opportunity', partner: 'Partner', faq: 'FAQ',
};
const EXAMPLES = ['Which lab works on computer vision?', 'Who can supervise NLP research?', 'What events are coming up?', 'How do I join a lab?'];

export function AskSitam() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [msgs, busy]);
  if (!user) return null;

  async function ask(text: string) {
    const question = text.trim();
    if (question.length < 3 || busy) return;
    const history = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })).slice(-6);
    setMsgs((m) => [...m, { role: 'user', content: question }]);
    setQ('');
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('ask-sitam', { body: { question, history } });
    setBusy(false);
    if (error || data?.error) {
      let msg = data?.error as string | undefined;
      try { msg ??= (await (error as { context?: Response })?.context?.json())?.error; } catch { /* not JSON */ }
      setMsgs((m) => [...m, { role: 'assistant', content: msg ?? 'Ask SITAM is not available right now.', error: true }]);
      return;
    }
    const sources = (data?.sources ?? []) as Source[];
    const content = data?.answer ?? (sources.length ? 'Here are the most relevant pages on SITAM SPACE:' : 'Nothing found on SITAM SPACE for this question.');
    setMsgs((m) => [...m, { role: 'assistant', content, sources }]);
  }

  const go = (url: string) => { setOpen(false); router.history.push(url); };
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(q); };

  return (
    <>
      {!open && (
        <button type="button" className="ask-fab" onClick={() => setOpen(true)} aria-label="Ask SITAM">
          <Sparkles size={18} /><span>Ask SITAM</span>
        </button>
      )}
      {open && (
        <section className="ask-panel" role="dialog" aria-label="Ask SITAM">
          <header className="ask-head">
            <strong><Sparkles size={16} />Ask SITAM</strong>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button>
          </header>
          <div className="ask-body" aria-live="polite">
            {msgs.length === 0 && (
              <div className="ask-empty">
                <p>Ask about labs, researchers, papers, events, vacancies or how SITAM SPACE works. Answers come from this site and show their sources.</p>
                <div className="ask-examples">{EXAMPLES.map((x) => <button key={x} type="button" onClick={() => void ask(x)}>{x}</button>)}</div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`ask-msg ${m.role}${m.error ? ' is-error' : ''}`}>
                <p>{m.content}</p>
                {!!m.sources?.length && (
                  <ol className="ask-sources">
                    {m.sources.map((s) => (
                      <li key={s.n}>
                        <button type="button" onClick={() => go(s.url)}><span className="ask-n">{s.n}</span><span className="ask-type">{TYPE_LABEL[s.type] ?? s.type}</span>{s.title}</button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
            {busy && <div className="ask-msg assistant"><p className="ask-typing"><Loader2 size={14} className="animate-spin" />Searching SITAM SPACE…</p></div>}
            <div ref={end} />
          </div>
          <form className="ask-form" onSubmit={submit}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question…" maxLength={600} aria-label="Your question" autoFocus />
            <button type="submit" disabled={busy || q.trim().length < 3} aria-label="Send"><ArrowUp size={16} /></button>
          </form>
        </section>
      )}
    </>
  );
}
