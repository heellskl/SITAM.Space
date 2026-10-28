import { createFileRoute } from '@tanstack/react-router';
import { RESEARCH_TABS, ResearchPublications, type ResearchTab } from '@/components/research-publications';
import { SubmitProjectButton } from '@/components/submit-project';
import { pageHead } from '@/lib/hub-data';

export const Route = createFileRoute('/research/')({
  // the open tab and the search text live in the address, so "Back" from a researcher returns to the same place
  validateSearch: (s: Record<string, unknown>): { q?: string; tab?: ResearchTab } => ({
    ...(typeof s['q'] === 'string' && s['q'].trim() ? { q: s['q'].slice(0, 100) } : {}),
    ...(typeof s['tab'] === 'string' && (RESEARCH_TABS as readonly string[]).includes(s['tab']) && s['tab'] !== 'overview' ? { tab: s['tab'] as ResearchTab } : {}),
  }),
  head: () => pageHead('Research', 'Publications, citations and research topics of SDU researchers (Scopus).'),
  component: Research,
});

function Research() {
  const { q = '', tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  // legacy links (/research?q=…) open Publications
  const current: ResearchTab = tab ?? (q ? 'search' : 'overview');
  const set = (next: { q?: string; tab?: ResearchTab }) => {
    const nq = next.q ?? q;
    const nt = next.tab ?? current;
    void navigate({ search: { ...(nq.trim() ? { q: nq } : {}), ...(nt !== 'overview' ? { tab: nt } : {}) }, replace: true });
  };
  return (
    <main className="container content-page">
      <div className="page-head-row">
        <h1>Research</h1>
        <SubmitProjectButton kind="research" label="Submit your research" />
      </div>
      <div className="mt-6"><ResearchPublications query={q} tab={current} onQuery={(v) => set({ q: v })} onTab={(t) => set({ tab: t })} /></div>
    </main>
  );
}
