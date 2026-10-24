import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { CheckCircle2, Clock3, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { KIND_LABEL, humanError, useSubmitProject, type ProjectKind, type ProjectStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const https = (v: string) => !v || /^https:\/\//i.test(v);

/**
 * "+ Submit your Project / Research" — students send their own work to the SITAM office.
 * After approval it appears in the catalog. PhD students' research is published immediately.
 */
export function SubmitProjectButton({ kind = 'project', label }: { kind?: ProjectKind; label?: string }) {
  const { user, profile, caps } = useAuth();
  const [open, setOpen] = useState(false);
  if (caps.isPartner) return null;
  const text = label ?? (kind === 'research' ? 'Submit your research' : 'Submit your project');
  if (!user || !profile) {
    return (
      <Button asChild className="submit-cta">
        <Link to="/login"><Plus />{text}</Link>
      </Button>
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
  const [kind, setKind] = useState<ProjectKind>(defaultKind);
  const [error, setError] = useState('');
  const [done, setDone] = useState<'pending' | 'approved' | null>(null);
  const instant = (caps.isPhd && kind === 'research') || caps.isAdmin;
  // Startups were removed from the catalog; projects and research stay.
  const kinds: ProjectKind[] = defaultKind === 'research' ? ['research', 'project'] : ['project', 'research'];

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const s = (k: string) => String(d.get(k) ?? '').trim();
    const list = (k: string) => s(k).split(',').map((x) => x.trim()).filter(Boolean);
    if (s('title').length < 3) return setError('Give it a title (3+ characters).');
    if (s('summary').length < 30) return setError('Describe it in a few sentences (30+ characters).');
    if (![s('github_url'), s('demo_url'), s('paper_url')].every(https)) return setError('Links must start with https://');
    const yr = Number(s('year'));
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
              Your own project or research — not from a lab. After approval it appears in the catalog.
            </DialogDescription>
            <form className="partner-form auth-form" onSubmit={send} noValidate>
              <fieldset>
                <legend>Type</legend>
                <div className="kind-switch" role="group" aria-label="Type">
                  {kinds.map((k) => (
                    <button key={k} type="button" className={kind === k ? 'role-option role-active' : 'role-option'} aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
                  ))}
                </div>
              </fieldset>
              <label>Title<input name="title" maxLength={200} placeholder={kind === 'research' ? 'Federated learning for hospital data' : 'Campus navigation app'} /></label>
              <label>What is it?<textarea name="summary" rows={4} maxLength={2000} placeholder="Problem, what you built or found, current stage." /></label>
              <div className="auth-row">
                <label>Status<select name="status" defaultValue="ongoing"><option value="ongoing">Ongoing</option><option value="completed">Completed</option></select></label>
                <label>Year<input name="year" inputMode="numeric" maxLength={4} defaultValue={String(new Date().getFullYear())} /></label>
              </div>
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
