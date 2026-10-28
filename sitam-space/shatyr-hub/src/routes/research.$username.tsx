import { useMemo, useState } from 'react';
import { gmailCompose } from '@/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { VIZ, axisProps, tooltipProps } from '@/lib/chart-style';
import { BackButton } from '@/components/back-button';
import { ArrowUpRight, ExternalLink, FlaskConical, Mail, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicationRow } from '@/components/research-publications';
import { LAB_POSITION_LABEL, formatDate, humanError, opportunityLabel, usePersonOpportunities, useProfessor } from '@/lib/api';

export const Route = createFileRoute('/research/$username')({
  head: () => ({ meta: [{ title: 'Researcher — SITAM SPACE · SDU' }] }),
  component: ProfessorPage,
});

function ProfessorPage() {
  const { username } = Route.useParams();
  const { data, isLoading, error } = useProfessor(username);
  const offers = usePersonOpportunities(username);
  const [sort, setSort] = useState<'year' | 'citations'>('year');

  const pubs = useMemo(() => {
    const list = [...(data?.pubs ?? [])];
    return sort === 'citations' ? list.sort((a, b) => b.citations - a.citations) : list;
  }, [data, sort]);
  const perYear = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of data?.pubs ?? []) if (p.year) m.set(p.year, (m.get(p.year) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ year: String(year), count }));
  }, [data]);

  if (isLoading) return <main className="container content-page"><p className="small-note">Loading…</p></main>;
  if (error) return <main className="container content-page"><p className="form-alert">{humanError(error)}</p></main>;
  if (!data) {
    return (
      <main className="container content-page">
        <p className="form-alert">Researcher not found.</p>
        <BackButton fallback="/research?tab=people" />
      </main>
    );
  }
  const { prof, labs } = data;
  const links = [
    prof.orcid_url && { label: 'ORCID', url: prof.orcid_url },
    prof.scopus_id && { label: 'Scopus', url: `https://www.scopus.com/authid/detail.uri?authorId=${prof.scopus_id}` },
    prof.scholar_url && { label: 'Google Scholar', url: prof.scholar_url },
  ].filter((x): x is { label: string; url: string } => !!x);

  return (
    <main className="container content-page">
      <BackButton fallback="/research?tab=people" />
      <header className="prof-hero">
        <span className="avatar avatar-lg">{prof.photo_url ? <img src={prof.photo_url} alt="" /> : `${prof.first_name[0] ?? ''}${prof.last_name[0] ?? ''}`}</span>
        <div>
          <span className="eyebrow">{[prof.job_title, prof.degree].filter(Boolean).join(' · ') || 'Researcher'}</span>
          <h1>{prof.full_name}</h1>
          {data.email && <p className="mt-2"><a className="person-mail" href={gmailCompose(data.email)} target="_blank" rel="noopener noreferrer"><Mail size={15} />{data.email}</a></p>}
          <div className="social-row">{links.map((l) => <Button key={l.label} asChild size="sm" variant="outline"><a href={l.url} target="_blank" rel="noopener noreferrer"><ExternalLink />{l.label}</a></Button>)}</div>
        </div>
      </header>

      <div className="kpi-grid">
        <div className="kpi"><strong>{prof.total_works}</strong><span>Works</span></div>
        <div className="kpi"><strong>{prof.total_citations}</strong><span>Citations</span></div>
        <div className="kpi"><strong>{prof.h_index}</strong><span>h-index</span></div>
        <div className="kpi"><strong>{prof.i10_index}</strong><span>i10-index</span></div>
      </div>

      <div className="lab-layout mt-6">
        <div className="lab-main">
          <section className="panel">
            <div className="panel-head">
              <h3 className="panel-title">Publications · {pubs.length}</h3>
              <div className="filter-list">
                <Button size="sm" variant="ghost" className={sort === 'year' ? 'filter active' : 'filter'} onClick={() => setSort('year')}>Newest</Button>
                <Button size="sm" variant="ghost" className={sort === 'citations' ? 'filter active' : 'filter'} onClick={() => setSort('citations')}>Most cited</Button>
              </div>
            </div>
            <ul className="pub-list">{pubs.map((p) => <PublicationRow key={p.id} p={p} showAuthors={false} />)}</ul>
          </section>
        </div>
        <aside className="lab-aside">
          {perYear.length > 0 && (
            <section className="panel">
              <h3 className="panel-title">Papers per year</h3>
              <div className="chart-box small">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perYear} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid stroke={VIZ.grid} vertical={false} />
                    <XAxis dataKey="year" {...axisProps} />
                    <YAxis allowDecimals={false} {...axisProps} />
                    <Tooltip {...tooltipProps} />
                    <Bar dataKey="count" name="Papers" fill={VIZ.bar} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
          {(offers.data ?? []).length > 0 && (
            <section className="panel offers-panel">
              <h3 className="panel-title"><Megaphone size={15} />Open positions</h3>
              <ul className="rows">
                {(offers.data ?? []).map((o) => (
                  <li key={o.id}>
                    <div><strong>{o.title}</strong><small>{opportunityLabel(o)}{o.deadline ? ` · until ${formatDate(o.deadline)}` : ''}</small></div>
                    <Button asChild size="sm"><Link to="/opportunities" search={{ tab: o.category, open: o.id }}>Apply<ArrowUpRight /></Link></Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {prof.topics.length > 0 && (
            <section className="panel">
              <h3 className="panel-title">Research topics</h3>
              <ul className="rows">{prof.topics.map((t) => <li key={t.topic_name}><div><strong>{t.topic_name}</strong><small>{[t.field, t.domain].filter(Boolean).join(' · ')}</small></div>{t.works_count ? <span className="pill pill-done">{t.works_count}</span> : null}</li>)}</ul>
            </section>
          )}
          {prof.keywords.length > 0 && (
            <section className="panel">
              <h3 className="panel-title">Keywords</h3>
              <div className="stack-list">{prof.keywords.map((k) => <span key={k}>{k}</span>)}</div>
            </section>
          )}
          {labs.length > 0 && (
            <section className="panel">
              <h3 className="panel-title"><FlaskConical size={15} />Labs</h3>
              <ul className="rows">{labs.filter((l) => l.labs).map((l) => <li key={l.labs?.slug}><div><strong><Link to="/labs/$slug" params={{ slug: l.labs?.slug ?? '' }}>{l.labs?.name}</Link></strong><small>{l.title ?? LAB_POSITION_LABEL[l.role]}</small></div></li>)}</ul>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
