// "Ask SITAM": chat panel (bottom right, signed-in people) → Edge Function ask-sitam.
// • Scope chips (Auto · Labs · People · Papers · Events · Opportunities · Projects · FAQ): the search looks only at
//   that kind of page; in Auto the server recognises it from the question ("which lab…" → labs only).
// • Answers are short lists with [1] [2] citations; the cards below show the pages the answer used.
// • The conversation is kept while the person browses (sessionStorage): open a page from the chat, then come
//   back to the chat with the "Ask SITAM" button — everything is still there. "New chat" starts over.
// • Every answered question is saved to the person's archive (public.ask_questions, v22): FAQ → "Ask SITAM AI"
//   shows the same chat on the page with the archive next to it (open an old answer, delete a question).

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUp, BookOpen, Briefcase, CalendarDays, ChevronDown, CircleHelp, FlaskConical, History, Loader2, Maximize2, Minus, PanelRight, RotateCcw, Rocket, Sparkles, Trash2, UserRound,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Markdown } from '@/components/ask-markdown';

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
const VIEW_KEY = 'sitam-ask-view-v1';
// the big view is its own page (/ask), so the floating chat is a small window or a side panel
type View = 'float' | 'dock';
const readView = (): { view: View; width: number } => {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '');
    return { view: v.view === 'dock' ? 'dock' : 'float', width: Number(v.width) || 440 };
  } catch { return { view: 'float', width: 440 }; }
};
const clampWidth = (w: number) => Math.round(Math.min(Math.max(w, 360), Math.min(window.innerWidth * 0.7, 980)));

function load(): { msgs: Msg[]; open: boolean; scope: Scope } {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE) ?? '');
    return { msgs: Array.isArray(v.msgs) ? v.msgs.slice(-30) : [], open: !!v.open, scope: v.scope ?? 'auto' };
  } catch { return { msgs: [], open: false, scope: 'auto' }; }
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

/* ───────── archive: the person's answered questions (only they can see them) ───────── */
export type ArchivedQuestion = { id: string; question: string; answer: string; sources: Source[]; scope: Scope; created_at: string };
const ARCHIVE_KEY = ['ask-archive'] as const;

export function useAskArchive(enabled: boolean) {
  return useQuery({
    queryKey: ARCHIVE_KEY,
    enabled,
    queryFn: async () => {
      const { data, error } = await db.from('ask_questions').select('id, question, answer, sources, scope, created_at').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as ArchivedQuestion[];
    },
  });
}

/** Sends a question to the ask-sitam function and saves answered questions to the archive. */
function useAskChat(initial: Msg[], initialScope: Scope) {
  const qc = useQueryClient();
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [scope, setScope] = useState<Scope>(initialScope);
  const [busy, setBusy] = useState(false);

  async function ask(text: string, sc: Scope = scope) {
    const question = text.trim();
    if (question.length < 3 || busy) return false;
    // only answered questions: a question whose answer failed is left out together with the error
    const history = msgs
      .filter((m, i) => !m.error && !(m.role === 'user' && msgs[i + 1]?.error))
      .map((m) => ({ role: m.role, content: m.content }))
      .slice(-6);
    setMsgs((m) => [...m, { role: 'user', content: question }]);
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('ask-sitam', { body: { question, history, scope: sc } });
    setBusy(false);
    if (error || data?.error) {
      let msg = data?.error as string | undefined;
      try { msg ??= (await (error as { context?: Response })?.context?.json())?.error; } catch { /* not JSON */ }
      setMsgs((m) => [...m, { role: 'assistant', content: msg ?? 'Ask SITAM is not available right now.', error: true }]);
      return true;
    }
    const sources = (data?.sources ?? []) as Source[];
    const content = data?.answer ?? (sources.length ? 'These pages on SITAM SPACE match your question:' : 'Nothing found on SITAM SPACE for this question.');
    setMsgs((m) => [...m, { role: 'assistant', content, sources }]);
    // archive: best effort — the chat works even if saving fails
    const { error: saveError } = await db.from('ask_questions').insert({ question, answer: content.slice(0, 20000), sources, scope: sc });
    if (!saveError) void qc.invalidateQueries({ queryKey: ARCHIVE_KEY });
    return true;
  }
  return { msgs, setMsgs, scope, setScope, busy, ask };
}

