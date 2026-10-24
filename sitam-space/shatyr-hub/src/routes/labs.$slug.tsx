import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LabEditor } from '@/components/lab-editor';
import { LabTeamManager } from '@/components/lab-team';
import { LabPage } from '@/components/lab-page';
import { humanError, useLab } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export const Route = createFileRoute('/labs/$slug')({
  validateSearch: (s: Record<string, unknown>): { edit?: boolean; team?: boolean } => {
    const on = (v: unknown) => v === true || v === '1' || v === 1 || v === 'true';
    return { ...(on(s['edit']) ? { edit: true } : {}), ...(on(s['team']) ? { team: true } : {}) };
  },
  head: () => ({ meta: [{ title: 'Lab — SITAM SPACE · SDU' }] }),
  component: LabRoute,
});

function LabRoute() {
  const { slug } = Route.useParams();
  const { edit, team } = Route.useSearch();
  const navigate = useNavigate();
  const { caps, loading } = useAuth();
  const { data: lab, isLoading, error, refetch } = useLab(slug);

  if (isLoading) return <main className="container content-page"><p className="small-note">Loading lab…</p></main>;
  if (error) return <main className="container content-page"><p className="form-alert">{humanError(error)}</p></main>;
  if (!lab) {
    return (
      <main className="container content-page">
        <div className="empty-state">
          <FlaskConical />
          <h3>Lab not found</h3>
          <Button asChild variant="outline"><Link to="/labs"><ArrowLeft />All labs</Link></Button>
        </div>
      </main>
    );
  }
  const canEdit = caps.isAdmin || caps.managedLabs.some((m) => m.id === lab.id);
  const close = () => navigate({ to: '/labs/$slug', params: { slug }, search: {} });
  const openEditor = () => navigate({ to: '/labs/$slug', params: { slug }, search: { edit: true } });
  const openTeam = () => navigate({ to: '/labs/$slug', params: { slug }, search: { team: true } });
  if (edit && !loading && canEdit) return <LabEditor lab={lab} onDone={() => { void refetch(); void close(); }} />;
  if (team && !loading && canEdit) return <LabTeamManager lab={lab} onEdit={openEditor} />;
  return <LabPage lab={lab} onEdit={openEditor} onTeam={openTeam} />;
}
