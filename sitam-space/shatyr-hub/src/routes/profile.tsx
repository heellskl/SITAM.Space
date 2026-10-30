import { useEffect, useState, type FormEvent } from 'react';
import { gmailCompose } from '@/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight, BarChart3, Bookmark, Briefcase, FileText, Hourglass, Inbox, KeyRound, Lightbulb, LogIn, Mail, Megaphone, Pencil, Phone, Ticket as TicketIcon, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { TicketBadge } from '@/components/event-board';
import { CompanyRequestsPanel, ListingDialog } from '@/components/manage-panels';
import { SubmitProjectButton } from '@/components/submit-project';
import {
  KIND_LABEL, MODERATION_LABEL, STATUS_LABEL, STATUS_TONE, cvProblem, db, eventDate, formatDate, hostNames, humanError, opportunityLabel, signedUrl, uploadAvatar, uploadCv, useEvents, useLabs,
  useManagedOpportunities, useMyApplications, useMyRegistrations, useMySubmissions, useProfessor, useWithdrawApplication, useWithdrawSubmission,
  type MyApplication, type Registration, type SitamEvent,
} from '@/lib/api';
import { MAJORS, ROLE_LABEL, useAuth } from '@/lib/auth';
import { DEPARTMENTS } from '@/lib/sitam-data';
import { pageHead } from '@/lib/hub-data';

export const Route = createFileRoute('/profile')({
  // ?settings=true (from the profile menu) opens the details form
  validateSearch: (s: Record<string, unknown>): { settings?: true } => (s['settings'] === true || s['settings'] === 'true' ? { settings: true } : {}),
  head: () => pageHead('Profile', 'Your SITAM SPACE profile: CV, applications, event tickets and saved labs.'),
  component: Profile,
});

function Empty({ icon: Icon, text, to, cta }: { icon: typeof Inbox; text: string; to: '/labs' | '/events' | '/opportunities' | '/partners'; cta: string }) {
  return (
    <div className="mini-empty">
      <Icon size={20} />
      <p>{text}</p>
      <Button asChild size="sm" variant="outline"><Link to={to}>{cta}<ArrowUpRight /></Link></Button>
    </div>
  );
}

function appTitle(a: MyApplication) {
  if (!a.opportunities) return { title: 'Application', sub: '' };
  return { title: a.opportunities.title, sub: `${opportunityLabel(a.opportunities)} · ${hostNames(a.opportunities.opportunity_hosts)}` };
}

