import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, BookOpen, ExternalLink, GraduationCap, Quote, Search, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/search-bar';
import { RequestResearcherCta } from '@/components/onboarding';
import { VIZ, axisProps as axis, tooltipProps } from '@/lib/chart-style';
import { mineFirst, personKey, useMyLabs } from '@/lib/my-labs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { humanError, useProfessors, useProjects, usePublications, type Professor, type Publication } from '@/lib/api';
import { ProjectCard } from '@/components/projects-showcase';
import { SubmitProjectButton } from '@/components/submit-project';


const kindOf = (t: string | null) => (/article/i.test(t ?? '') ? 'article' : /conference/i.test(t ?? '') ? 'conference' : 'other');

export function PublicationRow({ p, showAuthors = true, onKeyword, terms = [] }: { p: Publication; showAuthors?: boolean; onKeyword?: (k: string) => void; terms?: string[] }) {
  const authors = p.publication_authors.map((a) => a.professors).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <li className="pub-row">
      <div className="pub-year">{p.year ?? '—'}</div>
      <div className="pub-body">
        <strong>{p.title}</strong>
        <small>{[p.type, p.venue].filter(Boolean).join(' · ')}</small>
        {showAuthors && authors.length > 0 && (
          <small className="pub-authors">
            {authors.map((a, i) => (
              <span key={a.username}>{i > 0 && ', '}<Link to="/research/$username" params={{ username: a.username }}>{a.full_name}</Link></span>
            ))}
          </small>
        )}
        {p.keywords.length > 0 && (
          <div className="stack-list">
            {p.keywords.slice(0, 8).map((k) => {
              const hit = terms.some((t) => k.toLowerCase().includes(t));
              return onKeyword
                ? <button key={k} type="button" className={hit ? 'kw-chip hit' : 'kw-chip'} onClick={() => onKeyword(k)} title={`Search papers about “${k}”`}>{k}</button>
                : <span key={k} className={hit ? 'hit' : undefined}>{k}</span>;
            })}
          </div>
        )}
      </div>
      <div className="pub-side">
        <span className="pub-cites" title="Citations"><Quote size={12} />{p.citations}</span>
        {p.is_open_access && <span className="pill pill-live"><Unlock size={11} />Open</span>}
        {(p.doi || p.url) && <a className="pub-link" href={p.doi ?? p.url ?? '#'} target="_blank" rel="noopener noreferrer" aria-label="Open publication"><ExternalLink size={14} /></a>}
      </div>
    </li>
  );
}

export function ProfessorCard({ p }: { p: Professor }) {
  return (
    <Link to="/research/$username" params={{ username: p.username }} className="prof-card">
      <span className="avatar">{p.photo_url ? <img src={p.photo_url} alt="" /> : `${p.first_name[0] ?? ''}${p.last_name[0] ?? ''}`}</span>
      <div className="prof-main">
        <strong>{p.full_name}</strong>
        <small>{[p.job_title, p.degree].filter(Boolean).join(' · ')}</small>
        <div className="stack-list">{p.keywords.slice(0, 4).map((k) => <span key={k}>{k}</span>)}</div>
      </div>
      <div className="prof-metrics">
        <span><b>{p.total_works}</b>works</span>
        <span><b>{p.total_citations}</b>citations</span>
        <span><b>{p.h_index}</b>h-index</span>
      </div>
      <ArrowUpRight className="card-arrow" size={16} />
    </Link>
  );
}

export const RESEARCH_TABS = ['overview', 'people', 'search', 'community'] as const;
export type ResearchTab = (typeof RESEARCH_TABS)[number];
const PLACEHOLDER: Record<ResearchTab, string> = {
  overview: 'Search papers — the numbers and charts follow',
  people: 'Search researchers by name or by the papers they wrote',
  search: 'Search papers by keywords, title, venue or author',
  community: 'Search lab and student research',
};

/**
 * Research: one search bar, four tabs. The search works for the open tab — Researchers finds people
 * (by name, topics or the titles of their papers), Publications finds papers (with a period of years),
 * the last tab finds projects, and Overview recounts the numbers for the matching papers.
 */
