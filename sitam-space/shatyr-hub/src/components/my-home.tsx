// v19: the Home page of a signed-in person — their research, labs, events and industry experience in one place.
// Everything is read from data the person already has (researcher card, lab memberships, registrations,
// applications, lab partners). Only the work / internship history is new (profiles.experience, own row).

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Briefcase, Building2, CalendarDays, Camera, FlaskConical, GraduationCap, Pencil, Plus, Ticket, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ROLE_LABEL, isSduEmail, useAuth } from '@/lib/auth';
import {
  INDUSTRIAL_LABEL, LAB_POSITION_LABEL, STATUS_LABEL, STATUS_TONE, formatDate, hostNames, humanError, opportunityLabel, uploadAvatar,
  useEvents, useExperience, useLabs, useMyApplications, useMyRegistrations, useProfessor, useSaveExperience,
  type Experience, type LabRole, type SitamEvent,
} from '@/lib/api';

const month = (ym: string) => (ym ? new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '');
const period = (e: Experience) => `${month(e.start) || '…'} – ${e.end ? month(e.end) : 'present'}`;
const isIndustry = (ev: SitamEvent) => ev.kind === 'industrial' || ev.event_hosts.some((h) => h.company_id);

function Empty({ children }: { children: ReactNode }) {
  return <p className="small-note home-empty">{children}</p>;
}

