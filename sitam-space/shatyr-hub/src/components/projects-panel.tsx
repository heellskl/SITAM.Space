// Projects, shown inside the Labs page (tab "Projects"): lab projects and students' own projects.

import { Link } from '@tanstack/react-router';
import { FlaskConical, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectsShowcase } from '@/components/projects-showcase';
import { SubmitProjectButton } from '@/components/submit-project';
import { useAuth } from '@/lib/auth';

export type ProjectsTab = 'labs' | 'community';

export function ProjectsPanel({ tab, onTab }: { tab: ProjectsTab; onTab: (t: ProjectsTab) => void }) {
  const { caps } = useAuth();
  const first = caps.managedLabs[0];
  return (
    <>
      <div className="dash-quick projects-quick">
        {first && (
          <Button asChild variant="outline"><Link to="/labs/$slug" params={{ slug: first.slug }} search={{ edit: true }}><Plus />New lab project{caps.managedLabs.length > 1 ? ` · ${first.name}` : ''}</Link></Button>
        )}
        <SubmitProjectButton kind="project" label="Submit your project" />
      </div>
      <Tabs className="mt-4" value={tab} onValueChange={(v) => onTab(v as ProjectsTab)}>
        <TabsList className="manage-tabs">
          <TabsTrigger value="labs"><FlaskConical size={14} />Lab projects</TabsTrigger>
          <TabsTrigger value="community"><Users size={14} />Student projects</TabsTrigger>
        </TabsList>
        <TabsContent value="labs"><ProjectsShowcase source="lab" /></TabsContent>
        <TabsContent value="community"><ProjectsShowcase source="community" kinds={['project']} /></TabsContent>
      </Tabs>
    </>
  );
}
