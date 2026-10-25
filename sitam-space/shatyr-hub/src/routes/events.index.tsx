import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventBoard } from '@/components/event-board';
import { EventDialog } from '@/components/manage-panels';
import { SearchBar } from '@/components/search-bar';
import { useAuth } from '@/lib/auth';
import { pageHead } from '@/lib/hub-data';

export const Route = createFileRoute('/events/')({
  head: () => pageHead('Events', 'Industry and research events, competitions and hackathons at SDU.'),
  component: Events,
});

function Events() {
  const { caps } = useAuth();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  // Only heads of a lab (or the coordinator) create events.
  const canCreate = caps.managedLabs.length > 0 || caps.isAdmin;
  return (
    <main className="container content-page">
      <div className="page-head-row">
        <h1>Events</h1>
        {canCreate && <Button onClick={() => setAdding(true)}><CalendarPlus />New event</Button>}
      </div>
      <div className="mt-6"><SearchBar value={q} onChange={setQ} placeholder="Search events, speakers, labs" /></div>
      <EventBoard query={q} />
      {adding && <EventDialog preset={{ labs: caps.managedLabs.map((l) => l.id).slice(0, 1), companies: [], projects: [] }} onClose={() => setAdding(false)} />}
    </main>
  );
}
