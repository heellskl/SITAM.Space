import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState, type FormEvent } from 'react';
import { ExternalLink, Plus, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { LoginRequiredDialog } from '@/components/login-required';
import { SearchBar } from '@/components/search-bar';
import { TagInput } from '@/components/tag-input';
import { useAuth } from '@/lib/auth';
import {
  STARTUP_STAGE_LABEL, humanError, useMySubmissions, useProjects, useSubmitStartup, MODERATION_LABEL,
  type Project, type StartupStage,
} from '@/lib/api';

// v23: Startup Hub — student startups (projects.kind = 'startup') by stage. New ones go to SITAM moderation first.
export const Route = createFileRoute('/startups')({
  head: () => ({ meta: [{ title: 'Startup Hub — SITAM SPACE · SDU' }] }),
  component: StartupHub,
});

const STAGES: StartupStage[] = ['idea', 'prototype', 'mvp'];

function StartupCard({ p }: { p: Project }) {
  const stage = (p.stage ?? 'idea') as StartupStage;
  return (
    <article className="su-card">
      <div className="su-card-top">
        <h3>{p.title}</h3>
        <span className={`su-stage su-${stage}`}>{STARTUP_STAGE_LABEL[stage]}</span>
      </div>
      {p.summary && <p className="su-text">{p.summary}</p>}
      {p.tags.length > 0 && <div className="su-tags">{p.tags.slice(0, 6).map((t) => <span key={t}>{t}</span>)}</div>}
      <div className="su-foot">
        <small>{p.authors.join(', ')}</small>
        {p.demo_url && <Button asChild size="sm" variant="outline"><a href={p.demo_url} target="_blank" rel="noopener noreferrer">Open project<ExternalLink /></a></Button>}
      </div>
    </article>
  );
}

function ProposeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const submit = useSubmitStartup();
  const [stage, setStage] = useState<StartupStage>('idea');
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState('');
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim();
    if (s('title').length < 2) return setError('Give the project a name.');
    if (s('summary').length < 20) return setError('Describe the idea and the solution (20+ characters).');
    const url = s('demo_url');
    if (url && !/^https:\/\//i.test(url)) return setError('The link must start with https://');
    try {
      const row = await submit.mutateAsync({ title: s('title'), summary: s('summary'), demo_url: url, stage, tags });
      toast.success(row.moderation === 'approved' ? 'Project published' : 'Sent for review. The SITAM coordinator publishes new projects.');
      onOpenChange(false); setTags([]); setStage('idea'); setError('');
    } catch (err) { setError(humanError(err)); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="hub-dialog wide">
        <span className="eyebrow">Startup Hub</span>
        <DialogTitle>Propose a project</DialogTitle>
        <DialogDescription>After a short review by the SITAM coordinator it appears in the Startup Hub.</DialogDescription>
        <form className="partner-form auth-form" onSubmit={onSubmit} noValidate>
          <label>Project name<input name="title" maxLength={120} required placeholder="CampusEats" /></label>
          <label>Idea and solution<textarea name="summary" rows={4} maxLength={1000} required placeholder="What problem it solves and how." /></label>
          <label>Demo or website link<input name="demo_url" type="url" placeholder="https://…" /></label>
          <div className="form-field"><span className="form-label">Stage</span>
            <div className="su-stage-pick" role="radiogroup" aria-label="Stage">
              {STAGES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={stage === s} className={stage === s ? `is-on su-${s}` : ''} onClick={() => setStage(s)}>{STARTUP_STAGE_LABEL[s]}</button>
              ))}
            </div>
          </div>
          <div className="form-field"><span className="form-label">Technologies</span>
            <TagInput label="Technologies" value={tags} onChange={setTags} max={8} placeholder="Type and press Enter: React, Python…" />
          </div>
          {error && <p className="form-alert" role="alert">{error}</p>}
          <div className="editor-actions su-actions">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="editor-save" disabled={submit.isPending}>{submit.isPending ? 'Sending…' : 'Send for review'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StartupHub() {
  const { user, caps } = useAuth();
  const projects = useProjects();
  const mine = useMySubmissions(user?.id);
  const [stage, setStage] = useState<StartupStage | 'all'>('all');
  const [q, setQ] = useState('');
  const [propose, setPropose] = useState(false);
  const [login, setLogin] = useState(false);

  const all = useMemo(() => (projects.data ?? []).filter((p) => p.kind === 'startup'), [projects.data]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((p) => (stage === 'all' || (p.stage ?? 'idea') === stage)
      && (!needle || `${p.title} ${p.summary ?? ''} ${p.tags.join(' ')}`.toLowerCase().includes(needle)));
  }, [all, stage, q]);
  const myPending = (mine.data ?? []).filter((p) => p.kind === 'startup' && p.moderation !== 'approved');
  const canPropose = !!user && !caps.isPartner && !caps.isAlumni;

  return (
    <main className="container content-page">
      <section className="su-hero">
        <div>
          <span className="eyebrow">Startup Hub</span>
          <h1>Student startups and innovation at SITAM</h1>
          <p>Explore our students' projects, prototypes and MVPs, or propose your own idea.</p>
        </div>
        {(!user || canPropose) && (
          <Button onClick={() => (user ? setPropose(true) : setLogin(true))}><Plus />Propose a project</Button>
        )}
      </section>

      {myPending.length > 0 && (
        <section className="panel su-mine">
          <h3 className="panel-title">Your proposals</h3>
          <ul className="rows">
            {myPending.map((p) => (
              <li key={p.id}><div><strong>{p.title}</strong><small>{p.moderation_note ?? (p.moderation === 'pending' ? 'Waiting for the SITAM coordinator' : '')}</small></div>
                <span className={`pill ${p.moderation === 'rejected' ? 'pill-done' : 'pill-wip'}`}>{MODERATION_LABEL[p.moderation]}</span></li>
            ))}
          </ul>
        </section>
      )}

      <div className="su-bar">
        <div className="su-filters" role="tablist" aria-label="Stage">
          {(['all', ...STAGES] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={stage === s} className={stage === s ? 'is-on' : ''} onClick={() => setStage(s)}>
              {s === 'all' ? 'All' : STARTUP_STAGE_LABEL[s]}
            </button>
          ))}
        </div>
        <SearchBar value={q} onChange={setQ} placeholder="Search startups, technologies" />
      </div>

      {projects.isLoading ? <p className="small-note">Loading…</p> : list.length ? (
        <div className="su-grid">{list.map((p) => <StartupCard key={p.id} p={p} />)}</div>
      ) : (
        <div className="mini-empty"><Rocket size={20} /><p>{all.length ? 'No startups for this filter.' : 'No startups yet. Be the first to propose one.'}</p></div>
      )}

      <ProposeDialog open={propose} onOpenChange={setPropose} />
      <LoginRequiredDialog open={login} onClose={() => setLogin(false)} />
    </main>
  );
}
