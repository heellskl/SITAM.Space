import { useEffect, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, CheckCircle2, FileText, LogIn, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cvProblem, hostNames, humanError, opportunityLabel, signedUrl, uploadApplicationCv, useMyApplications, useSubmitApplication, type Opportunity } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function ApplyDialog({ opp, onClose }: { opp: Opportunity | null; onClose: () => void }) {
  const { user, profile } = useAuth();
  const apps = useMyApplications(user?.id);
  const submitApp = useSubmitApplication();
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(false);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setFile(null);
    setReplace(false);
    setNote('');
    setErrors({});
    setBusy(false);
    setDone(false);
  }, [opp?.id]);

  const hasCv = !!profile?.cvPath;
  const already = !!opp && (apps.data ?? []).some((a) => a.opportunity_id === opp.id && a.status !== 'withdrawn');
  const closed = !!opp?.deadline && new Date(`${opp.deadline}T23:59:59+05:00`).getTime() < Date.now();

  function pick(f: File | undefined) {
    const problem = cvProblem(f);
    if (problem) return setErrors((e) => ({ ...e, cv: problem }));
    setErrors(({ cv: _cv, ...rest }) => rest);
    setFile(f ?? null);
  }

  async function viewCv() {
    if (!profile?.cvPath) return;
    try {
      window.open(await signedUrl(profile.cvPath), '_blank', 'noopener');
    } catch (e) {
      toast.error(humanError(e));
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!opp || !user) return;
    const next: Record<string, string> = {};
    if (note.trim().length < 20) next['note'] = 'Tell the team why you are a good fit (20+ characters).';
    if (!file && (!hasCv || replace)) next['cv'] = 'Attach a CV as a PDF.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const cvPath = file ? await uploadApplicationCv(user.id, file) : null; // null = use the profile CV
      await submitApp.mutateAsync({ opportunityId: opp.id, note: note.trim(), cvPath });
      setDone(true);
      toast.success('Application sent', { description: opp.title });
    } catch (err) {
      toast.error('Could not apply', { description: humanError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!opp} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="hub-dialog">
        {opp && (
          <>
            <span className="eyebrow">{opportunityLabel(opp)} · {hostNames(opp.opportunity_hosts)}</span>
            <DialogTitle>{opp.title}</DialogTitle>
            <DialogDescription>{opp.description}</DialogDescription>
            {opp.requirements.length > 0 && (
              <ul className="project-list">{opp.requirements.map((r) => <li key={r}><CheckCircle2 size={15} />{r}</li>)}</ul>
            )}

            {done || already ? (
              <div className="partner-success" role="status">
                <CheckCircle2 size={34} />
                <h3>{done ? 'Application sent' : 'You already applied'}</h3>
                <p>The organizers see it in their inbox. Track the status in your profile.</p>
                <Button asChild><Link to="/profile" onClick={onClose}>Open profile<ArrowUpRight /></Link></Button>
              </div>
            ) : closed ? (
              <div className="modal-info"><strong>The deadline has passed.</strong></div>
            ) : !user || !profile ? (
              <div className="modal-info">
                <strong>Sign in to apply</strong>
                <span>Your CV from your profile is attached automatically.</span>
                <div className="dialog-actions">
                  <Button asChild size="sm"><Link to="/login" onClick={onClose}><LogIn />Sign in</Link></Button>
                  <Button asChild size="sm" variant="outline"><Link to="/register" onClick={onClose}>Register</Link></Button>
                </div>
              </div>
            ) : profile.role !== 'student' && profile.role !== 'phd' ? (
              <div className="modal-info">
                <strong>Applications are for students</strong>
                <span>Teachers and partners publish opportunities and review applicants in Manage.</span>
              </div>
            ) : (
              <form className="partner-form" onSubmit={submit} noValidate>
                <label>Why are you a good fit?
                  <textarea rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Relevant courses, projects, links, weekly availability…" aria-invalid={!!errors['note']} />
                  {errors['note'] && <small className="field-error">{errors['note']}</small>}
                </label>

                <div className="cv-box">
                  <span className="sub-title">CV</span>
                  {hasCv && !replace ? (
                    <div className="cv-current">
                      <FileText size={16} />
                      <span>{profile.cvFilename ?? 'cv.pdf'} <small>· from your profile</small></span>
                      <Button type="button" size="sm" variant="ghost" onClick={viewCv}>View</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setReplace(true)}><RefreshCw />Use another CV</Button>
                    </div>
                  ) : (
                    <span className={file ? 'file-pick file-picked' : 'file-pick'}>
                      {file ? <FileText size={16} /> : <Upload size={16} />}
                      <span>{file ? file.name : 'Upload a CV for this application (PDF, ≤ 5 MB)'}</span>
                      <input type="file" accept="application/pdf,.pdf" aria-label="Upload CV" onChange={(e) => pick(e.target.files?.[0])} />
                    </span>
                  )}
                  {hasCv && replace && <button type="button" className="link-button small-note" onClick={() => { setReplace(false); setFile(null); }}>Keep my profile CV instead</button>}
                  {errors['cv'] && <small className="field-error">{errors['cv']}</small>}
                </div>

                <div className="form-bottom">
                  <small>Only the organizers of this opportunity can open your CV. A replacement CV is used for this application only.</small>
                  <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Apply with CV'}<ArrowUpRight /></Button>
                </div>
              </form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