function Profile() {
  const { user, profile, caps, loading, refresh } = useAuth();
  const apps = useMyApplications(user?.id);
  const regs = useMyRegistrations(user?.id);
  const events = useEvents();
  const labs = useLabs();
  const withdraw = useWithdrawApplication();
  const submissions = useMySubmissions(user && profile?.role !== 'partner' ? user.id : undefined);
  const withdrawSubmission = useWithdrawSubmission();
  const listings = useManagedOpportunities(!!user && !!profile && profile.role === 'teacher', user?.id);
  const research = useProfessor(caps.professorUsername ?? '');
  const [posting, setPosting] = useState(false);
  const { settings } = Route.useSearch();
  const [editing, setEditing] = useState(!!settings);
  useEffect(() => { if (settings) setEditing(true); }, [settings]);
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<{ event: SitamEvent; reg: Registration } | null>(null);

  if (loading) return <main className="container content-page"><p className="small-note">Loading your profile…</p></main>;

  if (!user || !profile) {
    return (
      <main className="container content-page auth-page">
        <span className="eyebrow">PROFILE</span>
        <h1>Sign in to SITAM SPACE.</h1>
        <p className="page-intro">Your CV, applications, QR tickets and saved labs live in your account. Sign in with your SDU e-mail.</p>
        <div className="profile-actions">
          <Button asChild><Link to="/login"><LogIn />Sign in</Link></Button>
          <Button asChild variant="outline"><Link to="/register">Create account</Link></Button>
        </div>
      </main>
    );
  }

  const name = `${profile.firstName} ${profile.lastName}`.trim();
  const initials = (name || user.email || 'U').split(/[\s@]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  const myRegs = (regs.data ?? []).filter((r) => r.status !== 'cancelled');
  const eventById = new Map((events.data ?? []).map((e) => [e.id, e]));
  const saved = (labs.data ?? []).filter((l) => caps.savedLabs.includes(l.id));

  async function changeCv(file: File | undefined) {
    const problem = cvProblem(file);
    if (problem || !file || !user) return toast.error(problem ?? 'Choose a file');
    setBusy(true);
    try {
      await uploadCv(user.id, file);
      await refresh();
      toast.success('CV saved to your account');
    } catch (e) {
      toast.error('Upload failed', { description: humanError(e) });
    } finally {
      setBusy(false);
    }
  }

  async function openCv() {
    if (!profile?.cvPath) return;
    try {
      window.open(await signedUrl(profile.cvPath), '_blank', 'noopener');
    } catch (e) {
      toast.error(humanError(e));
    }
  }

  return (
    <main className="container content-page">
      <div className="profile-head">
        <span className="avatar" aria-hidden>{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" className="avatar-img" /> : initials}</span>
        <div>
          <span className="eyebrow">{ROLE_LABEL[profile.role]}{caps.managedLabs.length ? ' · LAB HEAD' : ''}{caps.companies.length ? ` · ${caps.companies.map((c) => c.name).join(', ').toUpperCase()}` : ''}</span>
          <h1>{name || user.email}</h1>
          <p className="mt-2"><a className="person-mail" href={gmailCompose(profile.email || user.email)} target="_blank" rel="noopener noreferrer"><Mail size={15} />{profile.email || user.email}</a></p>
          <p className="small-note">
            {[profile.faculty, profile.groupName, profile.course ? `${profile.course} course` : null, profile.major, profile.department].filter(Boolean).join(' · ')}
            {profile.role === 'teacher' && !profile.staffVerified ? ' · verification pending' : ''}
            {profile.position ? ` · ${profile.position}` : ''}
          </p>
        </div>
        <div className="profile-head-actions">
          {profile.role !== 'partner' && <Button variant="outline" onClick={() => setEditing(true)}><Pencil />Edit details</Button>}
        </div>
      </div>

      <div className="profile-grid">
        {(caps.pendingClaims.length > 0 || caps.pendingCompanies.length > 0) && (
          <section className="panel">
            <h3 className="panel-title"><Hourglass size={16} />Waiting for confirmation</h3>
            {caps.pendingClaims.length > 0 && (
              <p className="small-note">Your e-mail is listed in: {caps.pendingClaims.join(', ')}. The SITAM coordinator will confirm that this account is yours, then it is linked.</p>
            )}
            {caps.pendingCompanies.length > 0 && (
              <p className="small-note">You asked to join {caps.pendingCompanies.join(', ')}. The SITAM coordinator or an owner of the company will approve it.</p>
            )}
          </section>
        )}
        <PasswordPanel />

        {(profile.role === 'student' || profile.role === 'phd') && (
          <section className="panel">
            <h3 className="panel-title"><FileText size={16} />CV</h3>
            <p className="cv-state">
              <span className={profile.cvPath ? 'pill pill-live' : 'pill pill-wip'}>{profile.cvPath ? 'Uploaded' : 'Missing'}</span>
              <span className="small-note">
                {profile.cvPath ? `${profile.cvFilename ?? 'cv.pdf'}${profile.cvUploadedAt ? ` · ${new Date(profile.cvUploadedAt).toLocaleDateString('en-GB')}` : ''}` : 'Upload a PDF once — every application attaches it.'}
              </span>
            </p>
            <div className="profile-cv-actions">
              {profile.cvPath && <Button variant="outline" size="sm" onClick={openCv}><FileText />View CV</Button>}
              <span className="file-pick file-picked">
                <Upload size={16} />
                <span>{busy ? 'Uploading…' : profile.cvPath ? 'Update CV' : 'Upload CV (PDF, ≤ 5 MB)'}</span>
                <input type="file" accept="application/pdf,.pdf" disabled={busy} aria-label="Upload CV" onChange={(e) => changeCv(e.target.files?.[0])} />
              </span>
            </div>
            <p className="small-note mt-3">Update CV replaces the file in place — applications you already sent keep the version they were sent with. Only the organizers you apply to can open it.</p>
          </section>
        )}

        {caps.isTeacher && (
          <section className="panel">
            <h3 className="panel-title"><Megaphone size={16} />My opportunities</h3>
            <p className="small-note mb-3">
              {caps.isStaff
                ? 'Topics, research positions and thesis offers you post appear on the Industry page (Opportunities) automatically. You see every applicant (name, contacts, e-mail, CV) in Manage → Applications.'
                : 'You can post opportunities in your own name as soon as the SITAM office verifies your teacher account.'}
            </p>
            {(() => {
              const mine = (listings.data ?? []).filter((o) => o.opportunity_hosts.some((h) => h.person_id === user.id) || o.created_by === user.id);
              return mine.length > 0 && (
                <ul className="rows mb-3">
                  {mine.map((o) => (
                    <li key={o.id}>
                      <div><strong>{o.title}</strong><small>{opportunityLabel(o)} · {hostNames(o.opportunity_hosts)}{o.deadline ? ` · until ${formatDate(o.deadline)}` : ''}</small></div>
                      <span className={`pill ${o.is_active ? 'pill-live' : 'pill-done'}`}>{o.is_active ? 'Published' : 'Hidden'}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
            <div className="dialog-actions wrap">
              {caps.isStaff && <Button onClick={() => setPosting(true)}><Megaphone />Post an opportunity</Button>}
              <Button asChild variant="outline"><Link to="/manage" search={{ tab: 'inbox' }}><Inbox />Applicants</Link></Button>
            </div>
          </section>
        )}

        {caps.isTeacher && (
          <section className="panel">
            <h3 className="panel-title"><BarChart3 size={16} />Research profile</h3>
            {research.data?.prof ? (
              <>
                <div className="kpi-row">
                  <div className="kpi mini"><strong>{research.data.prof.h_index}</strong><span>h-index</span></div>
                  <div className="kpi mini"><strong>{research.data.prof.total_citations}</strong><span>Citations</span></div>
                  <div className="kpi mini"><strong>{research.data.prof.total_works}</strong><span>Works</span></div>
                </div>
                <p className="small-note mt-3">Updated automatically from your Scopus publications.</p>
                <Button asChild size="sm" variant="outline" className="mt-3"><Link to="/research/$username" params={{ username: research.data.prof.username }}>Open my research page<ArrowUpRight /></Link></Button>
              </>
            ) : <p className="small-note">Your Scopus profile is not linked yet. The SITAM office links it by your SDU e-mail when publications are imported.</p>}
          </section>
        )}

        {caps.canApply && (
          <section className="panel">
            <h3 className="panel-title"><Inbox size={16} />My applications</h3>
            {apps.isLoading ? <p className="small-note">Loading…</p> : (apps.data ?? []).length ? (
              <ul className="rows">
                {(apps.data ?? []).map((a) => {
                  const t = appTitle(a);
                  return (
                    <li key={a.id}>
                      <div>
                        <strong>{t.title}</strong>
                        <small>{t.sub} · {formatDate(a.created_at)}</small>
                        {a.reviewer_note && <small className="reviewer-note">“{a.reviewer_note}”</small>}
                      </div>
                      <span className="row-actions">
                        <span className={`pill pill-${STATUS_TONE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                        {['submitted', 'in_review', 'shortlisted'].includes(a.status) && (
                          <Button size="sm" variant="ghost" onClick={() => withdraw.mutate(a.id, { onSuccess: () => toast('Application withdrawn'), onError: (e) => toast.error(humanError(e)) })}>Withdraw</Button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : <Empty icon={Briefcase} text="You have not applied yet." to="/opportunities" cta="Browse opportunities" />}
          </section>
        )}

        {profile.role !== 'partner' && (
          <section className="panel">
            <h3 className="panel-title"><Lightbulb size={16} />My submissions</h3>
            {(submissions.data ?? []).length ? (
              <ul className="rows">
                {(submissions.data ?? []).map((p) => (
                  <li key={p.id}>
                    <div>
                      <strong>{p.title}</strong>
                      <small>{KIND_LABEL[p.kind]}{p.submitted_at ? ` · sent ${formatDate(p.submitted_at)}` : ''}</small>
                      {p.moderation_note && <small className="reviewer-note">“{p.moderation_note}”</small>}
                    </div>
                    <span className="row-actions">
                      <span className={`pill ${p.moderation === 'approved' ? 'pill-live' : p.moderation === 'pending' ? 'pill-wip' : 'pill-done'}`}>{MODERATION_LABEL[p.moderation]}</span>
                      {p.moderation !== 'approved' && (
                        <Button size="sm" variant="ghost" aria-label="Withdraw" onClick={() => withdrawSubmission.mutate(p.id, { onSuccess: () => toast('Submission withdrawn'), onError: (e) => toast.error(humanError(e)) })}><Trash2 /></Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="small-note mb-3">Your own project or research — reviewed by the SITAM office, then shown in the catalog.</p>}
            <div className="dialog-actions wrap mt-3">
              <SubmitProjectButton kind="project" label="Submit a project" />
              <SubmitProjectButton kind="research" label={caps.isPhd ? 'Publish research' : 'Submit research'} />
            </div>
          </section>
        )}

        <section className="panel">
          <h3 className="panel-title"><TicketIcon size={16} />Event QR tickets</h3>
          {myRegs.length ? (
            <ul className="rows">
              {myRegs.map((r) => {
                const e = eventById.get(r.event_id);
                if (!e) return null;
                const d = eventDate(e.starts_at);
                return (
                  <li key={r.id}>
                    <div><strong>{e.title}</strong><small>{d.short} · {d.time} · Room {e.room}{r.status === 'checked_in' ? ' · ✓ attended' : ''}</small></div>
                    <Button size="sm" variant="outline" onClick={() => setTicket({ event: e, reg: r })}>Show QR</Button>
                  </li>
                );
              })}
            </ul>
          ) : <Empty icon={TicketIcon} text="Register for an event to get a QR ticket." to="/events" cta="See events" />}
        </section>

        <section className="panel">
          <h3 className="panel-title"><Bookmark size={16} />Saved labs</h3>
          {saved.length ? (
            <ul className="rows">
              {saved.map((l) => (
                <li key={l.id}>
                  <div><strong>{l.name}</strong><small>{l.location}</small></div>
                  <Button asChild size="sm" variant="ghost"><Link to="/labs/$slug" params={{ slug: l.slug }}>Open</Link></Button>
                </li>
              ))}
            </ul>
          ) : <Empty icon={Bookmark} text="Bookmark labs to compare them later." to="/labs" cta="Explore labs" />}
        </section>

        {caps.isPartner && (
          <section className="panel">
            <h3 className="panel-title"><Briefcase size={16} />Company workspace</h3>
            <p className="small-note mb-3">{caps.companies.some((c) => c.verified) ? 'Publish vacancies, internships and projects and review applicants with their CVs.' : 'Your company is waiting for verification by the SITAM office. You will be able to publish opportunities right after.'}</p>
            <Button asChild><Link to="/manage" search={{ tab: 'listings' }}>Open listings<ArrowUpRight /></Link></Button>
          </section>
        )}
        {caps.isPartner && caps.companies.length > 0 && <CompanyRequestsPanel hideWhenEmpty />}
      </div>

      {posting && <ListingDialog opp={null} defaultCategory="research" preset={{ labs: [], companies: [], projects: [], me: true }} onClose={() => setPosting(false)} />}
      {editing && <DetailsDialog onClose={() => setEditing(false)} />}

      <Dialog open={!!ticket} onOpenChange={(o) => !o && setTicket(null)}>
        <DialogContent className="hub-dialog">
          <DialogTitle>Your QR ticket</DialogTitle>
          <DialogDescription>Show this badge at the door. The organizer scans it to check you in.</DialogDescription>
          {ticket && <TicketBadge event={ticket.event} reg={ticket.reg} holder={name || undefined} />}
          <Button onClick={() => setTicket(null)}>Done</Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}

const OTHER_MAJOR = 'Other (type your own)';

/** Phone, major (incl. a custom one) and department. Columns are limited by a database grant. */
function DetailsDialog({ onClose }: { onClose: () => void }) {
  const { user, profile, refresh } = useAuth();
  const knownMajor = !!profile?.major && (MAJORS as readonly string[]).includes(profile.major);
  const knownDept = !!profile?.department && (DEPARTMENTS as readonly string[]).includes(profile.department);
  const [major, setMajor] = useState(profile?.major ? (knownMajor ? profile.major : OTHER_MAJOR) : '');
  const [dept, setDept] = useState(profile?.department ? (knownDept ? profile.department : 'Other') : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  if (!user || !profile) return null;
  async function changePhoto(file: File | undefined) {
    if (!file || !user) return;
    setPhotoBusy(true);
    try {
      await uploadAvatar(user.id, file);
      await refresh();
      toast.success('Photo updated');
    } catch (e) {
      toast.error(humanError(e));
    } finally {
      setPhotoBusy(false);
    }
  }
  const student = profile.role === 'student' || profile.role === 'phd';
  const staff = profile.role === 'teacher' || profile.role === 'phd';

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const s = (k: string) => String(d.get(k) ?? '').trim();
    const patch: Record<string, string | null> = {
      first_name: s('first_name'), last_name: s('last_name'), faculty: s('faculty') || null, group_name: s('group_name') || null,
      personal_email: s('personal_email') || null,
    };
    if (student) patch['major'] = (major === OTHER_MAJOR ? s('majorCustom') : major) || null;
    if (staff) patch['department'] = (dept === 'Other' ? s('deptCustom') : dept) || null;
    if (patch['first_name']!.length < 2 || patch['last_name']!.length < 2) return setError('Enter your first and last name.');
    if (patch['personal_email'] && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(patch['personal_email'])) return setError('Check the personal e-mail.');
    setBusy(true);
    const { error: err } = await db.from('profiles').update(patch).eq('id', user!.id);
    setBusy(false);
    if (err) return setError(humanError(err));
    await refresh();
    toast.success('Profile updated');
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="hub-dialog">
        <DialogTitle>Your details</DialogTitle>
        <DialogDescription className="sr-only">Your details</DialogDescription>
        <form className="partner-form auth-form" onSubmit={save} noValidate>
          <div className="auth-row">
            <label>First name<input name="first_name" defaultValue={profile.firstName} maxLength={60} /></label>
            <label>Last name<input name="last_name" defaultValue={profile.lastName} maxLength={60} /></label>
          </div>
          <div className="logo-row">
            <span className="avatar">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" className="avatar-img" /> : `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`}</span>
            <span className="file-pick file-picked">
              <Upload size={16} /><span>{photoBusy ? 'Uploading…' : 'Change photo (PNG/JPG, ≤ 3 MB)'}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={photoBusy} onChange={(e) => changePhoto(e.target.files?.[0])} aria-label="Profile photo" />
            </span>
          </div>
          <div className="auth-row">
            <div className="auth-row">
              <label>SDU e-mail<input value={profile.email} readOnly aria-readonly /></label>
              <label>Personal e-mail<input name="personal_email" type="email" defaultValue={profile.personalEmail ?? ''} maxLength={160} placeholder="name@gmail.com" />
                <small className="field-hint">You can also sign in with it, using the same password.</small>
              </label>
            </div>
            <label>Faculty<input name="faculty" defaultValue={profile.faculty ?? ''} maxLength={120} placeholder="Engineering and Natural Sciences" /></label>
            <label>{profile.role === 'student' ? 'Group' : 'Department'}<input name="group_name" defaultValue={profile.groupName ?? ''} maxLength={120} placeholder={profile.role === 'student' ? 'IS-22-1' : 'Computer Science'} /></label>
          </div>
          {student && (
            <>
              <label>Major
                <select value={major} onChange={(e) => setMajor(e.target.value)}>
                  <option value="">—</option>
                  {MAJORS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              {major === OTHER_MAJOR && <label>Your major<input name="majorCustom" defaultValue={knownMajor ? '' : profile.major ?? ''} maxLength={100} placeholder="e.g. Bioinformatics" /></label>}
            </>
          )}
          {staff && (
            <>
              <label>Department / school
                <select value={dept} onChange={(e) => setDept(e.target.value)}>
                  <option value="">—</option>
                  {DEPARTMENTS.map((x) => <option key={x} value={x}>{x === 'Other' ? 'Other (type your own)' : x}</option>)}
                </select>
              </label>
              {dept === 'Other' && <label>Your department<input name="deptCustom" defaultValue={knownDept ? '' : profile.department ?? ''} maxLength={100} /></label>}
            </>
          )}
          {error && <p className="form-alert">{error}</p>}
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Set or change the password — for accounts that signed in with an e-mail link and never had (or forgot) one. */
function PasswordPanel() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pw.length < 8) return setError('Password must be at least 8 characters.');
    if (pw.length > 72) return setError('Password must be at most 72 characters.');
    if (pw !== pw2) return setError('The two passwords do not match.');
    setError('');
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) return setError(/reauth|recent/i.test(err.message) ? 'For safety, sign in again with an e-mail link and then set the password.' : humanError(err));
    setPw('');
    setPw2('');
    toast.success('Password saved', { description: 'Next time sign in with your e-mail and this password.' });
  }

  return (
    <section className="panel">
      <h3 className="panel-title"><KeyRound size={16} />Password</h3>
      <form className="partner-form auth-form" onSubmit={save} noValidate>
        <label>
          New password
          <input type="password" autoComplete="new-password" maxLength={72} placeholder="At least 8 characters" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        <label>
          Repeat new password
          <input type="password" autoComplete="new-password" maxLength={72} value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        {error && <p className="form-alert" role="alert">{error}</p>}
        <Button type="submit" size="sm" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</Button>
      </form>
    </section>
  );
}
