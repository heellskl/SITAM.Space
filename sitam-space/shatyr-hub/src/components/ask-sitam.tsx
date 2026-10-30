// "Ask SITAM": chat panel (bottom right, signed-in people) → Edge Function ask-sitam.
// • Scope chips (Auto · Labs · People · Papers · Events · Opportunities · Projects · FAQ): the search looks only at
//   that kind of page; in Auto the server recognises it from the question ("which lab…" → labs only).
// • Answers are short lists with [1] [2] citations; the cards below show the pages the answer used.
// • The conversation is kept while the person browses (sessionStorage): open a page from the chat, then come
//   back to the chat with the "Ask SITAM" button — everything is still there. "New chat" starts over.

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from '@tanstack/react-router';
import {
  ArrowUp, BookOpen, Briefcase, CalendarDays, ChevronDown, CircleHelp, FlaskConical, Loader2, Minus, RotateCcw, Rocket, Sparkles, UserRound,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

type Source = { n: number; title: string; url: string; type: string; cited?: boolean };
type Msg = { role: 'user' | 'assistant'; content: string; sources?: Source[]; error?: boolean };
type Scope = 'auto' | 'labs' | 'people' | 'papers' | 'events' | 'opportunities' | 'projects' | 'faq';

const SCOPES: { id: Scope; label: string }[] = [
  { id: 'auto', label: 'Auto' }, { id: 'labs', label: 'Labs' }, { id: 'people', label: 'Researchers' }, { id: 'papers', label: 'Papers' },
  { id: 'events', label: 'Events' }, { id: 'opportunities', label: 'Opportunities' }, { id: 'projects', label: 'Projects' }, { id: 'faq', label: 'FAQ' },
];
const TYPE: Record<string, { label: string; icon: typeof FlaskConical }> = {
  lab: { label: 'Lab', icon: FlaskConical }, researcher: { label: 'Researcher', icon: UserRound }, publication: { label: 'Paper', icon: BookOpen },
  project: { label: 'Project', icon: Rocket }, event: { label: 'Event', icon: CalendarDays }, external_event: { label: 'Competition', icon: CalendarDays },
  opportunity: { label: 'Opportunity', icon: Briefcase }, partner: { label: 'Partner', icon: Briefcase }, faq: { label: 'FAQ', icon: CircleHelp },
};
const EXAMPLES: { q: string; scope: Scope }[] = [
  { q: 'Which lab works on computer vision?', scope: 'labs' },
  { q: 'Who can supervise research on NLP?', scope: 'people' },
  { q: 'What hackathons are coming up?', scope: 'events' },
  { q: 'Where can I find an internship?', scope: 'opportunities' },
];
const STORE = 'sitam-ask-v1';

function load(): { msgs: Msg[]; open: boolean; scope: Scope } {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE) ?? '');
    return { msgs: Array.isArray(v.msgs) ? v.msgs.slice(-30) : [], open: !!v.open, scope: v.scope ?? 'auto' };
  } catch { return { msgs: [], open: false, scope: 'auto' }; }
}

