import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { BookOpen, ExternalLink, FlaskConical, GitBranch, Lightbulb, Rocket, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/search-bar';
import { KIND_LABEL, humanError, useProjects, type Project, type ProjectKind, type ProjectStatus } from '@/lib/api';
import { mineFirst, useMyLabs } from '@/lib/my-labs';

export function ProjectCard({ p }: { p: Project }) {
  const Icon = p.kind === 'startup' ? Rocket : p.kind === 'project' ? Lightbulb : FlaskConical;
  return (
    <article className="project-card">
      <div className="opp-head">
        <span className={`lab-icon ${p.kind === 'startup' ? 'gold' : p.kind === 'project' ? 'green' : 'blue'}`}><Icon size={20} /></span>
        <span className={`pill ${p.status === 'completed' ? 'pill-done' : 'pill-live'}`}>{p.status === 'completed' ? `Completed${p.year ? ` · ${p.year}` : ''}` : 'Ongoing'}</span>
      </div>
      <span className="eyebrow">{KIND_LABEL[p.kind]}{p.labs ? <> · <Link to="/labs/$slug" params={{ slug: p.labs.slug }}>{p.labs.name}</Link></> : ' · Community'}</span>
      <h3>{p.title}</h3>
      {!p.labs && p.authors.length > 0 && <p className="project-authors"><Users size={13} /> {p.authors.join(', ')}</p>}
      {p.summary && <p className="opp-desc">{p.summary}</p>}
      {p.tags.length > 0 && <div className="stack-list">{p.tags.map((t) => <span key={t}>{t}</span>)}</div>}
      {(p.github_url || p.demo_url || p.paper_url) && (
        <div className="project-links">
          {p.demo_url && <Button asChild size="sm"><a href={p.demo_url} target="_blank" rel="noopener noreferrer"><ExternalLink />Demo</a></Button>}
          {p.github_url && <Button asChild size="sm" variant="outline"><a href={p.github_url} target="_blank" rel="noopener noreferrer"><GitBranch />Code</a></Button>}
          {p.paper_url && <Button asChild size="sm" variant="outline"><a href={p.paper_url} target="_blank" rel="noopener noreferrer"><BookOpen />Paper</a></Button>}
        </div>
      )}
    </article>
  );
}

/**
 * `source`: "lab" = projects of SDU labs, "community" = approved student / PhD submissions, "all" = both.
 * `status` limits to completed/ongoing; `kinds` limits the types; `limit` for previews.
 */
export function ProjectsShowcase({ limit, status, source = 'lab', kinds }: { limit?: number; status?: ProjectStatus; source?: 'lab' | 'community' | 'all'; kinds?: ProjectKind[] }) {
  const [lab, setLab] = useState('all');
  const [query, setQuery] = useState('');
  const { data, isLoading, error } = useProjects();
  const my = useMyLabs();

  const base = useMemo(
    () =>
      (data ?? []).filter(
        (p) =>
          (!status || p.status === status) &&
          (source === 'all' || (source === 'lab' ? !!p.lab_id : !p.lab_id)) &&
          (!kinds || kinds.includes(p.kind)) &&
          p.kind !== 'startup',
      ),
    [data, status, source, kinds],
  );
  const labs = useMemo(() => Array.from(new Set(base.map((p) => p.labs?.name).filter((n): n is string => !!n))).sort(), [base]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = base.filter(
      (p) =>
        (lab === 'all' || p.labs?.name === lab) &&
        `${p.title} ${p.summary ?? ''} ${p.tags.join(' ')} ${p.labs?.name ?? ''} ${p.authors.join(' ')}`.toLowerCase().includes(q),
    );
    // projects with a demo first, then most recent
    list.sort((a, b) => Number(!!b.demo_url) - Number(!!a.demo_url) || (b.year ?? 0) - (a.year ?? 0));
    const ordered = mineFirst(list, (p) => my.isMineLab(p.lab_id)); // projects of the head's own labs first
    return limit ? ordered.slice(0, limit) : ordered;
  }, [base, lab, query, limit, my]);

  return (
    <>
      {!limit && <SearchBar value={query} onChange={setQuery} placeholder="Search projects" />}
      {!limit && (
        <div className="lab-controls">
          <div className="filter-list" aria-label="Project type">
            {labs.length > 0 && (
              <select className="filter-select" value={lab} onChange={(e) => setLab(e.target.value)} aria-label="Lab">
                <option value="all">All labs</option>
                {labs.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            )}
          </div>
        </div>
      )}
      {error && <p className="form-alert">{humanError(error)}</p>}
      <div className="project-grid">
        {isLoading && Array.from({ length: limit ?? 6 }, (_, i) => <div key={i} className="project-card skeleton-card" aria-hidden />)}
        {shown.map((p) => <ProjectCard key={p.id} p={p} />)}
      </div>
      {!isLoading && shown.length === 0 && (
        <div className="empty-state">
          <Rocket />
          <h3>No projects yet</h3>
        </div>
      )}
    </>
  );
}
