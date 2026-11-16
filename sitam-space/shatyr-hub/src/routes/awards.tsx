// Awards & Wall of Fame (v34): the spotlight of the month (Student of the Month, Top Research Lab,
// Research Topic of the Month), the Weekly Wins & News feed with category filters, and the Hall of Fame
// (earlier spotlights). Everyone reads; only the coordinator adds, edits and removes entries.
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState, type FormEvent } from 'react';
import { ArrowUpRight, Award as AwardIcon, CalendarDays, ExternalLink, FlaskConical, ImagePlus, Lightbulb, Pencil, Plus, Trash2, Trophy, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PageHero } from '@/components/page-hero';
import { TagInput } from '@/components/tag-input';
import { useAuth } from '@/lib/auth';
import {
  humanError, sitamDay, uploadAwardPhoto, useAwards, useDeleteAward, useLabs, useSaveAward,
  type Award, type AwardKind, type WinCategory,
} from '@/lib/api';

export const Route = createFileRoute('/awards')({
  head: () => ({ meta: [{ title: 'Awards & Wall of Fame — SITAM SPACE · SDU' }] }),
  component: AwardsPage,
});

type SpotKind = Exclude<AwardKind, 'win'>;
const SPOT: Record<SpotKind, { label: string; icon: typeof Trophy; empty: string }> = {
  student: { label: 'Student of the Month', icon: AwardIcon, empty: 'The student of the month will be announced here.' },
  lab: { label: 'Top Research Lab', icon: FlaskConical, empty: 'The lab of the month will be announced here.' },
  topic: { label: 'Research Topic of the Month', icon: Lightbulb, empty: 'The research topic of the month will be announced here.' },
};
const CATS: { id: WinCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'hackathon', label: 'Hackathons' }, { id: 'research', label: 'Research' },
  { id: 'project', label: 'Projects' }, { id: 'news', label: 'News' },
];
const CAT_LABEL: Record<WinCategory, string> = { hackathon: 'Hackathon', research: 'Research', project: 'Project', news: 'News' };

const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const monthLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

/* ───────────── add / edit ───────────── */
const FORM_TEXT: Record<AwardKind, { title: string; titlePh: string; sub?: string; subPh?: string; body: string; bodyPh: string }> = {
  student: { title: 'Student name', titlePh: 'Aruzhan Serikkyzy', sub: 'Major / direction', subPh: 'Computer Science, 3rd year', body: 'Why they are awarded', bodyPh: 'Won first place at … and led the … project.' },
  lab: { title: 'Lab', titlePh: '', sub: 'Key project of the month', subPh: 'Kazakh speech recognition demo', body: 'What the lab achieved', bodyPh: 'Released …, published …' },
  topic: { title: 'Research topic', titlePh: 'Low-resource Kazakh NLP', sub: 'Authors', subPh: 'A. Bekova, D. Nur', body: 'Why it matters', bodyPh: 'One or two sentences about the benefit.' },
  win: { title: 'Headline', titlePh: 'SITAM team wins DATA CHALLENGE ’26', body: 'Text', bodyPh: 'What happened, who took part, the result.' },
};