/** Tiny formatter: paragraphs, "- " / "1. " lists, **bold**, and [n] as clickable citation chips. */
function Rich({ text, onCite, known }: { text: string; onCite: (n: number) => void; known: Set<number> }) {
  const inline = (line: string, key: string): ReactNode[] =>
    line.split(/(\*\*[^*]+\*\*|\[\d{1,2}\])/g).filter(Boolean).map((part, i) => {
      const b = /^\*\*(.+)\*\*$/.exec(part);
      if (b) return <strong key={`${key}-${i}`}>{b[1]}</strong>;
      const c = /^\[(\d{1,2})\]$/.exec(part);
      if (c && known.has(Number(c[1]))) return <button key={`${key}-${i}`} type="button" className="ask-cite" onClick={() => onCite(Number(c[1]))} aria-label={`Open source ${c[1]}`}>{c[1]}</button>;
      return <span key={`${key}-${i}`}>{part}</span>;
    });
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(<Tag key={`l${blocks.length}`} className="ask-list">{list.items.map((it, i) => <li key={i}>{inline(it, `li${blocks.length}-${i}`)}</li>)}</Tag>);
    list = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const num = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || num) {
      const ordered = !!num;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? num)![1]!);
      continue;
    }
    flush();
    if (line) blocks.push(<p key={`p${blocks.length}`}>{inline(line.replace(/^#+\s*/, ''), `p${blocks.length}`)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

function SourceCards({ sources, onOpen }: { sources: Source[]; onOpen: (s: Source) => void }) {
  const [more, setMore] = useState(false);
  const cited = sources.filter((s) => s.cited);
  const main = cited.length ? cited : sources.slice(0, 3);
  const rest = sources.filter((s) => !main.includes(s));
  const card = (s: Source) => {
    const t = TYPE[s.type] ?? { label: s.type, icon: CircleHelp };
    const Icon = t.icon;
    return (
      <li key={s.n}>
        <button type="button" className="ask-card" onClick={() => onOpen(s)}>
          <span className={`ask-card-ic t-${s.type}`}><Icon size={15} /></span>
          <span className="ask-card-text"><small>{t.label}</small><strong>{s.title}</strong></span>
          <span className="ask-card-n">{s.n}</span>
        </button>
      </li>
    );
  };
  return (
    <div className="ask-sources">
      <ul>{main.map(card)}</ul>
      {rest.length > 0 && (
        <>
          <button type="button" className="ask-more" onClick={() => setMore((x) => !x)} aria-expanded={more}>
            <ChevronDown size={14} className={more ? 'rot' : ''} />{more ? 'Fewer pages' : `${rest.length} more related ${rest.length === 1 ? 'page' : 'pages'}`}
          </button>
          {more && <ul>{rest.map(card)}</ul>}
        </>
      )}
    </div>
  );
}

export function AskSitam() {
  const { user } = useAuth();
  const router = useRouter();
  const [state] = useState(load);
  const [open, setOpen] = useState(state.open);
  const [msgs, setMsgs] = useState<Msg[]>(state.msgs);
  const [scope, setScope] = useState<Scope>(state.scope);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify({ msgs: msgs.slice(-30), open, scope })); } catch { /* storage blocked */ } }, [msgs, open, scope]);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy, open]);
  if (!user) return null;

  async function ask(text: string, sc: Scope = scope) {
    const question = text.trim();
    if (question.length < 3 || busy) return;
    // only answered questions: a question whose answer failed is left out together with the error
    const history = msgs
      .filter((m, i) => !m.error && !(m.role === 'user' && msgs[i + 1]?.error))
      .map((m) => ({ role: m.role, content: m.content }))
      .slice(-6);
    setMsgs((m) => [...m, { role: 'user', content: question }]);
    setQ('');
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('ask-sitam', { body: { question, history, scope: sc } });
    setBusy(false);
    if (error || data?.error) {
      let msg = data?.error as string | undefined;
      try { msg ??= (await (error as { context?: Response })?.context?.json())?.error; } catch { /* not JSON */ }
      setMsgs((m) => [...m, { role: 'assistant', content: msg ?? 'Ask SITAM is not available right now.', error: true }]);
      return;
    }
    const sources = (data?.sources ?? []) as Source[];
    const content = data?.answer ?? (sources.length ? 'These pages on SITAM SPACE match your question:' : 'Nothing found on SITAM SPACE for this question.');
    setMsgs((m) => [...m, { role: 'assistant', content, sources }]);
  }

  // open a page and keep the chat: on a computer the panel stays open, on a phone it folds into the button
  const openPage = (s: Source) => {
    if (window.matchMedia('(max-width: 760px)').matches) setOpen(false);
    router.history.push(s.url);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(q); };
  const reset = () => { setMsgs([]); setQ(''); input.current?.focus(); };
  const asked = msgs.filter((m) => m.role === 'user').length;

  return (
    <>
      {!open && (
        <button type="button" className={asked ? 'ask-fab has-chat' : 'ask-fab'} onClick={() => setOpen(true)} aria-label={asked ? 'Back to Ask SITAM' : 'Ask SITAM'}>
          <Sparkles size={18} /><span>{asked ? 'Back to chat' : 'Ask SITAM'}</span>
        </button>
      )}
      {open && (
        <section className="ask-panel" role="dialog" aria-label="Ask SITAM">
          <header className="ask-head">
            <span className="ask-logo"><Sparkles size={16} /></span>
            <div className="ask-title"><strong>Ask SITAM</strong><small>Answers from SITAM SPACE pages</small></div>
            {msgs.length > 0 && <button type="button" className="ask-icon" onClick={reset} title="New chat" aria-label="New chat"><RotateCcw size={16} /></button>}
            <button type="button" className="ask-icon" onClick={() => setOpen(false)} title="Minimise — the chat is kept" aria-label="Minimise"><Minus size={18} /></button>
          </header>

          <div className="ask-scope" role="radiogroup" aria-label="Search in">
            {SCOPES.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={scope === s.id} className={scope === s.id ? 'is-on' : ''} onClick={() => setScope(s.id)}>{s.label}</button>
            ))}
          </div>

          <div className="ask-body" aria-live="polite">
            {msgs.length === 0 && (
              <div className="ask-empty">
                <span className="ask-empty-ic"><Sparkles size={22} /></span>
                <h3>What are you looking for?</h3>
                <p>Labs, supervisors, papers, events, internships or how SITAM SPACE works. Answers show the pages they come from.</p>
                <div className="ask-examples">
                  {EXAMPLES.map((x) => <button key={x.q} type="button" onClick={() => { setScope(x.scope); void ask(x.q, x.scope); }}>{x.q}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => {
              const known = new Set((m.sources ?? []).map((s) => s.n));
              const cite = (n: number) => { const s = m.sources?.find((x) => x.n === n); if (s) openPage(s); };
              return (
                <div key={i} className={`ask-msg ${m.role}${m.error ? ' is-error' : ''}`}>
                  {m.role === 'assistant' && !m.error ? <div className="ask-rich"><Rich text={m.content} onCite={cite} known={known} /></div> : <p>{m.content}</p>}
                  {!!m.sources?.length && <SourceCards sources={m.sources} onOpen={openPage} />}
                </div>
              );
            })}
            {busy && <div className="ask-msg assistant"><p className="ask-typing"><Loader2 size={14} className="animate-spin" />Searching SITAM SPACE…</p></div>}
            <div ref={end} />
          </div>

          <form className="ask-form" onSubmit={submit}>
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} maxLength={600} aria-label="Your question" autoFocus
              placeholder={scope === 'auto' ? 'Ask a question…' : `Ask about ${SCOPES.find((s) => s.id === scope)?.label.toLowerCase()}…`} />
            <button type="submit" disabled={busy || q.trim().length < 3} aria-label="Send"><ArrowUp size={16} /></button>
          </form>
        </section>
      )}
    </>
  );
}
