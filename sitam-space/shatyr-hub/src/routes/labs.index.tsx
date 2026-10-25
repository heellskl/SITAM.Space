import { createFileRoute, redirect } from '@tanstack/react-router';
import { LabsFeed } from '@/components/labs-feed';
import { pageHead } from '@/lib/hub-data';

export const Route = createFileRoute('/labs/')({
  validateSearch: (s: Record<string, unknown>): { lab?: string } => (typeof s['lab'] === 'string' && s['lab'] ? { lab: s['lab'].slice(0, 80) } : {}),
  // old links (/labs?lab=slug) open the lab's own page
  beforeLoad: ({ search }) => {
    if (search.lab) throw redirect({ to: '/labs/$slug', params: { slug: search.lab } });
  },
  head: () => pageHead('Labs', 'All laboratories of the School of Information Technologies and Applied Mathematics at SDU University.'),
  component: Labs,
});

function Labs() {
  return (
    <main className="container content-page">
      <h1>Laboratories</h1>
      <div className="mt-6"><LabsFeed /></div>
    </main>
  );
}
