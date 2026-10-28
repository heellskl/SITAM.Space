// Projects, shown inside the Labs page (tab "Projects"): lab projects and students' projects in one list.
// Lab heads add a lab project from the same "Submit your project" button.

import { ProjectsShowcase } from '@/components/projects-showcase';
import { SubmitProjectButton } from '@/components/submit-project';

export function ProjectsPanel() {
  return (
    <>
      <div className="dash-quick projects-quick">
        <SubmitProjectButton kind="project" label="Submit your project" />
      </div>
      <div className="mt-4"><ProjectsShowcase source="all" /></div>
    </>
  );
}