/* ───────────── work / internship history editor ───────────── */
function ExperienceDialog({ userId, items, open, onOpenChange }: { userId: string; items: Experience[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const save = useSaveExperience();
  const [list, setList] = useState<Experience[]>(items);
  const [error, setError] = useState('');
  const blank: Experience = { kind: 'internship', company: '', role: '', start: '', end: '' };
  const set = (i: number, k: keyof Experience, v: string) => setList((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = list.map((x) => ({ ...x, company: x.company.trim(), role: x.role.trim() })).filter((x) => x.company);
    try {
      await save.mutateAsync({ userId, items: clean });
      toast.success('Experience saved');
      onOpenChange(false);
    } catch (err) { setError(humanError(err)); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) setList(items); onOpenChange(o); }}>
      <DialogContent className="hub-dialog wide">
        <span className="eyebrow">Industry experience</span>
        <DialogTitle>Where you worked or did an internship</DialogTitle>
        <DialogDescription>Shown on your Home page and on your profile to signed-in members.</DialogDescription>
        <form className="partner-form auth-form" onSubmit={submit} noValidate>
          {list.map((x, i) => (
            <fieldset key={i} className="exp-row">
              <div className="auth-row">
                <label>Type<select value={x.kind} onChange={(e) => set(i, 'kind', e.target.value)}><option value="internship">Internship</option><option value="work">Work</option></select></label>
                <label>Company<input value={x.company} maxLength={120} onChange={(e) => set(i, 'company', e.target.value)} placeholder="Kaspi.kz" /></label>
              </div>
              <div className="auth-row">
                <label>Role<input value={x.role} maxLength={120} onChange={(e) => set(i, 'role', e.target.value)} placeholder="Data analyst intern" /></label>
                <label>From<input type="month" value={x.start} onChange={(e) => set(i, 'start', e.target.value)} /></label>
                <label>To<input type="month" value={x.end} onChange={(e) => set(i, 'end', e.target.value)} title="Leave empty if you still work there" /></label>
              </div>
              <Button type="button" size="icon" variant="ghost" className="exp-remove" aria-label="Remove" onClick={() => setList((l) => l.filter((_, j) => j !== i))}><Trash2 /></Button>
            </fieldset>
          ))}
          {list.length < 30 && <Button type="button" variant="outline" size="sm" onClick={() => setList((l) => [...l, blank])}><Plus />Add a place</Button>}
          {error && <p className="form-alert" role="alert">{error}</p>}
          <div className="editor-actions exp-actions">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}><X />Cancel</Button>
            <Button type="submit" className="editor-save" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── the page ───────────── */
export function MyHome() {
  const { user, profile, caps, refresh } = useAuth();
  const uid = user?.id;
  const [photoBusy, setPhotoBusy] = useState(false);
  const card = useProfessor(caps.professorUsername ?? '');
  const labs = useLabs();
  const events = useEvents();
  const regs = useMyRegistrations(uid);
  const apps = useMyApplications(uid);
  const exp = useExperience(uid);
  const [editExp, setEditExp] = useState(false);

  const myEvents = useMemo(() => {
    const byId = new Map((events.data ?? []).map((e) => [e.id, e]));
    const now = Date.now();
    const list = (regs.data ?? []).filter((r) => r.status !== 'cancelled').map((r) => ({ r, ev: byId.get(r.event_id) })).filter((x): x is { r: typeof x.r; ev: SitamEvent } => !!x.ev);
    return {
      upcoming: list.filter((x) => new Date(x.ev.starts_at).getTime() >= now).sort((a, b) => a.ev.starts_at.localeCompare(b.ev.starts_at)),
      attended: list.filter((x) => new Date(x.ev.starts_at).getTime() < now).sort((a, b) => b.ev.starts_at.localeCompare(a.ev.starts_at)),
    };
  }, [events.data, regs.data]);
  const industryEvents = [...myEvents.upcoming, ...myEvents.attended].filter((x) => isIndustry(x.ev));

  const myLabIds = new Set(caps.labMemberships.map((m) => m.id));
  const partners = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of labs.data ?? []) if (myLabIds.has(l.id)) for (const p of l.current_partners ?? []) m.set(p, [...(m.get(p) ?? []), l.name]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labs.data, caps.labMemberships]);

  // internships / vacancies accepted through SITAM SPACE count as experience automatically
  const viaSitam = (apps.data ?? []).filter((a) => a.status === 'accepted' && a.opportunities?.category === 'industrial');
  const experience = exp.data ?? [];

  if (!profile || !uid) return null;
  const name = `${profile.firstName} ${profile.lastName}`.trim() || user?.email || 'You';
  const initials = name.split(/[\s@]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  const prof = card.data?.prof;
  // the second fact: what the person studies / teaches / where they work
  const speciality =
    profile.role === 'student' || profile.role === 'phd' ? { label: 'Speciality', value: profile.major ?? profile.faculty }
    : profile.role === 'teacher' ? { label: 'Department', value: profile.department ?? profile.faculty }
    : { label: 'Company', value: [profile.company, profile.position].filter(Boolean).join(' · ') || undefined };
  const joined = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  async function changePhoto(file: File | undefined) {
    if (!file || !uid) return;
    setPhotoBusy(true);
    try {
      await uploadAvatar(uid, file);
      await refresh();
      toast.success('Photo updated');
    } catch (e) {
      toast.error(humanError(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <main className="container content-page my-home">
      {/* who the person is: photo, name, role and four short facts */}
      <header className="idcard">
        <div className="idcard-avatar">
          <span className="idcard-photo" aria-hidden>{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" /> : initials}</span>
          <label className={photoBusy ? 'idcard-cam is-busy' : 'idcard-cam'} title="Change photo">
            <Camera size={15} />
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={photoBusy} onChange={(e) => { void changePhoto(e.target.files?.[0]); e.target.value = ''; }} aria-label="Change profile photo" />
          </label>
        </div>
        <div className="idcard-main">
          <div className="idcard-title">
            <h1>{name}</h1>
            <span className="idcard-role">{ROLE_LABEL[profile.role]}</span>
          </div>
          <dl className="idcard-facts">
            <div><dt>{isSduEmail(profile.email) ? 'SDU mail' : 'E-mail'}</dt><dd>{profile.email}</dd></div>
            <div><dt>{speciality.label}</dt><dd>{speciality.value || '—'}</dd></div>
            <div><dt>Joined</dt><dd>{joined}</dd></div>
          </dl>
        </div>
        <Button asChild variant="outline" size="sm" className="idcard-edit"><Link to="/profile" search={{ settings: true }}><Pencil />Edit details</Link></Button>
      </header>

      <div className="kpi-grid">
        {prof ? (
          <>
            <div className="kpi"><strong>{prof.h_index}</strong><span>h-index</span></div>
            <div className="kpi"><strong>{prof.total_citations}</strong><span>Citations</span></div>
            <div className="kpi"><strong>{prof.total_works}</strong><span>Publications</span></div>
          </>
        ) : (
          <div className="kpi"><strong>{(apps.data ?? []).length}</strong><span>Applications</span></div>
        )}
        <div className="kpi"><strong>{caps.labMemberships.length}</strong><span>Labs</span></div>
        <div className="kpi"><strong>{myEvents.attended.length}</strong><span>Events attended</span></div>
      </div>

      <div className="lab-layout home-layout">
        <div className="lab-main">
          {/* ── labs ── */}
          <section className="panel">
            <div className="panel-head"><h3 className="panel-title"><FlaskConical size={15} />My labs</h3></div>
            {caps.labMemberships.length ? (
              <ul className="rows">
                {caps.labMemberships.map((m) => (
                  <li key={m.id}>
                    <div><strong><Link to="/labs/$slug" params={{ slug: m.slug }}>{m.name}</Link></strong><small>{m.title ?? LAB_POSITION_LABEL[m.role as LabRole] ?? m.role}</small></div>
                    {m.isHead && <span className="pill pill-gold">Head</span>}
                  </li>
                ))}
              </ul>
            ) : <Empty>You are not in a lab yet. <Link to="/labs">Browse the labs</Link>.</Empty>}
          </section>

          {/* ── research ── */}
          <section className="panel">
            <div className="panel-head">
              <h3 className="panel-title"><GraduationCap size={15} />Research</h3>
              {prof && <Button asChild size="sm" variant="ghost"><Link to="/research/$username" params={{ username: prof.username }}>My research page<ArrowUpRight /></Link></Button>}
            </div>
            {prof ? (
              <>
                <dl className="home-metrics">
                  <div><dt>h-index</dt><dd>{prof.h_index}</dd></div>
                  <div><dt>i10-index</dt><dd>{prof.i10_index}</dd></div>
                  <div><dt>Citations</dt><dd>{prof.total_citations}</dd></div>
                  <div><dt>Works</dt><dd>{prof.total_works}</dd></div>
                </dl>
                {(card.data?.pubs ?? []).length > 0 && (
                  <ul className="rows">
                    {(card.data?.pubs ?? []).slice(0, 4).map((p) => (
                      <li key={p.id}><div><strong>{p.title}</strong><small>{[p.year, p.venue, `${p.citations} citations`].filter(Boolean).join(' · ')}</small></div></li>
                    ))}
                  </ul>
                )}
                {prof.keywords.length > 0 && <div className="stack-list">{prof.keywords.slice(0, 10).map((k) => <span key={k}>{k}</span>)}</div>}
              </>
            ) : caps.isTeacher ? (
              <Empty>Your researcher card is not linked yet. <Link to="/research" search={{ tab: 'people' }}>Find yourself in Research</Link> and request your profile.</Empty>
            ) : (
              <Empty>No research profile. Join a lab or browse <Link to="/research" search={{ tab: 'people' }}>researchers</Link> to start.</Empty>
            )}
          </section>

          {/* ── events ── */}
          <section className="panel">
            <div className="panel-head"><h3 className="panel-title"><CalendarDays size={15} />My events</h3><Button asChild size="sm" variant="ghost"><Link to="/events">All events<ArrowUpRight /></Link></Button></div>
            {myEvents.upcoming.length + myEvents.attended.length === 0 && <Empty>You have not registered for events yet.</Empty>}
            {myEvents.upcoming.length > 0 && (
              <>
                <p className="home-sub">Upcoming</p>
                <ul className="rows">
                  {myEvents.upcoming.slice(0, 4).map(({ r, ev }) => (
                    <li key={r.id}>
                      <div><strong><Link to="/events/$eventId" params={{ eventId: ev.id }}>{ev.title}</Link></strong><small>{formatDate(ev.starts_at)} · {ev.room}</small></div>
                      <Button asChild size="sm" variant="outline"><Link to="/profile"><Ticket />Ticket</Link></Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {myEvents.attended.length > 0 && (
              <>
                <p className="home-sub">Took part</p>
                <ul className="rows">
                  {myEvents.attended.slice(0, 6).map(({ r, ev }) => (
                    <li key={r.id}>
                      <div><strong><Link to="/events/$eventId" params={{ eventId: ev.id }}>{ev.title}</Link></strong><small>{formatDate(ev.starts_at)}</small></div>
                      {r.status === 'checked_in' && <span className="pill pill-done">Attended</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
        <aside className="lab-aside">
          {/* ── industry ── */}
          <section className="panel">
            <div className="panel-head">
              <h3 className="panel-title"><Briefcase size={15} />Industry</h3>
              {exp.data !== null && <Button size="sm" variant="ghost" onClick={() => setEditExp(true)}><Pencil />Edit experience</Button>}
            </div>

            <p className="home-sub">Work & internships</p>
            {experience.length + viaSitam.length === 0 ? (
              <Empty>{exp.data === null ? 'Available soon.' : 'Add where you worked or did an internship.'}</Empty>
            ) : (
              <ul className="rows">
                {experience.map((x, i) => (
                  <li key={`e${i}`}><div><strong>{x.role ? `${x.role} · ${x.company}` : x.company}</strong><small>{x.kind === 'internship' ? 'Internship' : 'Work'} · {period(x)}</small></div></li>
                ))}
                {viaSitam.map((a) => (
                  <li key={a.id}><div><strong>{a.opportunities?.title}</strong><small>{a.opportunities?.industrial_type ? INDUSTRIAL_LABEL[a.opportunities.industrial_type] : 'Industrial case'} · {hostNames(a.opportunities?.opportunity_hosts ?? [])} · via SITAM SPACE</small></div></li>
                ))}
              </ul>
            )}

            <p className="home-sub">My applications</p>
            {(apps.data ?? []).length ? (
              <ul className="rows">
                {(apps.data ?? []).slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <div><strong>{a.opportunities?.title ?? 'Opportunity'}</strong><small>{a.opportunities ? opportunityLabel(a.opportunities) : ''} · {formatDate(a.created_at)}</small></div>
                    <span className={`pill pill-${STATUS_TONE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty>No applications yet. <Link to="/opportunities">See open vacancies and internships</Link>.</Empty>}

            <p className="home-sub">Industry events</p>
            {industryEvents.length ? (
              <ul className="rows">
                {industryEvents.slice(0, 4).map(({ r, ev }) => (
                  <li key={r.id}><div><strong><Link to="/events/$eventId" params={{ eventId: ev.id }}>{ev.title}</Link></strong><small>{formatDate(ev.starts_at)}{hostNames(ev.event_hosts) ? ` · ${hostNames(ev.event_hosts)}` : ''}</small></div></li>
                ))}
              </ul>
            ) : <Empty>No industry events yet.</Empty>}

            <p className="home-sub"><Building2 size={13} />Partner companies of my labs</p>
            {partners.length ? (
              <div className="stack-list">{partners.map(([p, ls]) => <span key={p} title={ls.join(', ')}>{p}</span>)}</div>
            ) : <Empty>{caps.labMemberships.length ? 'Your labs have not listed partners yet.' : 'Join a lab to see its partners.'}</Empty>}
          </section>
        </aside>
      </div>

      {exp.data !== null && exp.data !== undefined && <ExperienceDialog userId={uid} items={exp.data} open={editExp} onOpenChange={setEditExp} />}
    </main>
  );
}
