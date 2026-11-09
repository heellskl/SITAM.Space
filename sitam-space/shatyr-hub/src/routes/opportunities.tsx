import { useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight, Briefcase, Building2, FlaskConical, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ListingDialog } from '@/components/manage-panels';
import { useMyLabs } from '@/components/my-labs';
import { eventDate, opportunityLabel, useIndustryPartners, useLabs, useOpportunities, useProjects } from '@/lib/api';
import { PageHero } from '@/components/page-hero';
import { OpportunityBoard, type OppTab } from '@/components/opportunity-board';
import { pageHead } from '@/lib/hub-data';
import { IndustryPartners } from '@/components/industry-partners';

const TABS: OppTab[] = ['all', 'industrial', 'lab', 'research'];

export const Route = createFileRoute('/opportunities')({
  validateSearch: (s: Record<string, unknown>): { tab?: OppTab; open?: string; view?: 'partners' } => ({
    ...(s['view'] === 'partners' ? { view: 'partners' as const } : {}),
    ...(typeof s['tab'] === 'string' && (TABS as string[]).includes(s['tab']) ? { tab: s['tab'] as OppTab } : {}),
    ...(typeof s['open'] === 'string' ? { open: s['open'] } : {}),
  }),
  head: () => pageHead('Industry', 'Industrial cases (vacancies, internships, projects), lab and research cases, and SITAM industry partners.'),
  component: Opportunities,
});

/** Lab leaders: the cases their labs have open, and a shortcut to post a new one. */
function MyLabCases() {
  const { led } = useMyLabs();
  const { data } = useOpportunities();
  const [adding, setAdding] = useState(false);
  if (!led.length) return null;
  const ids = new Set(led.map((x) => x.lab.id));
  const list = (data ?? []).filter((o) => o.opportunity_hosts.some((h) => h.lab_id && ids.has(h.lab_id)));
  return (
    <section className="labs-section" aria-labelledby="my-lab-cases">
      <div className="labs-section-head">
        <h3 id="my-lab-cases" className="industry-sub"><FlaskConical size={16} />Open cases of my labs</h3>
        <div className="dash-quick">
          <Button size="sm" onClick={() => setAdding(true)}><Plus />Post a lab case</Button>
          <Button asChild size="sm" variant="outline"><Link to="/manage" search={{ tab: 'inbox' }}>Applications<ArrowUpRight /></Link></Button>
        </div>
      </div>
      {list.length ? (
        <ul className="rows panel">
          {list.map((o) => (
            <li key={o.id}>
              <div><strong>{o.title}</strong><small>{opportunityLabel(o)}{o.deadline ? ` · until ${eventDate(o.deadline).short}` : ''}</small></div>
              <Button asChild size="sm" variant="outline"><Link to="/opportunities" search={{ tab: o.category, open: o.id }}>Open</Link></Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="dash-empty"><strong>No open cases</strong>Lab cases and research cases are how students join your lab.</div>
      )}
      {adding && <ListingDialog opp={null} defaultCategory="lab" preset={{ labs: led.map((x) => x.lab.id).slice(0, 1), companies: [], projects: [] }} onClose={() => setAdding(false)} />}
    </section>
  );
}

/** Industry (formerly Opportunities): under the heading two tabs — Opportunities (default) and Partners. */
function Opportunities() {
  const { tab, open, view = 'opportunities' } = Route.useSearch();
  const navigate = Route.useNavigate();
  const opps = useOpportunities();
  const partners = useIndustryPartners();
  const labs = useLabs();
  const projects = useProjects();
  // v33: projects in industry = industrial cases of the type Project + projects of labs with the
  // "Commercial Projects" focus + approved startups (each project counted once)
  const industryProjects = useMemo(() => {
    if (!opps.data || !labs.data || !projects.data) return undefined;
    const commercial = new Set(labs.data.filter((l) => (l.focus ?? []).some((f) => /commercial/i.test(f))).map((l) => l.id));
    const cases = opps.data.filter((o) => o.category === 'industrial' && o.industrial_type === 'project').length;
    const own = projects.data.filter((p) => p.kind === 'startup' || (p.lab_id && commercial.has(p.lab_id))).length;
    return cases + own;
  }, [opps.data, labs.data, projects.data]);
  const go = (v: 'opportunities' | 'partners') => navigate({ search: v === 'partners' ? { view: 'partners' } : {}, replace: true });
  return (
    <main className="container content-page">
      <PageHero
        title="Industry and partners"
        text="Vacancies, internships and cases from companies and SITAM labs, and the companies we work with."
        stats={[
          { label: 'Open opportunities', value: opps.data?.length, to: '/opportunities' },
          { label: 'Partner companies', value: partners.data?.length, to: '/opportunities', search: { view: 'partners' } },
          { label: 'Industry projects', value: industryProjects },
        ]}
      />
      <div className="view-switch labs-switch" role="tablist" aria-label="Show">
        <button type="button" role="tab" aria-selected={view === 'opportunities'} className={view === 'opportunities' ? 'is-on' : ''} onClick={() => go('opportunities')}><Briefcase size={15} />Opportunities</button>
        <button type="button" role="tab" aria-selected={view === 'partners'} className={view === 'partners' ? 'is-on' : ''} onClick={() => go('partners')}><Building2 size={15} />Partners</button>
      </div>
      {view === 'partners' ? (
        <div><IndustryPartners /></div>
      ) : (
        <div>
          <MyLabCases />
          <OpportunityBoard key={tab ?? 'all'} initialTab={tab ?? 'all'} openId={open} />
        </div>
      )}
    </main>
  );
}
