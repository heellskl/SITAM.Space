// v33: Home → Awards. A person's own certificates (PDF / image in the private `certificates` bucket),
// each optionally linked to a lab. The owner adds, edits and removes them; heads of the linked lab and the
// coordinator can also read them (RLS `certificates`, docs/PERMISSIONS.md rows 47–48).

import { useMemo, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { Award, ExternalLink, FileText, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import {
  certificateUrl, humanError, useAddCertificate, useDeleteCertificate, useLabs, useMyCertificates, useUpdateCertificate,
  type Certificate, type CertificateDraft,
} from '@/lib/api';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function CertificateDialog({ userId, cert, open, onOpenChange }: { userId: string; cert: Certificate | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { caps } = useAuth();
  const labs = useLabs();
  const add = useAddCertificate();
  const update = useUpdateCertificate();
  // the dialog is mounted fresh for every opening (key in MyAwards), so the form starts from `cert`
  const [draft, setDraft] = useState<CertificateDraft>(() =>
    cert ? { title: cert.title, issuer: cert.issuer ?? '', issued_on: cert.issued_on ?? '', lab_id: cert.lab_id ?? '' }
      : { title: '', issuer: '', issued_on: '', lab_id: '' });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const set = (k: keyof CertificateDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const busy = add.isPending || update.isPending;

  // own labs first, then all the others
  const mine = new Set(caps.labMemberships.map((m) => m.id));
  const myLabs = (labs.data ?? []).filter((l) => mine.has(l.id));
  const otherLabs = (labs.data ?? []).filter((l) => !mine.has(l.id));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (draft.title.trim().length < 2) return setError('Enter the name of the certificate.');
    if (!cert && !file) return setError('Choose the certificate file (PDF, JPG, PNG or WebP, up to 5 MB).');
    try {
      if (cert) await update.mutateAsync({ id: cert.id, draft });
      else await add.mutateAsync({ userId, file: file!, draft });
      toast.success(cert ? 'Certificate updated' : 'Certificate added');
      onOpenChange(false);
    } catch (err) { setError(humanError(err)); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="hub-dialog">
        <span className="eyebrow">Awards</span>
        <DialogTitle>{cert ? 'Edit certificate' : 'Upload a certificate'}</DialogTitle>
        <DialogDescription>Choose the lab it belongs to so the heads of that lab can see it.</DialogDescription>
        <form className="partner-form auth-form" onSubmit={submit} noValidate>
          <label>Certificate name<input value={draft.title} maxLength={160} onChange={(e) => set('title', e.target.value)} placeholder="AWS Certified Cloud Practitioner" required /></label>
          <div className="auth-row">
            <label>Issued by<input value={draft.issuer} maxLength={160} onChange={(e) => set('issuer', e.target.value)} placeholder="Amazon Web Services" /></label>
            <label>Date<input type="date" value={draft.issued_on} onChange={(e) => set('issued_on', e.target.value)} /></label>
          </div>
          <label>Laboratory
            <select value={draft.lab_id} onChange={(e) => set('lab_id', e.target.value)}>
              <option value="">Not related to a lab</option>
              {myLabs.length > 0 && <optgroup label="My labs">{myLabs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>}
              <optgroup label={myLabs.length ? 'Other labs' : 'Labs'}>{otherLabs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
            </select>
          </label>
          {!cert && (
            <label>File
              <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <small className="small-note">PDF, JPG, PNG or WebP, up to 5 MB.</small>
            </label>
          )}
          {error && <p className="form-alert" role="alert">{error}</p>}
          <div className="editor-actions exp-actions">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}><X />Cancel</Button>
            <Button type="submit" className="editor-save" disabled={busy}>{busy ? 'Saving…' : cert ? 'Save' : <><Upload />Upload</>}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MyAwards({ userId }: { userId: string }) {
  const certs = useMyCertificates(userId);
  const remove = useDeleteCertificate();
  const [editing, setEditing] = useState<Certificate | null>(null);
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0); // remounts the dialog with a clean form on every opening
  const [confirm, setConfirm] = useState<string | null>(null);
  const list = useMemo(() => certs.data ?? [], [certs.data]);

  async function view(c: Certificate) {
    try { window.open(await certificateUrl(c.file_path), '_blank', 'noopener'); }
    catch (err) { toast.error(humanError(err)); }
  }
  async function drop(c: Certificate) {
    if (confirm !== c.id) { setConfirm(c.id); return; }
    try { await remove.mutateAsync(c); toast.success('Certificate removed'); }
    catch (err) { toast.error(humanError(err)); }
    setConfirm(null);
  }

  return (
    <section className="panel awards-panel">
      <div className="panel-head">
        <h3 className="panel-title"><Award size={15} />Certificates</h3>
        {certs.data !== null && <Button size="sm" onClick={() => { setEditing(null); setOpened((n) => n + 1); setOpen(true); }}><Plus />Upload certificate</Button>}
      </div>
      {certs.isLoading ? <p className="small-note">Loading…</p>
        : certs.data === null ? <p className="small-note home-empty">Available soon.</p>
        : list.length === 0 ? <p className="small-note home-empty">No certificates yet. Upload your first one and choose the lab it belongs to.</p>
        : (
          <ul className="cert-grid">
            {list.map((c) => (
              <li key={c.id} className="cert-card">
                <span className="cert-icon" aria-hidden><FileText size={18} /></span>
                <div className="cert-body">
                  <strong>{c.title}</strong>
                  <small>{[c.issuer, fmtDate(c.issued_on)].filter(Boolean).join(' · ') || 'Certificate'}</small>
                  {c.labs ? <Link to="/labs/$slug" params={{ slug: c.labs.slug }} className="cert-lab">{c.labs.name}</Link> : <span className="cert-lab is-none">No lab</span>}
                </div>
                <div className="cert-actions">
                  <Button size="sm" variant="outline" onClick={() => void view(c)}><ExternalLink />Open</Button>
                  <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => { setEditing(c); setOpened((n) => n + 1); setOpen(true); }}><Pencil /></Button>
                  <Button size="icon" variant="ghost" aria-label={confirm === c.id ? 'Click again to remove' : 'Remove'} title={confirm === c.id ? 'Click again to remove' : 'Remove'}
                    className={confirm === c.id ? 'is-danger' : ''} disabled={remove.isPending} onClick={() => void drop(c)} onBlur={() => setConfirm(null)}><Trash2 /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      <CertificateDialog key={`${editing?.id ?? 'new'}-${opened}`} userId={userId} cert={editing} open={open} onOpenChange={setOpen} />
    </section>
  );
}