function AwardDialog({ kind, award, onClose }: { kind: AwardKind; award: Award | null; onClose: () => void }) {
  const { user } = useAuth();
  const labs = useLabs();
  const save = useSaveAward();
  const t = FORM_TEXT[kind];
  const [tags, setTags] = useState<string[]>(award?.tags ?? []);
  const [photo, setPhoto] = useState(award?.photo_url ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const labList = (labs.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

  async function pick(file: File | undefined) {
    if (!file || !user) return;
    setBusy(true); setError('');
    try { setPhoto(await uploadAwardPhoto(user.id, file)); } catch (e) { setError(humanError(e)); } finally { setBusy(false); }
  }
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim();
    const labId = s('lab_id');
    const lab = labList.find((l) => l.id === labId);
    const title = kind === 'lab' ? lab?.name ?? '' : s('title');
    if (kind === 'lab' && !lab) return setError('Choose the lab.');
    if (title.length < 2) return setError(`Enter the ${t.title.toLowerCase()}.`);
    const link = s('link_url');
    if (link && !/^https:\/\//i.test(link)) return setError('The link must start with https://');
    try {
      await save.mutateAsync({
        id: award?.id, kind, category: kind === 'win' ? (s('category') as WinCategory) : null,
        title, subtitle: s('subtitle'), body: s('body'), lab_id: labId || null, photo_url: photo, link_url: link, tags,
        happened_on: s('happened_on') || sitamDay(),
      });
      toast.success(award ? 'Saved' : 'Published');
      onClose();
    } catch (err) { setError(humanError(err)); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="hub-dialog wide">
        <DialogTitle>{award ? 'Edit' : 'Add'} · {kind === 'win' ? 'Win or news' : SPOT[kind].label}</DialogTitle>
        <DialogDescription>Shown to everyone on Awards & Wall of Fame.{kind === 'student' ? ' Publish a student’s name and photo only with their consent.' : ''}</DialogDescription>
        <form className="partner-form auth-form" onSubmit={onSubmit} noValidate>
          {kind === 'win' && (
            <label>Category
              <select name="category" defaultValue={award?.category ?? 'hackathon'}>
                {CATS.filter((c) => c.id !== 'all').map((c) => <option key={c.id} value={c.id}>{CAT_LABEL[c.id as WinCategory]}</option>)}
              </select>
            </label>
          )}
          {kind === 'lab' || kind === 'win' ? (
            <label>{kind === 'lab' ? 'Lab' : 'Lab (optional)'}
              <select name="lab_id" defaultValue={award?.lab_id ?? ''}>
                <option value="">{kind === 'lab' ? 'Choose a lab' : 'No lab'}</option>
                {labList.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          ) : null}
          {kind !== 'lab' && <label>{t.title}<input name="title" maxLength={200} required defaultValue={award?.title ?? ''} placeholder={t.titlePh} /></label>}
          {t.sub && <label>{t.sub}<input name="subtitle" maxLength={200} defaultValue={award?.subtitle ?? ''} placeholder={t.subPh} /></label>}
          <label>{t.body}<textarea name="body" rows={4} maxLength={2000} defaultValue={award?.body ?? ''} placeholder={t.bodyPh} /></label>
          <label>Date<input name="happened_on" type="date" defaultValue={award?.happened_on ?? sitamDay()} /></label>
          {(kind === 'student' || kind === 'win') && (
            <div className="form-field"><span className="form-label">{kind === 'student' ? 'Photo' : 'Picture (optional)'}</span>
              <div className="aw-photo-pick">
                {photo ? <img src={photo} alt="" /> : <span className="aw-photo-empty" aria-hidden><ImagePlus size={18} /></span>}
                <label className="btn-like">
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
                  {busy ? 'Uploading…' : photo ? 'Replace' : 'Upload'}
                </label>
                {photo && <button type="button" className="ask-icon" aria-label="Remove the picture" onClick={() => setPhoto('')}><X size={15} /></button>}
              </div>
            </div>
          )}
          {kind !== 'student' && (
            <div className="form-field"><span className="form-label">Tags</span>
              <TagInput label="Tags" value={tags} onChange={setTags} max={8} placeholder="Type and press Enter: NLP, Hackathon…" />
            </div>
          )}
          <label>Link (optional)<input name="link_url" defaultValue={award?.link_url ?? ''} placeholder="https://…" /></label>
          {error && <p className="form-alert" role="alert">{error}</p>}
          <div className="editor-actions su-actions">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="editor-save" disabled={save.isPending || busy}>{save.isPending ? 'Saving…' : 'Publish'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── cards ───────────── */
function Tools({ a, onEdit }: { a: Award; onEdit: (a: Award) => void }) {
  const remove = useDeleteAward();
  const [confirm, setConfirm] = useState(false);
  const del = async () => {
    if (!confirm) { setConfirm(true); return; }
    try { await remove.mutateAsync(a.id); toast.success('Removed'); } catch (err) { toast.error(humanError(err)); }
    setConfirm(false);
  };
  return (
    <div className="aw-tools">
      <button type="button" className="ask-icon" onClick={() => onEdit(a)} aria-label={`Edit ${a.title}`} title="Edit"><Pencil size={15} /></button>
      <button type="button" className={confirm ? 'ask-icon is-danger' : 'ask-icon'} onClick={() => void del()} onBlur={() => setConfirm(false)}
        aria-label={confirm ? `Click again to remove ${a.title}` : `Remove ${a.title}`} title={confirm ? 'Click again to remove' : 'Remove'}><Trash2 size={15} /></button>
    </div>
  );
}

function SpotlightCard({ kind, a, admin, onAdd, onEdit, labSlug }: { kind: SpotKind; a?: Award | undefined; admin: boolean; onAdd: () => void; onEdit: (a: Award) => void; labSlug?: string | undefined }) {
  const s = SPOT[kind];
  if (!a) {
    return (
      <article className={`aw-spot aw-${kind} is-empty`}>
        <span className="aw-spot-badge"><s.icon size={14} />{s.label}</span>
        <p className="aw-spot-empty">{s.empty}</p>
        {admin && <Button size="sm" variant="outline" onClick={onAdd}><Plus />Choose</Button>}
      </article>
    );
  }
  return (
    <article className={`aw-spot aw-${kind}`}>
      <div className="aw-spot-head">
        <span className="aw-spot-badge"><s.icon size={14} />{s.label}</span>
        {admin && <Tools a={a} onEdit={onEdit} />}
      </div>
      {kind === 'student' && (
        <div className="aw-person">
          <span className="aw-avatar" aria-hidden>{a.photo_url ? <img src={a.photo_url} alt="" /> : initialsOf(a.title)}</span>
          <div><h3>{a.title}</h3>{a.subtitle && <small>{a.subtitle}</small>}</div>
        </div>
      )}
      {kind !== 'student' && <h3>{a.title}</h3>}
      {kind === 'lab' && a.subtitle && <p className="aw-key"><span>Key project</span>{a.subtitle}</p>}
      {kind === 'topic' && a.subtitle && <p className="aw-key"><span>Authors</span>{a.subtitle}</p>}
      {a.body && <p className="aw-text">{a.body}</p>}
      {a.tags.length > 0 && <div className="labcard-tags">{a.tags.map((x) => <span key={x}>{x}</span>)}</div>}
      <div className="aw-spot-foot">
        <span className="aw-date"><CalendarDays size={13} />{monthLabel(a.happened_on)}</span>
        {kind === 'lab' && labSlug
          ? <Link to="/labs/$slug" params={{ slug: labSlug }} className="aw-more">Open the lab<ArrowUpRight size={14} /></Link>
          : a.link_url ? <a href={a.link_url} target="_blank" rel="noopener noreferrer" className="aw-more">Read more<ExternalLink size={13} /></a> : null}
      </div>
    </article>
  );
}

function WinCard({ a, admin, onEdit, labName, labSlug }: { a: Award; admin: boolean; onEdit: (a: Award) => void; labName?: string | undefined; labSlug?: string | undefined }) {
  const cat = a.category ?? 'news';
  return (
    <article className="aw-win">
      {a.photo_url && <img className="aw-win-img" src={a.photo_url} alt="" loading="lazy" />}
      <div className="aw-win-body">
        <div className="aw-win-top">
          <span className={`aw-cat cat-${cat}`}>{CAT_LABEL[cat]}</span>
          <span className="aw-date"><CalendarDays size={13} />{dayLabel(a.happened_on)}</span>
          {admin && <Tools a={a} onEdit={onEdit} />}
        </div>
        <h3>{a.title}</h3>
        {a.body && <p className="aw-text">{a.body}</p>}
        {(a.tags.length > 0 || labName) && (
          <div className="labcard-tags">
            {labName && labSlug && <Link to="/labs/$slug" params={{ slug: labSlug }} className="aw-lab-tag"><FlaskConical size={12} />{labName}</Link>}
            {a.tags.map((x) => <span key={x}>{x}</span>)}
          </div>
        )}
        {a.link_url && <a href={a.link_url} target="_blank" rel="noopener noreferrer" className="aw-more">Read more<ExternalLink size={13} /></a>}
      </div>
    </article>
  );
}

/* ───────────── page ───────────── */
function AwardsPage() {
  const { caps } = useAuth();
  const admin = !!caps.isAdmin;
  const awards = useAwards();
  const labs = useLabs();
  const [cat, setCat] = useState<WinCategory | 'all'>('all');
  const [editing, setEditing] = useState<{ kind: AwardKind; award: Award | null } | null>(null);
  const labById = useMemo(() => new Map((labs.data ?? []).map((l) => [l.id, l])), [labs.data]);

  const all = awards.data ?? [];
  const latest = (k: SpotKind) => all.find((a) => a.kind === k);
  const current = { student: latest('student'), lab: latest('lab'), topic: latest('topic') };
  const spotMonth = [current.student, current.lab, current.topic].filter(Boolean).map((a) => a!.happened_on).sort().pop();
  const hall = all.filter((a) => a.kind !== 'win' && a.id !== current.student?.id && a.id !== current.lab?.id && a.id !== current.topic?.id);
  const wins = all.filter((a) => a.kind === 'win');
  const shown = cat === 'all' ? wins : wins.filter((a) => a.category === cat);
  const year = String(new Date().getFullYear());

  return (
    <main className="container content-page awards-page">
      <PageHero
        title="Awards & Wall of Fame"
        text="Students, labs and research that made SITAM proud — the spotlight of the month and the latest wins."
        stats={[
          { label: `Wins in ${year}`, value: awards.isLoading ? undefined : wins.filter((a) => a.happened_on.startsWith(year)).length },
          { label: 'Spotlights', value: awards.isLoading ? undefined : all.length - wins.length },
        ]}
      />
      {awards.error && <p className="form-alert">{humanError(awards.error)}</p>}

      <section className="aw-section" aria-labelledby="aw-spot-title">
        <div className="aw-section-head">
          <h2 id="aw-spot-title"><Trophy size={20} />Spotlight{spotMonth ? ` · ${monthLabel(spotMonth)}` : ''}</h2>
        </div>
        <div className="aw-spot-grid">
          {(['student', 'lab', 'topic'] as SpotKind[]).map((k) => (
            <SpotlightCard key={k} kind={k} a={current[k]} admin={admin} labSlug={current[k]?.lab_id ? labById.get(current[k]!.lab_id!)?.slug : undefined}
              onAdd={() => setEditing({ kind: k, award: null })} onEdit={(a) => setEditing({ kind: k, award: a })} />
          ))}
        </div>
        {admin && (current.student || current.lab || current.topic) && (
          <div className="aw-admin-row">
            <span className="small-note">New month:</span>
            {(['student', 'lab', 'topic'] as SpotKind[]).map((k) => (
              <Button key={k} size="sm" variant="ghost" onClick={() => setEditing({ kind: k, award: null })}><Plus />{SPOT[k].label}</Button>
            ))}
          </div>
        )}
      </section>

      <section className="aw-section" aria-labelledby="aw-wins-title">
        <div className="aw-section-head">
          <h2 id="aw-wins-title">Weekly Wins & News</h2>
          {admin && <Button size="sm" variant="outline" onClick={() => setEditing({ kind: 'win', award: null })}><Plus />Add a win or news</Button>}
        </div>
        <div className="filter-row aw-filters" role="group" aria-label="Category">
          {CATS.map((c) => (
            <button key={c.id} type="button" className={cat === c.id ? 'filter active' : 'filter'} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>
          ))}
        </div>
        {awards.isLoading ? <p className="small-note">Loading…</p> : shown.length ? (
          <div className="aw-win-grid">
            {shown.map((a) => {
              const lab = a.lab_id ? labById.get(a.lab_id) : undefined;
              return <WinCard key={a.id} a={a} admin={admin} labName={lab?.name} labSlug={lab?.slug} onEdit={(x) => setEditing({ kind: 'win', award: x })} />;
            })}
          </div>
        ) : (
          <div className="mini-empty"><Trophy size={20} /><p>{cat === 'all' ? 'No wins or news yet.' : `No ${CATS.find((c) => c.id === cat)!.label.toLowerCase()} yet.`}</p></div>
        )}
      </section>

      {hall.length > 0 && (
        <section className="aw-section" aria-labelledby="aw-hall-title">
          <div className="aw-section-head"><h2 id="aw-hall-title">Hall of Fame</h2></div>
          <ul className="aw-hall">
            {hall.map((a) => {
              const s = SPOT[a.kind as SpotKind];
              return (
                <li key={a.id}>
                  <span className={`aw-hall-icon aw-${a.kind}`} aria-hidden><s.icon size={15} /></span>
                  <div><strong>{a.title}</strong><small>{s.label} · {monthLabel(a.happened_on)}{a.subtitle ? ` · ${a.subtitle}` : ''}</small></div>
                  {admin && <Tools a={a} onEdit={(x) => setEditing({ kind: x.kind, award: x })} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {editing && <AwardDialog kind={editing.kind} award={editing.award} onClose={() => setEditing(null)} />}
    </main>
  );
}
