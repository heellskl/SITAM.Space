import { useMemo, useState, type FormEvent } from 'react';
import { gmailCompose } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import { Building2, CalendarPlus, CheckCircle2, ClipboardCheck, ExternalLink, FileText, Inbox, Mail, Pencil, Phone, Plus, ShieldCheck, Star, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  CATEGORY_LABEL, INDUSTRIAL_LABEL, KIND_LABEL, MODERATION_LABEL, STATUS_LABEL, STATUS_TONE, formatDate, hostNames, humanError, opportunityLabel, signedUrl,
  useAdminAction, useBriefs, useCompanies, useDeleteOpportunity, useInbox, useManagedOpportunities, useModerate, useModerationQueue, useOpportunities, usePendingTeachers, useProjects,
  useReviewApplication, useSaveEvent, useSaveOpportunity, useUpdateBrief,
  type ApplicationStatus, type InboxItem, type IndustrialType, type ModerationItem, type Opportunity, type OpportunityCategory, type PartnerRequest,
} from '@/lib/api';
import { ROLE_LABEL, useAuth, type Role } from '@/lib/auth';
import { TagInput } from '@/components/tag-input';

/* ═════════════════════ Applications inbox ═════════════════════ */

const REVIEW_ACTIONS: { status: Exclude<ApplicationStatus, 'submitted' | 'withdrawn'>; label: string }[] = [
  { status: 'in_review', label: 'In review' },
  { status: 'shortlisted', label: 'Shortlist' },
  { status: 'accepted', label: 'Accept' },
  { status: 'rejected', label: 'Decline' },
];

