import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState, type FormEvent } from 'react';
import { Compass, ExternalLink, Mail, Pencil, Plus, Rocket, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoginRequiredDialog } from '@/components/login-required';
import { SearchBar } from '@/components/search-bar';
import { PageHero } from '@/components/page-hero';
import { TagInput } from '@/components/tag-input';
import { useAuth } from '@/lib/auth';
import {
  STARTUP_STAGE_LABEL, humanError, useMySubmissions, useProjects, useSubmitStartup, MODERATION_LABEL,
  useDeleteStartupPerson, useSaveStartupPerson, useStartupPeople,
  type Project, type StartupPerson, type StartupPersonKind, type StartupStage,
} from '@/lib/api';

// v23: Startup Hub — student startups (projects.kind = 'startup') by stage. New ones go to SITAM moderation first.
// v27: three tabs — Projects (the startups, filters Idea / Prototype / MVP), Mentors and Trackers (?tab=mentors|trackers).
type StartupTab = 'projects' | 'mentors' | 'trackers';
export const Route = createFileRoute('/startups')({
  head: () => ({ meta: [{ title: 'Startup Hub — SITAM SPACE · SDU' }] }),
  validateSearch: (s: Record<string, unknown>): { tab?: StartupTab } => (s['tab'] === 'mentors' || s['tab'] === 'trackers' ? { tab: s['tab'] } : {}),
  component: StartupHub,
});

const STAGES: StartupStage[] = ['idea', 'prototype', 'mvp'];

const STAGE_TONE: Record<StartupStage, string> = { idea: 'amber', prototype: 'violet', mvp: 'green' };

