import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { CheckCircle2, ChevronDown, Clock3, FlaskConical, Plus, Send, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { KIND_LABEL, humanError, setSubmissionAffiliation, useLabs, useProfessors, useSubmitProject, type ProjectKind, type ProjectStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const https = (v: string) => !v || /^https:\/\//i.test(v);

/**
 * "+ Submit your Project / Research" — students send their own work to the SITAM office.
 * After approval it appears in the catalog. PhD students' research is published immediately.
 */
export function SubmitProjectButton({ kind = 'project', label }: { kind?: ProjectKind; label?: string }) {
  const { user, profile, caps } = useAuth();
  const [open, setOpen] = useState(false);
  if (caps.isPartner || caps.isAlumni) return null;
  const text = label ?? (kind === 'research' ? 'Submit your research' : 'Submit your project');
  if (!user || !profile) {
    return (
      <Button asChild className="submit-cta">
        <Link to="/login"><Plus />{text}</Link>
      </Button>
    );
  }
  // lab heads: the same button also adds a project to their lab (opens the lab form on the Projects tab)
  if (kind === 'project' && caps.managedLabs.length > 0) {
    return (
      <>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button className="submit-cta"><Plus />{text}<ChevronDown /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="profile-menu submit-menu">
            {caps.managedLabs.map((l) => (
              <DropdownMenuItem key={l.id} asChild>
                <Link to="/labs/$slug" params={{ slug: l.slug }} search={{ edit: true, section: 'projects' }}><FlaskConical size={15} />New lab project · {l.name}</Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={() => setOpen(true)}><UserRound size={15} />My own project</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {open && <SubmitProjectDialog defaultKind={kind} onClose={() => setOpen(false)} />}
      </>
    );
  }
  return (
    <>
      <Button className="submit-cta" onClick={() => setOpen(true)}><Plus />{text}</Button>
      {open && <SubmitProjectDialog defaultKind={kind} onClose={() => setOpen(false)} />}
    </>
  );
}

export function SubmitProjectDialog({ defaultKind, onClose }: { defaultKind: ProjectKind; onClose: () => void }) {
  const { profile, caps } = useAuth();
  const submit = useSubmitProject();
  // the button decides the type: "Submit your research" is research only, "Submit your project" is a project only
  const kind: ProjectKind = defaultKind;
  const [error, setError] = useState('');
  const [done, setDone] = useState<'pending' | 'approved' | null>(null);
  // done with a lab OR with a researcher (one of the two, optional)
  const [withKind, setWithKind] = useState<'none' | 'lab' | 'person'>('none');
  const [withId, setWithId] = useState('');
  const labs = useLabs();
  const profs = useProfessors();
  const instant = (caps.isPhd && kind === 'research') || caps.isAdmin;

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const s = (k: string) => String(d.get(k) ?? '').trim();
    const list = (k: string) => s(k).split(',').map((x) => x.trim()).filter(Boolean);
    if (s('title').length < 3) return setError('Give it a title (3+ characters).');
    if (s('summary').length < 30) return setError('Describe it in a few sentences (30+ characters).');
    if (![s('github_url'), s('demo_url'), s('paper_url')].every(https)) return setError('Links must start with https://');
    const yr = Number(s('year'));
    if (withKind !== 'none' && !withId) return setError(withKind === 'lab' ? 'Choose the lab, or pick “Neither”.' : 'Choose the researcher, or pick “Neither”.');
    try {
      const row = await submit.mutateAsync({
        kind,
        title: s('title'),
        summary: s('summary'),
        tags: list('tags').slice(0, 8),
        authors: list('authors').slice(0, 12),
        year: Number.isInteger(yr) && yr > 1990 && yr < 2100 ? yr : null,
        status: (s('status') || 'ongoing') as ProjectStatus,
        github_url: s('github_url'),
        demo_url: s('demo_url'),
        paper_url: s('paper_url'),
        contact_email: s('contact_email'),
      });
      if (withKind !== 'none' && withId) {
        try { await setSubmissionAffiliation(row.id, withKind === 'lab' ? withId : null, withKind === 'person' ? withId : null); }
        catch (err) { toast.error('Sent, but the lab / researcher was not saved', { description: humanError(err) }); }
      }
      setDone(row.moderation === 'approved' ? 'approved' : 'pending');
      toast.success(row.moderation === 'approved' ? 'Published' : 'Sent for review');
    } catch (err) {
      setError(humanError(err));
    }
  }

  const me = `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="hub-dialog wide">
        {done ? (
          <div className="partner-success" role="status">
            {done === 'approved' ? <CheckCircle2 size={36} /> : <Clock3 size={36} />}
            <DialogTitle>{done === 'approved' ? 'Published' : 'Sent to the SITAM office'}</DialogTitle>
            <DialogDescription>
              {done === 'approved'
                ? 'Your research is live in the catalog now.'
                : 'An administrator reviews submissions, usually within a few working days. You can follow the status in your profile; after approval it appears in the catalog automatically.'}
            </DialogDescription>
            <div className="dialog-actions wrap">
              <Button asChild variant="outline"><Link to="/profile" onClick={onClose}>My submissions</Link></Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            <span className="eyebrow">{instant ? 'Published right away' : 'Reviewed by the SITAM office'}</span>
            <DialogTitle>Submit your {KIND_LABEL[kind].toLowerCase()}</DialogTitle>
            <DialogDescription>
              {kind === 'research' ? 'Your own research — not from a lab. After approval it appears on the Research page.' : 'Your own project — not from a lab. After approval it appears in the catalog.'}
            </DialogDescription>
            <form className="partner-form auth-form" onSubmit={send} noValidate>
              <label>Title<input name="title" maxLength={200} placeholder={kind === 'research' ? 'Federated learning for hospital data' : 'Campus navigation app'} /></label>
              <label>What is it?<textarea name="summary" rows={4} maxLength={2000} placeholder="Problem, what you built or found, current stage." /></label>
              <div className="auth-row">
                <label>Status<select name="status" defaultValue="ongoing"><option value="ongoing">Ongoing</option><option value="completed">Completed</option></select></label>
                <label>Year<input name="year" inputMode="numeric" maxLength={4} defaultValue={String(new Date().getFullYear())} /></label>
              </div>
              <fieldset className="with-field">
                <legend>Done with</legend>
                <div className="seg" role="radiogroup" aria-label="Done with">
                  {([['none', 'Neither'], ['lab', 'A lab'], ['person', 'A researcher']] as const).map(([k, label]) => (
                    <button key={k} type="button" role="radio" aria-checked={withKind === k} className={withKind === k ? 'is-on' : ''} onClick={() => { setWithKind(k); setWithId(''); }}>{label}</button>
                  ))}
                </div>
                {withKind === 'lab' && (
                  <select value={withId} onChange={(e) => setWithId(e.target.value)} aria-label="Select lab">
                    <option value="">Select lab</option>
                    {(labs.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                )}
                {withKind === 'person' && (
                  <select value={withId} onChange={(e) => setWithId(e.target.value)} aria-label="Select researcher">
                    <option value="">Select person / researcher</option>
                    {[...(profs.data ?? [])].sort((a, b) => a.full_name.localeCompare(b.full_name)).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                )}
              </fieldset>
              <label>Team (comma-separated)<input name="authors" defaultValue={me} maxLength={400} /></label>
              <label>Tags (comma-separated)<input name="tags" maxLength={200} placeholder="AI, EdTech" /></label>
              {kind !== 'research' && (
                <div className="auth-row">
                  <label>GitHub<input name="github_url" placeholder="https://github.com/…" maxLength={300} /></label>
                  <label>Demo<input name="demo_url" placeholder="https://… (optional)" maxLength={300} /></label>
                </div>
              )}
              <div className="auth-row">
                <label>{kind === 'research' ? 'Paper / preprint' : 'Pitch or paper'}<input name="paper_url" placeholder="https://…" maxLength={300} /></label>
                <label>Contact e-mail<input name="contact_email" type="email" defaultValue={profile?.email ?? ''} maxLength={255} /></label>
              </div>
              {error && <p className="form-alert" role="alert">{error}</p>}
              <Button type="submit" disabled={submit.isPending}><Send />{submit.isPending ? 'Sending…' : instant ? 'Publish' : 'Send for review'}</Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