export function InboxPanel() {
  const inbox = useInbox(true);
  const review = useReviewApplication();
  const [group, setGroup] = useState('all');
  const [status, setStatus] = useState<'open' | ApplicationStatus>('open');
  const [open, setOpen] = useState<InboxItem | null>(null);
  const [note, setNote] = useState('');

  const items = inbox.data ?? [];
  const groups = useMemo(() => Array.from(new Set(items.map((i) => i.opportunity_title))).sort(), [items]);
  const shown = items.filter(
    (i) => (group === 'all' || i.opportunity_title === group) && (status === 'open' ? ['submitted', 'in_review', 'shortlisted'].includes(i.status) : i.status === status),
  );

  async function openCv(item: InboxItem) {
    try {
      window.open(await signedUrl(item.cv_path), '_blank', 'noopener');
    } catch (e) {
      toast.error(humanError(e));
    }
  }

  function act(item: InboxItem, s: (typeof REVIEW_ACTIONS)[number]['status']) {
    review.mutate(
      { id: item.id, status: s, ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onSuccess: () => {
          toast.success(`${item.applicant_name}: ${STATUS_LABEL[s]}`, { description: s === 'accepted' && item.category !== 'industrial' ? 'Added to the lab team.' : item.opportunity_title });
          setOpen(null);
          setNote('');
        },
        onError: (e) => toast.error(humanError(e)),
      },
    );
  }

  return (
    <section className="panel">
      <h3 className="panel-title"><Inbox size={15} />Applications</h3>
      <p className="small-note mb-3">Only applications to opportunities you posted or host (your lab, company, project or your own name). Applicants see status changes in their profile.</p>
      <div className="lab-controls">
        <select className="filter-select" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Opportunity">
          <option value="all">All opportunities</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <div className="filter-list">
          {(['open', 'accepted', 'rejected'] as const).map((s) => (
            <Button key={s} variant="ghost" className={status === s ? 'filter active' : 'filter'} onClick={() => setStatus(s)}>{s === 'open' ? 'Open' : STATUS_LABEL[s]}</Button>
          ))}
        </div>
      </div>
      {inbox.error && <p className="form-alert">{humanError(inbox.error)}</p>}
      {inbox.isLoading ? <p className="small-note">Loading…</p> : shown.length === 0 ? (
        <div className="mini-empty"><Inbox size={20} /><p>No applications here yet.</p></div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Applicant</th><th>Opportunity</th><th>Received</th><th>Status</th><th /></tr></thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{i.applicant_name || i.applicant_email}</strong>
                    <small className="block">{ROLE_LABEL[i.applicant_role as Role] ?? i.applicant_role}{i.applicant_course ? ` · ${i.applicant_course} ${i.applicant_role === 'phd' ? 'year' : 'course'}` : ''}{i.applicant_major ? ` · ${i.applicant_major}` : ''}</small>
                    <small className="block contact-line"><a href={gmailCompose(i.applicant_email)} target="_blank" rel="noopener noreferrer">{i.applicant_email}</a>{i.applicant_phone && <> · <a href={`tel:${i.applicant_phone.replace(/\s/g, '')}`}>{i.applicant_phone}</a></>}</small>
                  </td>
                  <td><span className="eyebrow">{CATEGORY_LABEL[i.category]}</span>{i.opportunity_title}<small className="block">{i.hosts}</small></td>
                  <td>{formatDate(i.created_at)}</td>
                  <td><span className={`pill pill-${STATUS_TONE[i.status]}`}>{STATUS_LABEL[i.status]}</span></td>
                  <td className="row-actions">
                    <Button size="sm" variant="outline" onClick={() => openCv(i)}><FileText />CV</Button>
                    <Button size="sm" onClick={() => { setOpen(i); setNote(i.reviewer_note ?? ''); }}>Review</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="hub-dialog">
          {open && (
            <>
              <span className="eyebrow">{open.hosts} · {open.opportunity_title}</span>
              <DialogTitle>{open.applicant_name}</DialogTitle>
              <DialogDescription>
                {ROLE_LABEL[open.applicant_role as Role] ?? open.applicant_role}
                {open.applicant_course ? ` · ${open.applicant_course} ${open.applicant_role === 'phd' ? 'year' : 'course'}` : ''}
                {open.applicant_major ? ` · ${open.applicant_major}` : ''}
                {open.applicant_department ? ` · ${open.applicant_department}` : ''}
              </DialogDescription>
              <div className="contact-card">
                <a href={gmailCompose(open.applicant_email)} target="_blank" rel="noopener noreferrer"><Mail size={14} /> {open.applicant_email}</a>
                {open.applicant_phone ? <a href={`tel:${open.applicant_phone.replace(/\s/g, '')}`}><Phone size={14} /> {open.applicant_phone}</a> : <span className="small-note">No phone given</span>}
              </div>
              <div className="modal-info"><span>Motivation</span><p className="lab-text">{open.note}</p></div>
              <Button variant="outline" onClick={() => openCv(open)}><FileText />Open CV (PDF)</Button>
              <label className="partner-form-label">Note to the applicant (optional)
                <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Come to the lab on Friday at 15:00." />
              </label>
              <div className="dialog-actions wrap">
                {REVIEW_ACTIONS.map((a) => (
                  <Button key={a.status} variant={a.status === 'accepted' ? 'default' : a.status === 'rejected' ? 'ghost' : 'outline'} disabled={review.isPending} onClick={() => act(open, a.status)}>
                    {a.status === 'accepted' ? <CheckCircle2 /> : a.status === 'rejected' ? <X /> : a.status === 'shortlisted' ? <Star /> : null}
                    {a.label}
                  </Button>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ═════════════════════ Host picker (labs / companies / projects) ═════════════════════ */

export type HostSel = { labs: string[]; companies: string[]; projects: string[]; me?: boolean };
type HostList = 'labs' | 'companies' | 'projects';

function useMyHosts() {
  const { caps, profile } = useAuth();
  const projects = useProjects();
  const labIds = new Set(caps.managedLabs.map((l) => l.id));
  return {
    labs: caps.managedLabs.map((l) => ({ id: l.id, name: l.name })),
    companies: caps.companies.filter((c) => c.verified).map((c) => ({ id: c.id, name: c.name })),
    projects: (projects.data ?? []).filter((p) => p.lab_id && labIds.has(p.lab_id)).map((p) => ({ id: p.id, name: `${p.title} (${p.labs?.name ?? ''})` })),
    unverified: caps.companies.filter((c) => !c.verified),
    /** Verified professors (and admins) post in their own name: shown as "Prof. Name" on Industry → Opportunities. */
    me: caps.isStaff ? `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || 'Me' : null,
  };
}

function HostPicker({ value, onChange }: { value: HostSel; onChange: (v: HostSel) => void }) {
  const h = useMyHosts();
  const toggle = (key: HostList, id: string) =>
    onChange({ ...value, [key]: value[key].includes(id) ? value[key].filter((x) => x !== id) : [...value[key], id] });
  const group = (key: HostList, title: string, items: { id: string; name: string }[]) =>
    items.length > 0 && (
      <div>
        <span className="sub-title">{title}</span>
        <div className="check-row">
          {items.map((i) => (
            <label key={i.id} className="check"><input type="checkbox" checked={value[key].includes(i.id)} onChange={() => toggle(key, i.id)} />{i.name}</label>
          ))}
        </div>
      </div>
    );
  return (
    <fieldset className="host-picker">
      <legend>Hosted by (choose one or more)</legend>
      {h.me && (
        <div>
          <span className="sub-title">In my name</span>
          <div className="check-row"><label className="check"><input type="checkbox" checked={!!value.me} onChange={() => onChange({ ...value, me: !value.me })} />{h.me}</label></div>
        </div>
      )}
      {group('labs', 'Labs', h.labs)}
      {group('companies', 'Companies', h.companies)}
      {group('projects', 'Lab projects', h.projects)}
      {h.unverified.length > 0 && <p className="small-note">{h.unverified.map((c) => c.name).join(', ')}: waiting for SITAM verification.</p>}
    </fieldset>
  );
}

/* ═════════════════════ Listings ═════════════════════ */

export function ListingsPanel() {
  const { user, caps } = useAuth();
  const hosts = useMyHosts();
  const canPost = hosts.labs.length + hosts.companies.length > 0 || !!hosts.me || caps.isAdmin;
  const listings = useManagedOpportunities(!!user, user?.id);
  const del = useDeleteOpportunity();
  const [editing, setEditing] = useState<Opportunity | 'new' | null>(null);

  const mine = (listings.data ?? []).filter(
    (o) =>
      caps.isAdmin ||
      o.created_by === user?.id ||
      o.opportunity_hosts.some((h) => h.person_id === user?.id) ||
      o.opportunity_hosts.some((h) => hosts.labs.some((l) => l.id === h.lab_id) || hosts.companies.some((c) => c.id === h.company_id) || hosts.projects.some((p) => p.id === h.project_id)),
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <h3 className="panel-title"><Building2 size={15} />Your opportunities</h3>
        {canPost && <Button size="sm" onClick={() => setEditing('new')}><Plus />New opportunity</Button>}
      </div>
      {!canPost && <p className="small-note mb-3">{hosts.unverified.length ? 'Your company is waiting for verification by the SITAM office.' : caps.isTeacher ? 'You can post opportunities in your own name once the SITAM office verifies your professor account.' : 'Opportunities are posted by lab heads, verified professors and verified companies.'}</p>}
      {mine.length === 0 ? <div className="mini-empty"><Building2 size={20} /><p>No opportunities yet.</p></div> : (
        <ul className="rows">
          {mine.map((o) => (
            <li key={o.id}>
              <div>
                <strong>{o.title}</strong>
                <small>{opportunityLabel(o)} · {hostNames(o.opportunity_hosts)}{o.deadline ? ` · until ${formatDate(o.deadline)}` : ''}</small>
              </div>
              <span className="row-actions">
                <span className={`pill ${o.is_active ? 'pill-live' : 'pill-done'}`}>{o.is_active ? 'Published' : 'Hidden'}</span>
                <Button size="sm" variant="ghost" onClick={() => setEditing(o)} aria-label="Edit"><Pencil /></Button>
                <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => del.mutate(o.id, { onSuccess: () => toast('Deleted'), onError: (e) => toast.error(humanError(e)) })}><Trash2 /></Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing && <ListingDialog opp={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** Used in Manage, on lab pages (preset = that lab) and on a professor's profile (preset = in my name). */
export function ListingDialog({ opp, onClose, preset, defaultCategory }: { opp: Opportunity | null; onClose: () => void; preset?: HostSel; defaultCategory?: OpportunityCategory }) {
  const save = useSaveOpportunity();
  const hosts = useMyHosts();
  const { user } = useAuth();
  const [category, setCategory] = useState<OpportunityCategory>(opp?.category ?? defaultCategory ?? (hosts.companies.length ? 'industrial' : preset?.me ? 'research' : 'lab'));
  const [hostSel, setHostSel] = useState<HostSel>(() =>
    opp
      ? {
          labs: opp.opportunity_hosts.map((h) => h.lab_id).filter((x): x is string => !!x),
          companies: opp.opportunity_hosts.map((h) => h.company_id).filter((x): x is string => !!x),
          projects: opp.opportunity_hosts.map((h) => h.project_id).filter((x): x is string => !!x),
          me: opp.opportunity_hosts.some((h) => h.person_id === user?.id),
        }
      : preset ?? { labs: hosts.labs.slice(0, 1).map((l) => l.id), companies: hosts.companies.slice(0, 1).map((c) => c.id), projects: [], me: !hosts.labs.length && !hosts.companies.length && !!hosts.me },
  );
  const [error, setError] = useState('');
  const [tags, setTags] = useState<string[]>(opp?.tags ?? []);
  // the same tag list for every listing: what others already used is suggested first
  const allOpps = useOpportunities();
  const tagSuggest = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    for (const o of allOpps.data ?? []) for (const t of o.tags) {
      const k = t.toLowerCase();
      const e = m.get(k) ?? { name: t, count: 0 };
      e.count += 1; m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [allOpps.data]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const s = (k: string) => String(d.get(k) ?? '').trim();
    if (s('title').length < 3 || s('description').length < 10) return setError('Add a title and a description (10+ characters).');
    if (!hostSel.labs.length && !hostSel.companies.length && !hostSel.projects.length && !hostSel.me) return setError('Choose at least one host.');
    if (category === 'industrial' && !hostSel.companies.length) return setError('Industrial cases are hosted by a company.');
    try {
      await save.mutateAsync({
        id: opp?.id ?? null,
        category,
        industrial_type: category === 'industrial' ? (s('industrial_type') as IndustrialType) : null,
        title: s('title'),
        description: s('description'),
        requirements: s('requirements').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 10),
        tags: tags.slice(0, 8),
        deadline: s('deadline') || null,
        duration: s('duration') || null,
        paid: d.get('paid') === 'on',
        compensation: s('compensation') || null,
        work_format: (s('work_format') || null) as Opportunity['work_format'],
        is_active: d.get('is_active') === 'on',
        lab_ids: hostSel.labs,
        company_ids: category === 'industrial' || hostSel.companies.length ? hostSel.companies : [],
        project_ids: hostSel.projects,
        as_me: !!hostSel.me,
      });
      toast.success(opp ? 'Updated' : 'Published', { description: 'It is on the Industry page now; applications arrive in Manage → Applications.' });
      onClose();
    } catch (err) {
      setError(humanError(err));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="hub-dialog wide">
        <span className="eyebrow">Opportunity</span>
        <DialogTitle>{opp ? 'Edit opportunity' : 'New opportunity'}</DialogTitle>
        <DialogDescription>Published opportunities appear on the Industry page (Opportunities) automatically.</DialogDescription>
        <form className="partner-form auth-form" onSubmit={submit} noValidate>
          <div className="auth-row">
            <label>Category
              <select value={category} onChange={(e) => setCategory(e.target.value as OpportunityCategory)}>
                {hosts.companies.length > 0 && <option value="industrial">Industrial case</option>}
                {(hosts.labs.length > 0 || hosts.projects.length > 0 || !!hosts.me) && <><option value="research">Research case</option><option value="lab">Lab case</option></>}
              </select>
            </label>
            {category === 'industrial' ? (
              <label>Type
                <select name="industrial_type" defaultValue={opp?.industrial_type ?? 'vacancy'}>
                  {(Object.keys(INDUSTRIAL_LABEL) as IndustrialType[]).map((t) => <option key={t} value={t}>{INDUSTRIAL_LABEL[t]}</option>)}
                </select>
              </label>
            ) : <label>Deadline<input type="date" name="deadline" defaultValue={opp?.deadline ?? ''} /></label>}
          </div>
          {category === 'industrial' && <label>Deadline<input type="date" name="deadline" defaultValue={opp?.deadline ?? ''} /></label>}
          <HostPicker value={hostSel} onChange={setHostSel} />
          <label>Title<input name="title" maxLength={160} defaultValue={opp?.title ?? ''} /></label>
          <label>Description<textarea name="description" rows={4} maxLength={4000} defaultValue={opp?.description ?? ''} /></label>
          <label>Requirements (one per line)<textarea name="requirements" rows={3} defaultValue={opp?.requirements.join('\n') ?? ''} /></label>
          <div className="form-field"><span className="form-label">Tags</span>
            <TagInput label="Tags" value={tags} onChange={setTags} suggestions={tagSuggest} max={8} placeholder="Type and press Enter: Python, Data, Internship…" />
          </div>
          <div className="auth-row">
            <label>Duration<input name="duration" maxLength={60} defaultValue={opp?.duration ?? ''} placeholder="3 months / Full-time" /></label>
            <label>Format<select name="work_format" defaultValue={opp?.work_format ?? ''}><option value="">—</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></label>
          </div>
          <div className="auth-row">
            <label>Compensation<input name="compensation" maxLength={120} defaultValue={opp?.compensation ?? ''} placeholder="optional, e.g. 250 000 ₸ / month" /></label>
            <div className="form-checks">
              <label className="check"><input type="checkbox" name="paid" defaultChecked={opp?.paid ?? category === 'industrial'} /><span>Paid</span></label>
              <label className="check"><input type="checkbox" name="is_active" defaultChecked={opp?.is_active ?? true} /><span>Published</span></label>
            </div>
          </div>
          {error && <p className="form-alert">{error}</p>}
          <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ═════════════════════ Events ═════════════════════ */

/** Event form: Manage → Events and the lab page ("+ Event", preset = that lab). Published events appear on /events at once. */
export function EventForm({ preset, onDone }: { preset?: HostSel; onDone?: () => void }) {
  const hosts = useMyHosts();
  const save = useSaveEvent();
  const [hostSel, setHostSel] = useState<HostSel>(preset ?? { labs: hosts.labs.slice(0, 1).map((l) => l.id), companies: [], projects: [] });
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const s = (k: string) => String(d.get(k) ?? '').trim();
    if (s('title').length < 3 || !s('date')) return setError('Title and date are required.');
    try {
      await save.mutateAsync({
        kind: s('kind') as 'research' | 'industrial',
        title: s('title'),
        description: s('description'),
        starts_at: new Date(`${s('date')}T${s('time') || '17:00'}:00+05:00`).toISOString(),
        room: s('room') || 'C1.2',
        speaker: s('speaker'),
        speaker_role: s('speaker_role'),
        capacity: Math.max(1, Number(s('capacity')) || 60),
        lab_ids: hostSel.labs,
        company_ids: hostSel.companies,
        project_ids: hostSel.projects,
      });
      toast.success('Event published', { description: 'It is on the Events page now.' });
      form.reset();
      setError('');
      onDone?.();
    } catch (err) {
      setError(humanError(err));
    }
  }

  return (
    <form className="partner-form auth-form" onSubmit={submit} noValidate>
      <label>Type<select name="kind" defaultValue={hosts.labs.length ? 'research' : 'industrial'}><option value="research">Research</option><option value="industrial">Industry</option></select></label>
      <HostPicker value={hostSel} onChange={setHostSel} />
      <label>Title<input name="title" maxLength={160} /></label>
      <label>Description<textarea name="description" rows={2} maxLength={3000} /></label>
      <div className="auth-row">
        <label>Date<input type="date" name="date" /></label>
        <label>Time<input type="time" name="time" defaultValue="17:00" /></label>
      </div>
      <div className="auth-row">
        <label>Speaker<input name="speaker" maxLength={120} /></label>
        <label>Speaker role<input name="speaker_role" maxLength={160} /></label>
      </div>
      <div className="auth-row">
        <label>Room<input name="room" defaultValue="C1.2" maxLength={40} /></label>
        <label>Seats<input name="capacity" inputMode="numeric" defaultValue="60" /></label>
      </div>
      {error && <p className="form-alert">{error}</p>}
      <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Publishing…' : 'Publish event'}</Button>
    </form>
  );
}

export function EventDialog({ preset, onClose }: { preset?: HostSel; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="hub-dialog wide">
        <span className="eyebrow">Event</span>
        <DialogTitle>New event</DialogTitle>
        <DialogDescription>Research: Tuesdays 17:00 · Industry: Thursdays 17:00 · Room C1.2. It appears on the Events page right away.</DialogDescription>
        <EventForm {...(preset ? { preset } : {})} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}

export function EventsPanel() {
  const { caps } = useAuth();
  const hosts = useMyHosts();
  if (!caps.isStaff && !hosts.labs.length && !hosts.companies.length) return null;
  return (
    <section className="panel">
      <h3 className="panel-title"><CalendarPlus size={15} />Publish an event</h3>
      <p className="small-note mb-3">Research: Tuesdays 17:00. Industry: Thursdays 17:00. Room C1.2. A lab can co-host with a company or one of its projects.</p>
      <EventForm />
    </section>
  );
}

/* ═════════════════════ B2B ═════════════════════ */

const BRIEF_TYPE: Record<PartnerRequest['request_type'], string> = { rnd: 'R&D', mvp: 'MVP outsourcing', hiring: 'Hiring', sponsorship: 'Sponsorship' };

export function BriefsPanel({ staff }: { staff: boolean }) {
  const briefs = useBriefs(true);
  const update = useUpdateBrief();
  return (
    <section className="panel">
      <h3 className="panel-title"><Building2 size={15} />{staff ? 'B2B requests' : 'Your B2B requests'}</h3>
      {(briefs.data ?? []).length === 0 ? (
        <div className="mini-empty"><Building2 size={20} /><p>No requests yet.</p><Button asChild size="sm" variant="outline"><Link to="/partners">B2B form</Link></Button></div>
      ) : (
        <ul className="rows">
          {(briefs.data ?? []).map((b) => (
            <li key={b.id} className="brief-row">
              <div>
                <strong>{b.company_name} · {BRIEF_TYPE[b.request_type]}</strong>
                <small>{b.contact_name} · <a href={gmailCompose(b.contact_email)} target="_blank" rel="noopener noreferrer">{b.contact_email}</a> · {b.has_budget ? `budget: ${b.budget_range ?? 'yes'}` : 'no budget yet'} · {b.tech_stack}</small>
                <p className="lab-text">{b.description}</p>
              </div>
              {staff ? (
                <select value={b.status} onChange={(e) => update.mutate({ id: b.id, status: e.target.value as PartnerRequest['status'] }, { onError: (err) => toast.error(humanError(err)) })} aria-label="Status">
                  {(['new', 'in_progress', 'matched', 'closed'] as const).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              ) : <span className="pill pill-live">{b.status.replace('_', ' ')}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ═════════════════════ Admin ═════════════════════ */

export function AdminPanel() {
  const teachers = usePendingTeachers(true);
  const companies = useCompanies(true);
  const act = useAdminAction();
  const run = (kind: 'staff' | 'company', id: string, verified: boolean, label: string) =>
    act.mutate({ kind, id, verified }, { onSuccess: () => toast.success(label), onError: (e) => toast.error(humanError(e)) });

  return (
    <div className="profile-grid">
      <section className="panel">
        <h3 className="panel-title"><ShieldCheck size={15} />Teacher accounts to verify</h3>
        {(teachers.data ?? []).length === 0 ? <p className="small-note">No pending accounts.</p> : (
          <ul className="rows">
            {(teachers.data ?? []).map((t) => (
              <li key={t.id}><div><strong>{t.first_name} {t.last_name}</strong><small>{t.email} · {t.department ?? '—'}</small></div><Button size="sm" onClick={() => run('staff', t.id, true, 'Teacher verified')}>Verify</Button></li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel">
        <h3 className="panel-title"><Building2 size={15} />Companies</h3>
        {(companies.data ?? []).length === 0 ? <p className="small-note">No companies yet.</p> : (
          <ul className="rows">
            {(companies.data ?? []).map((c) => (
              <li key={c.id}>
                <div><strong>{c.name}</strong><small>{c.website ?? 'no website'} · registered {formatDate(c.created_at)}</small></div>
                {c.verified
                  ? <Button size="sm" variant="ghost" onClick={() => run('company', c.id, false, 'Verification removed')}>Verified ✓</Button>
                  : <Button size="sm" onClick={() => run('company', c.id, true, 'Company verified')}>Verify</Button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ═════════════════════ Moderation (student / PhD submissions) ═════════════════════ */

export function ModerationPanel() {
  const queue = useModerationQueue(true);
  const moderate = useModerate();
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const items = (queue.data ?? []).filter((i) => i.moderation === filter);
  const decide = (i: ModerationItem, decision: 'approved' | 'rejected' | 'pending') =>
    moderate.mutate(
      { id: i.id, decision, ...(notes[i.id]?.trim() ? { note: notes[i.id]!.trim() } : {}) },
      { onSuccess: () => toast.success(`${i.title}: ${MODERATION_LABEL[decision]}`), onError: (e) => toast.error(humanError(e)) },
    );

  return (
    <section className="panel">
      <h3 className="panel-title"><ClipboardCheck size={15} />Submissions to review</h3>
      <p className="small-note moderation-intro">Projects and research sent by students and teachers via “Submit”. Approved items appear in Projects / Research at once.</p>
      <div className="filter-list mb-3">
        {(['pending', 'approved', 'rejected'] as const).map((f) => (
          <Button key={f} variant="ghost" className={filter === f ? 'filter active' : 'filter'} onClick={() => setFilter(f)}>
            {MODERATION_LABEL[f]} · {(queue.data ?? []).filter((i) => i.moderation === f).length}
          </Button>
        ))}
      </div>
      {queue.error && <p className="form-alert">{humanError(queue.error)}</p>}
      {items.length === 0 ? <div className="mini-empty"><ClipboardCheck size={20} /><p>Nothing here.</p></div> : (
        <ul className="moderation-list">
          {items.map((i) => (
            <li key={i.id} className="moderation-item">
              <div className="moderation-main">
                <span className="eyebrow">{KIND_LABEL[i.kind]} · {i.status}{i.year ? ` · ${i.year}` : ''}</span>
                <strong>{i.title}</strong>
                {i.summary && <p className="lab-text">{i.summary}</p>}
                <small>
                  {i.owner_name} ({ROLE_LABEL[i.owner_role as Role] ?? i.owner_role}) · <a href={gmailCompose(i.owner_email)} target="_blank" rel="noopener noreferrer">{i.owner_email}</a>
                  {i.authors.length > 0 && ` · team: ${i.authors.join(', ')}`}
                  {i.submitted_at && ` · sent ${formatDate(i.submitted_at)}`}
                </small>
                <div className="project-links">
                  {[['GitHub', i.github_url], ['Demo', i.demo_url], ['Paper', i.paper_url]].filter(([, u]) => u).map(([l, u]) => (
                    <a key={l} href={u!} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> {l}</a>
                  ))}
                </div>
              </div>
              <div className="moderation-actions">
                <textarea rows={2} maxLength={1000} placeholder="Note to the author (optional)" value={notes[i.id] ?? ''} onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} aria-label="Note to the author" />
                <div className="dialog-actions wrap">
                  {i.moderation !== 'approved' && <Button size="sm" disabled={moderate.isPending} onClick={() => decide(i, 'approved')}><CheckCircle2 />Approve</Button>}
                  {i.moderation !== 'rejected' && <Button size="sm" variant="ghost" disabled={moderate.isPending} onClick={() => decide(i, 'rejected')}><X />Decline</Button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
