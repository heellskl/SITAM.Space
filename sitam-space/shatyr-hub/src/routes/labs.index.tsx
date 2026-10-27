import { createFileRoute, redirect } from '@tanstack/react-router';
import { FlaskConical, Rocket, Users } from 'lucide-react';
import { LabsFeed } from '@/components/labs-feed';
import { ProjectsPanel } from '@/components/projects-panel';
import { pageHead } from '@/lib/hub-data';

type LabsTab = 'labs' | 'communities' | 'projects';
type LabsSearch = { lab?: string; tab?: LabsTab; ptab?: 'labs' | 'community' };
const TABS: { id: LabsTab; label: string; icon: typeof FlaskConical }[] = [
  { id: 'labs', label: 'Labs', icon: FlaskConical },
  { id: 'communities', label: 'Communities', icon: Users },
  { id: 'projects', label: 'Projects', icon: Rocket },
];

export const Route = createFileRoute('/labs/')({
  validateSearch: (s: Record<string, unknown>): LabsSearch => ({
    ...(typeof s['lab'] === 'string' && s['lab'] ? { lab: s['lab'].slice(0, 80) } : {}),
    ...(s['tab'] === 'communities' || s['tab'] === 'projects' ? { tab: s['tab'] } : {}),
    ...(s['ptab'] === 'community' ? { ptab: 'community' as const } : {}),
  }),
  // old links (/labs?lab=slug) open the lab's own page
  beforeLoad: ({ search }) => {
    if (search.lab) throw redirect({ to: '/labs/$slug', params: { slug: search.lab } });
  },
  head: () => pageHead('Labs', 'Laboratories, student communities and projects of the School of Information Technologies and Applied Mathematics at SDU University.'),
  component: Labs,
});

function Labs() {
  const { tab = 'labs', ptab = 'labs' } = Route.useSearch();
  const navigate = Route.useNavigate();
  const go = (t: LabsTab) => navigate({ search: t === 'labs' ? {} : { tab: t }, replace: true });
  return (
    <main className="container content-page">
      <h1>{tab === 'communities' ? 'Communities' : tab === 'projects' ? 'Projects' : 'Laboratories'}</h1>
      {/* Labs · Communities · Projects — under the heading, above the search */}
      <div className="view-switch labs-switch" role="tablist" aria-label="Show">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => go(id)}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === 'labs' && <LabsFeed kind="lab" />}
        {tab === 'communities' && <LabsFeed kind="community" />}
        {tab === 'projects' && (
          <ProjectsPanel tab={ptab} onTab={(t) => navigate({ search: { tab: 'projects', ...(t === 'community' ? { ptab: 'community' as const } : {}) }, replace: true })} />
        )}
      </div>
    </main>
  );
}
