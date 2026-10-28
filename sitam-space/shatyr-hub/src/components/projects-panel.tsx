// Projects, shown inside the Labs page (tab "Projects"): lab projects and students' projects in one list.
// Lab heads add a lab project from the same "Submit your project" button (next to the search).

import { ProjectsShowcase } from '@/components/projects-showcase';
import { SubmitProjectButton } from '@/components/submit-project';

export function ProjectsPanel() {
  return <ProjectsShowcase source="all" action={<SubmitProjectButton kind="project" label="Submit your project" />} />;
}
