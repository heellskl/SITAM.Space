import { createFileRoute } from '@tanstack/react-router';
import { LabsFeed } from '@/components/labs-feed';
import { pageHead } from '@/lib/hub-data';

export const Route = createFileRoute('/labs/')({
  validateSearch: (s: Record<string, unknown>): { lab?: string } => (typeof s['lab'] === 'string' && s['lab'] ? { lab: s['lab'].slice(0, 80) } : {}),
  head: () => pageHead('Labs', 'All laboratories of the School of Information Technologies and Applied Mathematics at SDU University.'),
  component: Labs,
});

function Labs() {
  const { lab } = Route.useSearch();
  return (
    <main className="container content-page">
      <h1>Laboratories</h1>
      <div className="mt-6"><LabsFeed selected={lab} /></div>
    </main>
  );
}