export function ResearchPublications({ query, tab, onQuery, onTab }: { query: string; tab: ResearchTab; onQuery: (v: string) => void; onTab: (t: ResearchTab) => void }) {
  const profs = useProfessors();
  const pubs = usePublications();
  const projects = useProjects();
  const my = useMyLabs();
  // Community research + (for a lab head) the research of their own labs, which goes first.
  const community = mineFirst(
    (projects.data ?? []).filter((p) => p.kind === 'research' && (!p.lab_id || my.isMineLab(p.lab_id))),
    (p) => my.isMineLab(p.lab_id),
  );
  // period of years for Publications: from … to … (empty = open end)
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const kind = 'all' as 'all' | 'article' | 'conference' | 'other';

  const all = pubs.data ?? [];
  // researchers who are members of the head's labs first, and their papers first
  const isMyPerson = (fullName: string | undefined) => !!fullName && my.people.has(personKey(fullName));
  const people = useMemo(() => mineFirst(profs.data ?? [], (p) => isMyPerson(p.full_name)), [profs.data, my]);
  const years = useMemo(() => Array.from(new Set(all.map((p) => p.year).filter((y): y is number => !!y))).sort((a, b) => b - a), [all]);

  const terms = useMemo(() => query.toLowerCase().split(/[,;]+|\s+/).map((t) => t.trim()).filter((t) => t.length > 1), [query]);
  const hayOf = (p: Publication) => `${p.title} ${p.venue ?? ''} ${p.keywords.join(' ')} ${p.publication_authors.map((a) => a.professors?.full_name ?? '').join(' ')}`.toLowerCase();
  // Overview: the numbers and charts of the papers that match the search (all papers without a search)
  const scope = useMemo(() => (terms.length ? all.filter((p) => terms.every((t) => hayOf(p).includes(t))) : all), [all, terms]);

  const byYear = useMemo(() => {
    const m = new Map<number, { year: string; article: number; conference: number; other: number; total: number; citations: number }>();
    for (const p of scope) {
      if (!p.year) continue;
      const r = m.get(p.year) ?? { year: String(p.year), article: 0, conference: 0, other: 0, total: 0, citations: 0 };
      r[kindOf(p.type)] += 1;
      r.total += 1;
      r.citations += p.citations;
      m.set(p.year, r);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }, [scope]);

  const venues = useMemo(() => {
    const m = new Map<string, { venue: string; count: number; citations: number }>();
    for (const p of all) {
      if (!p.venue) continue;
      const r = m.get(p.venue) ?? { venue: p.venue, count: 0, citations: 0 };
      r.count += 1;
      r.citations += p.citations;
      m.set(p.venue, r);
    }
    return [...m.values()].sort((a, b) => b.count - a.count || b.citations - a.citations).slice(0, 10);
  }, [all]);

  const lo = yearFrom ? Number(yearFrom) : null;
  const hi = yearTo ? Number(yearTo) : null;
  const inPeriod = (y: number | null) => (lo === null && hi === null) || (!!y && (lo === null || y >= lo) && (hi === null || y <= hi));
  const newest = years[0] ?? new Date().getFullYear();
  const setPeriod = (from: number | null, to: number | null) => {
    // keep "from" not later than "to"
    const f = from !== null && to !== null && from > to ? to : from;
    setYearFrom(f === null ? '' : String(f));
    setYearTo(to === null ? '' : String(to));
  };
  const quick = [
    { label: 'All time', from: null, to: null },
    { label: 'Last 3 years', from: newest - 2, to: null },
    { label: 'Last 5 years', from: newest - 4, to: null },
  ] as const;

  const found = useMemo(() => {
    const list = all
      .map((p) => {
        const kw = p.keywords.join(' ').toLowerCase();
        const hay = hayOf(p);
        const ok = terms.every((t) => hay.includes(t));
        // papers whose keywords (not just the title) match rank first
        const score = terms.filter((t) => kw.includes(t)).length * 2 + terms.filter((t) => p.title.toLowerCase().includes(t)).length;
        return { p, ok, score };
      })
      .filter(({ p, ok }) => ok && inPeriod(p.year) && (kind === 'all' || kindOf(p.type) === kind))
      .sort((a, b) => b.score - a.score || (b.p.year ?? 0) - (a.p.year ?? 0))
      .map((x) => x.p);
    return mineFirst(list, (p) => p.publication_authors.some((a) => isMyPerson(a.professors?.full_name)));
  }, [all, terms, yearFrom, yearTo, kind, my]);
  const searchFor = (k: string) => { onQuery(k); onTab('search'); };

  // titles of each researcher's papers, so "Researchers" also finds a person by a paper they wrote
  const papersOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of all) for (const a of p.publication_authors) {
      const n = a.professors?.full_name;
      if (n) m.set(n, `${m.get(n) ?? ''} ${p.title} ${p.keywords.join(' ')}`);
    }
    return m;
  }, [all]);
  const researchers = useMemo(() => {
    if (!terms.length) return people;
    return people
      .map((p) => {
        const name = `${p.full_name} ${p.job_title ?? ''}`.toLowerCase();
        const about = `${p.keywords.join(' ')} ${p.topics.map((t) => `${t.topic_name} ${t.field ?? ''}`).join(' ')} ${papersOf.get(p.full_name) ?? ''}`.toLowerCase();
        const ok = terms.every((t) => name.includes(t) || about.includes(t));
        return { p, ok, score: terms.filter((t) => name.includes(t)).length * 3 + terms.filter((t) => about.includes(t)).length };
      })
      .filter((x) => x.ok)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p);
  }, [people, terms, papersOf]);

  const communityFound = useMemo(() => (!terms.length ? community : community.filter((p) => {
    const hay = `${p.title} ${p.summary ?? ''} ${p.tags.join(' ')} ${p.authors.join(' ')} ${p.labs?.name ?? ''}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  })), [community, terms]);

  const totals = {
    pubs: scope.length,
    cites: scope.reduce((s, p) => s + p.citations, 0),
    profs: terms.length ? new Set(scope.flatMap((p) => p.publication_authors.map((a) => a.professors?.full_name).filter(Boolean))).size : people.length,
  };

  const error = pubs.error ?? profs.error;
  if (error) return <p className="form-alert">{humanError(error)}</p>;

  return (
    <>
    <SearchBar value={query} onChange={onQuery} placeholder={PLACEHOLDER[tab]} />
    <Tabs value={tab} onValueChange={(v) => onTab(v as ResearchTab)}>
      <TabsList className="manage-tabs pill-tabs">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="people">Researchers</TabsTrigger>
        <TabsTrigger value="search">Publications</TabsTrigger>
        <TabsTrigger value="community">{my.any ? 'Lab & student research' : 'Student research'}</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <div className="kpi-grid">
          <div className="kpi"><BookOpen size={16} /><strong>{totals.pubs}</strong><span>Publications</span></div>
          <div className="kpi"><Quote size={16} /><strong>{totals.cites}</strong><span>Citations</span></div>
          <div className="kpi"><UserRound size={16} /><strong>{totals.profs}</strong><span>Researchers</span></div>
        </div>
        <div className="chart-grid two">
          <section className="panel">
            <h3 className="panel-title">Publications per year</h3>
            <div className="chart-box" role="img" aria-label="Publications per year">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byYear} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={VIZ.grid} vertical={false} />
                  <XAxis dataKey="year" {...axis} />
                  <YAxis allowDecimals={false} {...axis} />
                  <Tooltip {...tooltipProps} />
                  <Bar dataKey="total" name="Publications" fill={VIZ.bar} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="panel">
            <h3 className="panel-title">Citations of papers by publication year</h3>
            <div className="chart-box" role="img" aria-label="Citations by publication year">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={byYear} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={VIZ.grid} vertical={false} />
                  <XAxis dataKey="year" {...axis} />
                  <YAxis allowDecimals={false} {...axis} />
                  <Tooltip {...tooltipProps} cursor={{ stroke: VIZ.grid }} />
                  <Line type="monotone" dataKey="citations" name="Citations" stroke={VIZ.line} strokeWidth={2.5} dot={{ r: 3.5, fill: VIZ.line, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      </TabsContent>

      <TabsContent value="people">
        {!profs.isLoading && researchers.length === 0 && <p className="small-note">{terms.length ? 'Nobody found.' : 'No researchers imported yet.'}</p>}
        {!profs.isLoading && researchers.length === 0 && <RequestResearcherCta empty />}
        <div className="prof-grid">{researchers.map((p) => <ProfessorCard key={p.id} p={p} />)}</div>
        {researchers.length > 0 && <RequestResearcherCta />}
      </TabsContent>

      <TabsContent value="search">
        {/* period: quick choices, or any range "from … to …" */}
        <div className="period-bar" role="group" aria-label="Publication period">
          <div className="filter-list">
            {quick.map((q) => {
              const on = (q.from === null ? !yearFrom : yearFrom === String(q.from)) && !yearTo;
              return <button key={q.label} type="button" className={on ? 'filter active' : 'filter'} aria-pressed={on} onClick={() => setPeriod(q.from, q.to)}>{q.label}</button>;
            })}
          </div>
          <div className="period-range">
            <label className={yearFrom ? 'ev-select is-set' : 'ev-select'}>
              <span>From</span>
              <select value={yearFrom} onChange={(e) => setPeriod(e.target.value ? Number(e.target.value) : null, yearTo ? Number(yearTo) : null)} aria-label="From year">
                <option value="">Any</option>
                {[...years].reverse().map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <span className="period-dash" aria-hidden>–</span>
            <label className={yearTo ? 'ev-select is-set' : 'ev-select'}>
              <span>To</span>
              <select value={yearTo} onChange={(e) => setPeriod(yearFrom ? Number(yearFrom) : null, e.target.value ? Number(e.target.value) : null)} aria-label="To year">
                <option value="">Any</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <span className="small-note period-count">{found.length} {found.length === 1 ? 'paper' : 'papers'}</span>
          </div>
        </div>
        <ul className="pub-list">{found.map((p) => <PublicationRow key={p.id} p={p} terms={terms} onKeyword={searchFor} />)}</ul>
        {terms.length > 0 && found.length === 0 && <p className="small-note">No papers found.</p>}
      </TabsContent>

      <TabsContent value="community">
        <div className="tab-actions"><SubmitProjectButton kind="research" label="Submit your research" /></div>
        <div className="project-grid">{communityFound.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
        {!projects.isLoading && communityFound.length === 0 && <p className="small-note">{terms.length ? 'Nothing found.' : 'Nothing yet — use “Submit your research”.'}</p>}
      </TabsContent>

    </Tabs>
    </>
  );
}
