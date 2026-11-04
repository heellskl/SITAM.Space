import { useState, type FormEvent } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Crown, Pencil, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PeoplePicker } from '@/components/people-picker';
import { SearchBar } from '@/components/search-bar';
import { TagManager } from '@/components/tag-manager';
import { ResearcherRequestsAdmin } from '@/components/onboarding';
import { ScopusBulkImport } from '@/components/publications-editor';
import { AiIndexPanel } from '@/components/ai-index-panel';
import { AccountClaimsPanel, CompanyRequestsPanel } from '@/components/manage-panels';
import { HEAD_ROLES, LAB_CENTERS, humanError, useAdminLabActions, useLabPassports, useLabs, useSetLabCenter, useSetLabKind, type Lab, type LabCenter } from '@/lib/api';

const COMMUNITY = '__community__';
import { useAuth } from '@/lib/auth';
import { pageHead } from '@/lib/hub-data';
import { LAB_FOCUS } from '@/lib/sitam-data';

export const Route = createFileRoute('/admin')({
  head: () => pageHead('Admin', 'SITAM coordinator: labs and lab heads.'),
  component: Admin,
});

/** Coordinator only: all labs, create / edit / delete, assign or remove lab heads. The database checks every action. */
function Admin() {
  const { caps, loading } = useAuth();
  const labs = useLabs();
  const actions = useAdminLabActions();
  const setKind = useSetLabKind();
  const setCenter = useSetLabCenter();
  const passports = useLabPassports(undefined, caps.isCoordinator);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [focus, setFocus] = useState<string>(LAB_FOCUS[0]);
  const [toDelete, setToDelete] = useState<Lab | null>(null);

  if (loading) return <main className="container content-page"><p className="small-note">Loading…</p></main>;
  if (!caps.isCoordinator) {
    return (
      <main className="container content-page auth-page">
        <h1>Admin</h1>
        <p className="page-intro">This page is for the SITAM coordinator.</p>
      </main>
    );
  }

  const shown = (labs.data ?? []).filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase()));

  function create(e: FormEvent) {
    e.preventDefault();
    const community = focus === COMMUNITY;
    actions.createLab.mutate(
      { name, focus: community ? [] : [focus] },
      {
        onSuccess: (row) => {
          const id = (row as { id?: string } | null)?.id;
          if (community && id) setKind.mutate({ id, kind: 'community' }, { onError: (err) => toast.error(humanError(err)) });
          toast.success(community ? 'Community created' : 'Lab created', { description: name });
          setName('');
        },
        onError: (err) => toast.error(humanError(err)),
      },
    );
  }

  return (
    <main className="container content-page">
      <h1><ShieldCheck className="inline" size={34} /> Admin</h1>

      <div className="profile-grid mt-6">
        <AccountClaimsPanel />
        <CompanyRequestsPanel />
      </div>

      <section className="panel mt-6">
        <h3 className="panel-title"><Plus size={15} />New lab</h3>
        <form className="inline-form" onSubmit={create}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lab name" maxLength={120} aria-label="Lab name" style={{ flex: '1 1 260px' }} />
          <select value={focus} onChange={(e) => setFocus(e.target.value)} aria-label="Category">
            {LAB_FOCUS.map((f) => <option key={f} value={f}>{f}</option>)}
            <option value={COMMUNITY}>Student community</option>
          </select>
          <Button type="submit" disabled={actions.createLab.isPending || name.trim().length < 2}><Plus />Create</Button>
        </form>
      </section>

      <section className="panel mt-4">
        <h3 className="panel-title"><Crown size={15} />Labs and heads · {(labs.data ?? []).length}</h3>
        <SearchBar value={q} onChange={setQ} placeholder="Search labs" />
        {labs.isLoading && <p className="small-note">Loading labs…</p>}
        {shown.map((l) => {
          const heads = l.lab_members.filter((m) => HEAD_ROLES.includes(m.role) && m.user_id);
          const unlinked = l.lab_members.filter((m) => HEAD_ROLES.includes(m.role) && !m.user_id);
          return (
            <div key={l.id} className="admin-lab">
              <div className="admin-lab-head">
                <strong><Link to="/labs/$slug" params={{ slug: l.slug }}>{l.name}</Link> <small className="small-note">{l.kind === 'community' ? 'Community' : l.focus.join(' · ')}</small></strong>
                <Button size="sm" variant="ghost" disabled={setKind.isPending} title="Show it under Labs or under Communities"
                  onClick={() => setKind.mutate({ id: l.id, kind: l.kind === 'community' ? 'lab' : 'community' }, { onError: (err) => toast.error(humanError(err)) })}>
                  {l.kind === 'community' ? 'Make it a lab' : 'Make it a community'}
                </Button>
                {l.kind !== 'community' && (
                  <select className="filter-select" aria-label={`Research center of ${l.name}`} value={l.center ?? 'ai'} disabled={setCenter.isPending}
                    onChange={(e) => setCenter.mutate({ id: l.id, center: e.target.value as LabCenter }, { onError: (err) => toast.error(humanError(err)) })}>
                    {LAB_CENTERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                {(() => {
                  const pp = (passports.data ?? []).find((x) => x.lab_id === l.id);
                  return pp ? <Link to="/labs/$slug" params={{ slug: l.slug }} search={{ passport: true }} className="small-note">Passport: {pp.status === 'submitted' ? 'to approve' : pp.status}</Link> : null;
                })()}
                <Button asChild size="sm" variant="outline"><Link to="/labs/$slug" params={{ slug: l.slug }} search={{ edit: true }}><Pencil />Edit</Link></Button>
                <Button size="sm" variant="ghost" onClick={() => setToDelete(l)} aria-label={`Delete ${l.name}`}><Trash2 /></Button>
              </div>
              <div className="inline-form">
                {heads.length === 0 && <span className="small-note">No head assigned.</span>}
                {heads.map((h) => (
                  <span key={h.id} className="head-chip">
                    <Crown size={12} />{h.full_name}
                    <button
                      type="button"
                      aria-label={`Remove ${h.full_name} as head`}
                      title="Remove as head (stays a member)"
                      onClick={() => actions.removeHead.mutate({ labId: l.id, userId: h.user_id! }, { onSuccess: () => toast.success(`${h.full_name} is no longer head`), onError: (err) => toast.error(humanError(err)) })}
                    ><X size={13} /></button>
                  </span>
                ))}
                {unlinked.map((h) => <span key={h.id} className="small-note">{h.full_name} (head in the lab form, not linked yet: confirm the account above once they register)</span>)}
              </div>
              <PeoplePicker
                placeholder="Assign a head: search users by name or e-mail"
                exclude={heads.map((h) => h.user_id!)}
                onPick={(p) => actions.assignHead.mutate({ labId: l.id, userId: p.id }, {
                  onSuccess: () => toast.success(`${p.first_name} ${p.last_name} is now head of ${l.name}`),
                  onError: (err) => toast.error(humanError(err)),
                })}
              />
            </div>
          );
        })}
      </section>

      <ResearcherRequestsAdmin />
      <ScopusBulkImport />
      <TagManager />
      <AiIndexPanel />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>The lab, its team list, projects and events hosted only by it are removed. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const l = toDelete; if (l) actions.deleteLab.mutate(l.id, { onSuccess: () => toast.success('Lab deleted'), onError: (err) => toast.error(humanError(err)) }); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