/** Same card as a lab card: icon + stage chip on top, name, two lines and technologies below. */
function StartupCard({ p }: { p: Project }) {
  const stage = (p.stage ?? 'idea') as StartupStage;
  const body = (
    <>
      <div className="labcard-top">
        <span className={`labcard-icon tone-${STAGE_TONE[stage]}`} aria-hidden><Rocket size={18} /></span>
        <span className={`labcard-count su-stage su-${stage}`}>{STARTUP_STAGE_LABEL[stage]}</span>
        {p.demo_url && <ExternalLink className="labcard-arrow" size={16} aria-hidden />}
      </div>
      <div className="labcard-bottom">
        <h3>{p.title}</h3>
        {p.summary && <p className="su-text" title={p.summary}>{p.summary}</p>}
        {p.tags.length > 0 && <div className="labcard-tags">{p.tags.slice(0, 5).map((t) => <span key={t}>{t}</span>)}</div>}
        {p.authors.length > 0 && <small className="su-by">{p.authors.join(', ')}</small>}
      </div>
    </>
  );
  return p.demo_url
    ? <a className="labcard" href={p.demo_url} target="_blank" rel="noopener noreferrer" aria-label={`${p.title} — open the project`}>{body}</a>
    : <div className="labcard is-static">{body}</div>;
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

/* ───────── v27: Mentors and Trackers ───────── */
const PEOPLE_TEXT: Record<StartupPersonKind, { one: string; many: string; intro: string; icon: typeof Users }> = {
  mentor: { one: 'mentor', many: 'Mentors', icon: Users, intro: 'Founders, investors and experts who share their experience: ask them about your idea, market or product.' },
  tracker: { one: 'tracker', many: 'Trackers', icon: Compass, intro: 'Trackers guide a startup team step by step: goals for each week, from the idea to a prototype and an MVP.' },
};
const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
/** "name@mail.com" → mailto:, "https://…" stays; anything else is rejected by the form. */
const contactHref = (v: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? `mailto:${v}` : v);

function PersonDialog({ kind, person, onClose }: { kind: StartupPersonKind; person: StartupPerson | null; onClose: () => void }) {
  const save = useSaveStartupPerson();
  const [expertise, setExpertise] = useState<string[]>(person?.expertise ?? []);
  const [error, setError] = useState('');
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim();
    if (s('full_name').length < 2) return setError('Enter the name.');
    const photo = s('photo_url');
    if (photo && !/^https:\/\//i.test(photo)) return setError('The photo link must start with https://');
    const contact = s('contact_url') ? contactHref(s('contact_url')) : '';
    if (contact && !/^(https:\/\/|mailto:)/i.test(contact)) return setError('Contact: an e-mail or a link that starts with https://');
    try {
      await save.mutateAsync({ id: person?.id, kind, full_name: s('full_name'), role: s('role'), bio: s('bio'), expertise, photo_url: photo, contact_url: contact });
      toast.success(person ? 'Saved' : `${PEOPLE_TEXT[kind].one[0]!.toUpperCase()}${PEOPLE_TEXT[kind].one.slice(1)} added`);
      onClose();
    } catch (err) { setError(humanError(err)); }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="hub-dialog wide">
        <DialogTitle>{person ? `Edit ${PEOPLE_TEXT[kind].one}` : `Add a ${PEOPLE_TEXT[kind].one}`}</DialogTitle>
        <DialogDescription>Shown to everyone on Startups → {PEOPLE_TEXT[kind].many}.</DialogDescription>
        <form className="partner-form auth-form" onSubmit={onSubmit} noValidate>
          <label>Full name<input name="full_name" maxLength={120} required defaultValue={person?.full_name ?? ''} placeholder="Marat Tolybay" /></label>
          <label>Role<input name="role" maxLength={160} defaultValue={person?.role ?? ''} placeholder="CEO, Activat VC" /></label>
          <label>About<textarea name="bio" rows={3} maxLength={1500} defaultValue={person?.bio ?? ''} placeholder="Experience and how they can help a team." /></label>
          <div className="form-field"><span className="form-label">Helps with</span>
            <TagInput label="Helps with" value={expertise} onChange={setExpertise} max={12} placeholder="Type and press Enter: Fundraising, Product…" />
          </div>
          <label>Contact (e-mail or link)<input name="contact_url" defaultValue={person?.contact_url?.replace(/^mailto:/i, '') ?? ''} placeholder="name@sdu.edu.kz or https://t.me/…" /></label>
          <label>Photo link<input name="photo_url" type="url" defaultValue={person?.photo_url ?? ''} placeholder="https://…" /></label>
          {error && <p className="form-alert" role="alert">{error}</p>}
          <div className="editor-actions su-actions">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="editor-save" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PeopleTab({ kind, query }: { kind: StartupPersonKind; query: string }) {
  const { caps } = useAuth();
  const people = useStartupPeople();
  const remove = useDeleteStartupPerson();
  const [editing, setEditing] = useState<StartupPerson | 'new' | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const t = PEOPLE_TEXT[kind];
  const needle = query.trim().toLowerCase();
  const list = (people.data ?? []).filter((p) => p.kind === kind
    && (!needle || `${p.full_name} ${p.role ?? ''} ${p.bio ?? ''} ${p.expertise.join(' ')}`.toLowerCase().includes(needle)));
  const del = async (id: string) => {
    if (confirm !== id) { setConfirm(id); return; }
    try { await remove.mutateAsync(id); toast.success('Removed'); } catch (err) { toast.error(humanError(err)); }
    setConfirm(null);
  };
  return (
    <>
      <div className="su-people-head">
        <p className="small-note">{t.intro}</p>
        {caps.isAdmin && <Button size="sm" variant="outline" onClick={() => setEditing('new')}><Plus />Add a {t.one}</Button>}
      </div>
      {people.isLoading ? <p className="small-note">Loading…</p> : people.error ? <p className="form-alert">{humanError(people.error)}</p> : list.length ? (
        <div className="labcard-grid su-grid">
          {list.map((p) => (
            <article key={p.id} className="labcard is-static su-person">
              <div className="su-person-top">
                <span className="su-person-photo" aria-hidden>{p.photo_url ? <img src={p.photo_url} alt="" referrerPolicy="no-referrer" /> : initialsOf(p.full_name)}</span>
                <div className="su-person-name"><h3>{p.full_name}</h3>{p.role && <small>{p.role}</small>}</div>
                {caps.isAdmin && (
                  <div className="su-person-tools">
                    <button type="button" className="ask-icon" onClick={() => setEditing(p)} aria-label={`Edit ${p.full_name}`} title="Edit"><Pencil size={15} /></button>
                    <button type="button" className={confirm === p.id ? 'ask-icon is-danger' : 'ask-icon'} onClick={() => void del(p.id)} onBlur={() => setConfirm(null)}
                      aria-label={confirm === p.id ? `Click again to remove ${p.full_name}` : `Remove ${p.full_name}`} title={confirm === p.id ? 'Click again to remove' : 'Remove'}><Trash2 size={15} /></button>
                  </div>
                )}
              </div>
              {p.bio && <p className="su-text">{p.bio}</p>}
              {p.expertise.length > 0 && <div className="labcard-tags">{p.expertise.map((x) => <span key={x}>{x}</span>)}</div>}
              {p.contact_url && (
                <a className="su-contact" href={p.contact_url} target={p.contact_url.startsWith('mailto:') ? undefined : '_blank'} rel="noopener noreferrer">
                  {p.contact_url.startsWith('mailto:') ? <Mail size={14} /> : <ExternalLink size={14} />}Contact
                </a>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="mini-empty"><t.icon size={20} /><p>{needle ? 'Nobody found.' : `No ${t.many.toLowerCase()} yet.`}</p></div>
      )}
      {editing && <PersonDialog kind={kind} person={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
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
  const { tab = 'projects' } = Route.useSearch();
  const navigate = Route.useNavigate();

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
      <PageHero
        title="Student startups"
        text="Ideas, prototypes and MVPs of SITAM students. Propose yours: it appears here after a short review."
        stats={[
          { label: 'Startups', value: projects.data ? all.length : undefined },
          { label: 'MVPs', value: projects.data ? all.filter((p) => p.stage === 'mvp').length : undefined },
        ]}
        action={(!user || canPropose) ? <Button onClick={() => (user ? setPropose(true) : setLogin(true))}><Plus />Propose a project</Button> : undefined}
      />

      <SearchBar value={q} onChange={setQ} placeholder={tab === 'projects' ? 'Search startups, technologies' : tab === 'mentors' ? 'Search mentors, topics' : 'Search trackers, topics'} />
      <Tabs value={tab} onValueChange={(v) => void navigate({ search: v === 'projects' ? {} : { tab: v as StartupTab }, replace: true })}>
        <TabsList className="manage-tabs">
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="mentors">Mentors</TabsTrigger>
          <TabsTrigger value="trackers">Trackers</TabsTrigger>
        </TabsList>
        <TabsContent value="projects">
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

          <div className="filter-list su-filters" role="tablist" aria-label="Stage">
            {(['all', ...STAGES] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={stage === s} className={stage === s ? 'filter active' : 'filter'} onClick={() => setStage(s)}>
                {s === 'all' ? 'All' : STARTUP_STAGE_LABEL[s]}
              </button>
            ))}
          </div>

          {projects.isLoading ? <p className="small-note">Loading…</p> : list.length ? (
            <div className="labcard-grid su-grid">{list.map((p) => <StartupCard key={p.id} p={p} />)}</div>
          ) : (
            <div className="mini-empty"><Rocket size={20} /><p>{all.length ? 'No startups for this filter.' : 'No startups yet. Be the first to propose one.'}</p></div>
          )}
        </TabsContent>
        <TabsContent value="mentors"><PeopleTab kind="mentor" query={q} /></TabsContent>
        <TabsContent value="trackers"><PeopleTab kind="tracker" query={q} /></TabsContent>
      </Tabs>

      <ProposeDialog open={propose} onOpenChange={setPropose} />
      <LoginRequiredDialog open={login} onClose={() => setLogin(false)} />
    </main>
  );
}
