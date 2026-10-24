import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight, FlaskConical, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ListingDialog } from '@/components/manage-panels';
import { useMyLabs } from '@/components/my-labs';
import { eventDate, opportunityLabel, useOpportunities } from '@/lib/api';
import { OpportunityBoard, type OppTab } from '@/components/opportunity-board';
import { pageHead } from '@/lib/hub-data';

const TABS: OppTab[] = ['all', 'industrial', 'lab', 'research'];

export const Route = createFileRoute('/opportunities')({
  validateSearch: (s: Record<string, unknown>): { tab?: OppTab; open?: string } => ({
    ...(typeof s['tab'] === 'string' && (TABS as string[]).includes(s['tab']) ? { tab: s['tab'] as OppTab } : {}),
    ...(typeof s['open'] === 'string' ? { open: s['open'] } : {}),
  }),
  head: () => pageHead('Opportunities', 'Industrial cases (vacancies, internships, projects), lab cases and research cases for SDU students.'),
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
        <h2 id="my-lab-cases"><FlaskConical size={18} />Open cases of my labs</h2>
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

function Opportunities() {
  const { tab, open } = Route.useSearch();
  return (
    <main className="container content-page">
      <h1>Opportunities</h1>
      <div className="mt-6" />
      <MyLabCases />
      <OpportunityBoard key={tab ?? 'all'} initialTab={tab ?? 'all'} openId={open} />
    </main>
  );
}
