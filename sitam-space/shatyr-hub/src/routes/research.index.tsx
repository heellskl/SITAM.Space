import { createFileRoute } from '@tanstack/react-router';
import { ResearchPublications } from '@/components/research-publications';
import { SubmitProjectButton } from '@/components/submit-project';
import { pageHead } from '@/lib/hub-data';

export const Route = createFileRoute('/research/')({
  validateSearch: (s: Record<string, unknown>): { q?: string } => (typeof s['q'] === 'string' && s['q'].trim() ? { q: s['q'].slice(0, 100) } : {}),
  head: () => pageHead('Research', 'Publications, citations and research topics of SDU researchers (Scopus).'),
  component: Research,
});

function Research() {
  const { q } = Route.useSearch();
  return (
    <main className="container content-page">
      <div className="page-head-row">
        <h1>Research</h1>
        <SubmitProjectButton kind="research" label="Submit your research" />
      </div>
      <div className="mt-6"><ResearchPublications key={q ?? ''} initialQuery={q ?? ''} /></div>
    </main>
  );
}