function ChatMessages({ msgs, busy, onOpenUrl }: { msgs: Msg[]; busy: boolean; onOpenUrl: (url: string) => void }) {
  return (
    <>
      {msgs.map((m, i) => {
        const known = new Set((m.sources ?? []).map((s) => s.n));
        const cite = (n: number) => { const s = m.sources?.find((x) => x.n === n); if (s) onOpenUrl(s.url); };
        return (
          <div key={i} className={`ask-msg ${m.role}${m.error ? ' is-error' : ''}`}>
            {m.role === 'assistant' && !m.error ? <div className="ask-rich"><Markdown text={m.content} onCite={cite} known={known} onLink={onOpenUrl} /></div> : <p>{m.content}</p>}
            {!!m.sources?.length && <SourceCards sources={m.sources} onOpen={(s) => onOpenUrl(s.url)} />}
          </div>
        );
      })}
      {busy && <div className="ask-msg assistant"><p className="ask-typing"><Loader2 size={14} className="animate-spin" />Searching SITAM SPACE…</p></div>}
    </>
  );
}

export function AskSitam() {
  const { user } = useAuth();
  const router = useRouter();
  const [state] = useState(load);
  const [open, setOpen] = useState(state.open);
  const { msgs, setMsgs, scope, setScope, busy, ask: send } = useAskChat(state.msgs, state.scope);
  const [q, setQ] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // size: floating window, docked side panel (page shifts left — split screen) or full screen; width by dragging the edge
  const [{ view, width }, setLayout] = useState(readView);
  const setView = (v: View) => setLayout((l) => ({ ...l, view: v }));
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ view, width })); } catch { /* storage blocked */ } }, [view, width]);
  useEffect(() => {
    const root = document.documentElement;
    const docked = open && view === 'dock' && window.innerWidth > 900;
    root.classList.toggle('ask-docked', docked);
    root.style.setProperty('--ask-dock-w', `${width}px`);
    return () => root.classList.remove('ask-docked');
  }, [open, view, width]);
  const startResize = useCallback((e: { preventDefault(): void }) => {
    e.preventDefault();
    const right = view === 'dock' ? window.innerWidth : window.innerWidth - 20;
    const move = (ev: PointerEvent) => setLayout((l) => ({ ...l, width: clampWidth(right - ev.clientX) }));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('ask-resizing'); };
    document.body.classList.add('ask-resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [view]);
  const nudge = (d: number) => setLayout((l) => ({ ...l, width: clampWidth(l.width + d) }));

  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify({ msgs: msgs.slice(-30), open, scope })); } catch { /* storage blocked */ } }, [msgs, open, scope]);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy, open]);
  if (!user) return null;

  async function ask(text: string, sc: Scope = scope) {
    if (await send(text, sc) === false) return;
  }
  const askNow = (text: string, sc: Scope = scope) => { if (text.trim().length >= 3 && !busy) setQ(''); void ask(text, sc); };

  // open a page and keep the chat: on a computer the panel stays open, on a phone it folds into the button
  const openUrl = (url: string) => {
    if (window.matchMedia('(max-width: 760px)').matches) setOpen(false);
    router.history.push(url);
  };
  const openPage = (s: Source) => openUrl(s.url);
  const submit = (e: FormEvent) => { e.preventDefault(); askNow(q); };
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
        <section className={`ask-panel is-${view}`} role="dialog" aria-label="Ask SITAM" style={{ width: `min(${width}px, calc(100vw - ${view === 'dock' ? 0 : 32}px))` }}>
          {(
            <div className="ask-resize" role="separator" aria-orientation="vertical" aria-label="Resize the chat" tabIndex={0}
              onPointerDown={startResize} onKeyDown={(e) => { if (e.key === 'ArrowLeft') nudge(24); if (e.key === 'ArrowRight') nudge(-24); }} />
          )}
          <header className="ask-head">
            <span className="ask-logo"><Sparkles size={16} /></span>
            <div className="ask-title"><strong>Ask SITAM</strong><small>Answers from SITAM SPACE pages</small></div>
            {msgs.length > 0 && <button type="button" className="ask-icon" onClick={reset} title="New chat" aria-label="New chat"><RotateCcw size={16} /></button>}
            <button type="button" className={view === 'dock' ? 'ask-icon is-on hide-sm' : 'ask-icon hide-sm'} onClick={() => setView(view === 'dock' ? 'float' : 'dock')}
              title={view === 'dock' ? 'Back to a small window' : 'Side panel — the page stays visible'} aria-pressed={view === 'dock'} aria-label="Side panel"><PanelRight size={16} /></button>
            <button type="button" className="ask-icon" onClick={() => { setOpen(false); router.history.push('/ask'); }}
              title="Open as a page — with your saved questions" aria-label="Open Ask SITAM as a page"><Maximize2 size={16} /></button>
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
                  {EXAMPLES.map((x) => <button key={x.q} type="button" onClick={() => { setScope(x.scope); askNow(x.q, x.scope); }}>{x.q}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => {
              const known = new Set((m.sources ?? []).map((s) => s.n));
              const cite = (n: number) => { const s = m.sources?.find((x) => x.n === n); if (s) openPage(s); };
              return (
                <div key={i} className={`ask-msg ${m.role}${m.error ? ' is-error' : ''}`}>
                  {m.role === 'assistant' && !m.error ? <div className="ask-rich"><Markdown text={m.content} onCite={cite} known={known} onLink={openUrl} /></div> : <p>{m.content}</p>}
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

/* ───────── FAQ → "Ask SITAM AI": the chat on the page, with the person's archive of questions ───────── */
export function AskSitamPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [start] = useState(load);
  // the same conversation as the floating chat: it continues here and goes back with you
  const { msgs, setMsgs, scope, setScope, busy, ask } = useAskChat(start.msgs, start.scope);
  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify({ msgs: msgs.slice(-30), open: false, scope })); } catch { /* storage blocked */ } }, [msgs, scope]);
  const archive = useAskArchive(!!user);
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } end.current?.scrollIntoView({ block: 'nearest' }); }, [msgs, busy]);

  const go = (text: string, sc: Scope = scope) => {
    if (text.trim().length < 3 || busy) return;
    setQ(''); setOpenId(null);
    void ask(text, sc);
  };
  const openSaved = (a: ArchivedQuestion) => {
    setOpenId(a.id);
    setScope(a.scope ?? 'auto');
    setMsgs([{ role: 'user', content: a.question }, { role: 'assistant', content: a.answer, sources: Array.isArray(a.sources) ? a.sources : [] }]);
  };
  const remove = async (id: string) => {
    const { error } = await db.from('ask_questions').delete().eq('id', id);
    if (!error) {
      if (openId === id) { setOpenId(null); setMsgs([]); }
      void qc.invalidateQueries({ queryKey: ARCHIVE_KEY });
    }
  };
  const openUrl = (url: string) => router.history.push(url);

  if (!user) {
    return (
      <div className="ask-page-signin">
        <Sparkles size={20} />
        <p>Sign in to ask SITAM AI. Your questions and answers are saved here, in your archive.</p>
        <Link className="filter active" to="/login">Sign in</Link>
      </div>
    );
  }
  const saved = archive.data ?? [];
  return (
    <div className="ask-page">
      <section className="ask-page-chat" aria-label="Ask SITAM AI">
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
                {EXAMPLES.map((x) => <button key={x.q} type="button" onClick={() => { setScope(x.scope); go(x.q, x.scope); }}>{x.q}</button>)}
              </div>
            </div>
          )}
          <ChatMessages msgs={msgs} busy={busy} onOpenUrl={openUrl} />
          <div ref={end} />
        </div>
        <form className="ask-form" onSubmit={(e) => { e.preventDefault(); go(q); }}>
          {msgs.length > 0 && <button type="button" className="ask-new" onClick={() => { setMsgs([]); setOpenId(null); }} title="New chat" aria-label="New chat"><RotateCcw size={16} /></button>}
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={600} aria-label="Your question"
            placeholder={scope === 'auto' ? 'Ask a question…' : `Ask about ${SCOPES.find((s) => s.id === scope)?.label.toLowerCase()}…`} />
          <button type="submit" disabled={busy || q.trim().length < 3} aria-label="Send"><ArrowUp size={16} /></button>
        </form>
      </section>

      <aside className="ask-archive" aria-label="Your questions">
        <h2><History size={16} />Your questions{saved.length > 0 && <span className="ask-archive-n">{saved.length}</span>}</h2>
        {archive.isLoading ? <p className="small-note">Loading…</p>
          : archive.error ? <p className="small-note">The archive is not available right now.</p>
          : saved.length === 0 ? <p className="small-note">Questions you ask SITAM AI are saved here.</p>
          : (
            <ul>
              {saved.map((a) => (
                <li key={a.id} className={openId === a.id ? 'is-on' : ''}>
                  <button type="button" className="ask-archive-q" onClick={() => openSaved(a)}>
                    <strong>{a.question}</strong>
                    <small>{new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</small>
                  </button>
                  <button type="button" className="ask-icon" onClick={() => void remove(a.id)} title="Delete from archive" aria-label={`Delete “${a.question}”`}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          )}
      </aside>
    </div>
  );
}
