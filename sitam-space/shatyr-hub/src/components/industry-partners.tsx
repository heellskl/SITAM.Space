// Industry page → "Partners": partner companies of SITAM. Everyone reads; the coordinator adds and edits
// (row-level security on industry_partners decides; the buttons only follow it).

import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { Building2, ExternalLink, GraduationCap, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  humanError, uploadLabImage, useDeletePartner, useIndustryPartners, useLabs, useSavePartner,
  type IndustryPartner, type IndustryPartnerDraft,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);

function PartnerCard({ p, labNames, onEdit }: { p: IndustryPartner; labNames: { slug: string; name: string }[]; onEdit?: (() => void) | undefined }) {
  const initials = (p.short_name ?? p.name).split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  return (
    <article className="partner-card">
      <header className="partner-card-head">
        <span className="partner-logo" aria-hidden>{p.logo_url ? <img src={p.logo_url} alt="" referrerPolicy="no-referrer" /> : initials}</span>
        <div className="min-w-0">
          <h3>{p.short_name ?? p.name}</h3>
          {p.short_name && p.short_name !== p.name && <small>{p.name}</small>}
        </div>
        {onEdit && <Button variant="ghost" size="icon" aria-label={`Edit ${p.name}`} onClick={onEdit}><Pencil /></Button>}
      </header>
      <dl className="partner-facts">
        <div><dt>CEO / Head</dt><dd>{p.ceo ?? '—'}</dd></div>
        <div><dt>Founded</dt><dd>{p.founded_year ?? '—'}</dd></div>
      </dl>
      {p.sdu_alumni.length > 0 && (
        <div className="partner-block">
          <h4><GraduationCap size={13} />SDU alumni there</h4>
          <p>{p.sdu_alumni.join(' · ')}</p>
        </div>
      )}
      {p.upcoming_projects.length > 0 && (
        <div className="partner-block">
          <h4>Upcoming projects</h4>
          <ul>{p.upcoming_projects.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      {p.completed_projects.length > 0 && (
        <div className="partner-block">
          <h4>Completed projects</h4>
          <ul>{p.completed_projects.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      <footer className="partner-card-foot">
        {labNames.map((l) => <Link key={l.slug} to="/labs/$slug" params={{ slug: l.slug }} className="pill pill-live">{l.name}</Link>)}
        {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer" className="partner-site"><ExternalLink size={12} />Website</a>}
      </footer>
    </article>
  );
}

export function IndustryPartners() {
  const { data, isLoading, error } = useIndustryPartners();
  const labs = useLabs();
  const { caps } = useAuth();
  const [editing, setEditing] = useState<IndustryPartner | 'new' | null>(null);
  const labOf = new Map((labs.data ?? []).map((l) => [l.id, { slug: l.slug, name: l.name }]));
  const list = data ?? [];
  return (
    <>
      {caps.isCoordinator && (
        <div className="dash-quick mb-3"><Button size="sm" variant="outline" onClick={() => setEditing('new')}><Plus />Add partner</Button></div>
      )}
      {error && <p className="form-alert">{humanError(error)}</p>}
      <div className="partner-grid">
        {isLoading && Array.from({ length: 3 }, (_, i) => <div key={i} className="partner-card skeleton-card" aria-hidden />)}
        {list.map((p) => (
          <PartnerCard key={p.id} p={p} labNames={p.lab_ids.map((id) => labOf.get(id)).filter((x): x is { slug: string; name: string } => !!x)}
            onEdit={caps.isCoordinator ? () => setEditing(p) : undefined} />
        ))}
      </div>
      {!isLoading && list.length === 0 && <div className="mini-empty"><Building2 size={20} /><p>No partners yet.</p></div>}
      {editing && <PartnerDialog partner={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PartnerDialog({ partner, onClose }: { partner: IndustryPartner | null; onClose: () => void }) {
  const save = useSavePartner();
  const del = useDeletePartner();
  const labs = useLabs();
  const { user } = useAuth();
  const [logo, setLogo] = useState<File | null>(null);
  const [labIds, setLabIds] = useState<string[]>(partner?.lab_ids ?? []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim();
    const year = s('founded_year');
    if (s('name').length < 2) return setError('Enter the company name.');
    if (year && !/^\d{4}$/.test(year)) return setError('Founding year: four digits, e.g. 2008.');
    if (s('website') && !/^https?:\/\//i.test(s('website'))) return setError('The website must start with https://');
    setBusy(true);
    try {
      const logo_url = logo ? await uploadLabImage(user?.id ?? '', logo, 'partners') : partner?.logo_url ?? null;
      const d: IndustryPartnerDraft = {
        id: partner?.id ?? null, name: s('name'), short_name: s('short_name') || null, logo_url, website: s('website') || null, ceo: s('ceo') || null,
        founded_year: year ? Number(year) : null, sdu_alumni: lines(s('sdu_alumni')), upcoming_projects: lines(s('upcoming_projects')),
        completed_projects: lines(s('completed_projects')), lab_ids: labIds, sort_order: partner?.sort_order ?? 100,
      };
      await save.mutateAsync(d);
      toast.success(partner ? 'Partner updated' : 'Partner added', { description: d.name });
      onClose();
    } catch (err) {
      setError(humanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="hub-dialog wide">
        <span className="eyebrow">Industry partners</span>
        <DialogTitle>{partner ? `Edit ${partner.name}` : 'Add a partner'}</DialogTitle>
        <DialogDescription>Shown to everyone on the Industry page. One item per line in the lists.</DialogDescription>
        <form className="partner-form auth-form" onSubmit={submit} noValidate>
          <div className="auth-row">
            <label>Company name<input name="name" defaultValue={partner?.name ?? ''} maxLength={160} placeholder="Freedom Holding Corp." /></label>
            <label>Short name<input name="short_name" defaultValue={partner?.short_name ?? ''} maxLength={40} placeholder="Freedom" /></label>
          </div>
          <div className="auth-row">
            <label>CEO / Head<input name="ceo" defaultValue={partner?.ceo ?? ''} maxLength={160} /></label>
            <label>Founding year<input name="founded_year" defaultValue={partner?.founded_year ?? ''} inputMode="numeric" maxLength={4} placeholder="2008" /></label>
          </div>
          <label>Website<input name="website" defaultValue={partner?.website ?? ''} placeholder="https://" /></label>
          <label className="file-pick"><Upload size={14} />{logo ? logo.name : partner?.logo_url ? 'Replace logo' : 'Upload logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          </label>
          <label>SDU alumni working / who worked there<textarea name="sdu_alumni" rows={2} defaultValue={partner?.sdu_alumni.join('\n') ?? ''} /></label>
          <div className="auth-row">
            <label>Upcoming projects<textarea name="upcoming_projects" rows={3} defaultValue={partner?.upcoming_projects.join('\n') ?? ''} /></label>
            <label>Completed projects<textarea name="completed_projects" rows={3} defaultValue={partner?.completed_projects.join('\n') ?? ''} /></label>
          </div>
          <fieldset><legend>Works with labs</legend>
            <div className="chip-filter">
              {(labs.data ?? []).map((l) => {
                const on = labIds.includes(l.id);
                return <button key={l.id} type="button" className={on ? 'chip is-on' : 'chip'} aria-pressed={on} onClick={() => setLabIds((x) => (on ? x.filter((y) => y !== l.id) : [...x, l.id]))}>{l.name}</button>;
              })}
            </div>
          </fieldset>
          {error && <p className="form-alert" role="alert">{error}</p>}
          <div className="dialog-actions wrap">
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : partner ? 'Save' : 'Add partner'}</Button>
            {partner && (
              <Button type="button" variant="ghost" disabled={del.isPending} onClick={() => {
                if (!window.confirm(`Delete partner “${partner.name}”?`)) return;
                del.mutate(partner.id, { onSuccess: () => { toast.success('Partner deleted'); onClose(); }, onError: (err) => setError(humanError(err)) });
              }}><Trash2 />Delete</Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
