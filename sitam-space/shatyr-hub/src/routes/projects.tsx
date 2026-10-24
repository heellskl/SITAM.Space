import { createFileRoute, Link } from '@tanstack/react-router';
import { FlaskConical, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectsShowcase } from '@/components/projects-showcase';
import { SubmitProjectButton } from '@/components/submit-project';
import { useAuth } from '@/lib/auth';
import { pageHead } from '@/lib/hub-data';

export const Route = createFileRoute('/projects')({
  validateSearch: (s: Record<string, unknown>): { tab?: 'labs' | 'community' } => (s['tab'] === 'community' || s['tab'] === 'labs' ? { tab: s['tab'] } : {}),
  head: () => pageHead('Projects', 'Projects of SDU laboratories and students.'),
  component: Projects,
});

/** Lab projects (added by lab heads) and students' own projects (submitted, reviewed by the SITAM office). */
function Projects() {
  const { caps } = useAuth();
  const { tab = 'labs' } = Route.useSearch();
  const navigate = Route.useNavigate();
  const first = caps.managedLabs[0];
  return (
    <main className="container content-page">
      <div className="page-head-row">
        <h1>Projects</h1>
        <div className="dash-quick">
          {first && (
            <Button asChild variant="outline"><Link to="/labs/$slug" params={{ slug: first.slug }} search={{ edit: true }}><Plus />New lab project{caps.managedLabs.length > 1 ? ` · ${first.name}` : ''}</Link></Button>
          )}
          <SubmitProjectButton kind="project" label="Submit your project" />
        </div>
      </div>
      <Tabs className="mt-6" value={tab} onValueChange={(v) => navigate({ search: { tab: v as 'labs' | 'community' }, replace: true })}>
        <TabsList className="manage-tabs">
          <TabsTrigger value="labs"><FlaskConical size={14} />Lab projects</TabsTrigger>
          <TabsTrigger value="community"><Users size={14} />Student projects</TabsTrigger>
        </TabsList>
        <TabsContent value="labs"><ProjectsShowcase source="lab" /></TabsContent>
        <TabsContent value="community"><ProjectsShowcase source="community" kinds={['project']} /></TabsContent>
      </Tabs>
    </main>
  );
}
