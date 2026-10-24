import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight, FlaskConical, LogIn, Pencil, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminPanel, BriefsPanel, EventsPanel, InboxPanel, ListingsPanel, ModerationPanel } from '@/components/manage-panels';
import { LAB_POSITION_LABEL, useInbox, type LabRole } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pageHead } from '@/lib/hub-data';

type ManageTab = 'inbox' | 'labs' | 'listings' | 'events' | 'moderation' | 'labheads' | 'b2b' | 'admin';
const TABS: ManageTab[] = ['inbox', 'labs', 'listings', 'events', 'moderation', 'labheads', 'b2b', 'admin'];

export const Route = createFileRoute('/manage')({
  validateSearch: (s: Record<string, unknown>): { tab?: ManageTab; lab?: string } => ({
    ...(typeof s['tab'] === 'string' && (TABS as string[]).includes(s['tab']) ? { tab: s['tab'] as ManageTab } : {}),
    ...(typeof s['lab'] === 'string' ? { lab: s['lab'] } : {}),
  }),
  head: () => pageHead('Manage', 'Inbox and tools for lab heads, professors, partners and the SITAM office.'),
  component: Manage,
});

function Manage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user, caps, loading } = useAuth();
  const inbox = useInbox(!!user && caps.canReview);

  if (loading) return <main className="container content-page"><p className="small-note">Loading…</p></main>;
  if (!user) {
    return (
      <main className="container content-page auth-page">
        <h1>Sign in to manage.</h1>
        <p className="page-intro">Lab heads, professors and partners manage applications and listings here.</p>
        <Button asChild><Link to="/login"><LogIn />Sign in</Link></Button>
      </main>
    );
  }
  if (!caps.canReview && !caps.isPartner && !caps.isTeacher && !caps.isAdmin) {
    return (
      <main className="container content-page auth-page">
        <h1>Nothing to manage yet.</h1>
        <p className="page-intro">This area opens when you head a lab, belong to a partner company or have a verified staff account. Students track their applications in the profile.</p>
        <Button asChild><Link to="/profile">My profile<ArrowUpRight /></Link></Button>
      </main>
    );
  }

  const openCount = (inbox.data ?? []).filter((i) => i.status === 'submitted').length;
  const available: { value: ManageTab; label: string; show: boolean }[] = [
    { value: 'inbox', label: `Applications${openCount ? ` · ${openCount}` : ''}`, show: caps.canReview },
    { value: 'labs', label: 'My labs', show: caps.managedLabs.length > 0 },
    { value: 'listings', label: 'Opportunities', show: caps.companies.length > 0 || caps.managedLabs.length > 0 || caps.isTeacher || caps.isAdmin },
    { value: 'events', label: 'Events', show: caps.isStaff || caps.managedLabs.length > 0 || caps.companies.length > 0 },
    { value: 'moderation', label: `Submissions${caps.pendingModeration ? ` · ${caps.pendingModeration}` : ''}`, show: caps.isAdmin },
    { value: 'b2b', label: caps.isStaff ? 'B2B requests' : 'My briefs', show: caps.isStaff || caps.isPartner },
    { value: 'admin', label: 'Admin', show: caps.isAdmin },
  ];
  const visible = available.filter((t) => t.show);
  const current = visible.find((t) => t.value === tab)?.value ?? visible[0]?.value ?? 'inbox';

  return (
    <main className="container content-page">
      <span className="eyebrow">WORKSPACE</span>
      <h1>Manage</h1>
      <p className="page-intro">
        {[
          caps.managedLabs.length && `Manages ${caps.managedLabs.map((l) => l.name).join(', ')}`,
          caps.companies.length && `Partner · ${caps.companies.map((c) => `${c.name}${c.verified ? '' : ' (awaiting verification)'}`).join(', ')}`,
          caps.isStaff && 'Verified staff',
          caps.isTeacher && !caps.isStaff && 'Staff account awaiting verification by the SITAM office',
          caps.isAdmin && 'Admin',
        ].filter(Boolean).join(' · ')}
      </p>

      {visible.length === 0 ? (
        <p className="small-note">Your account is waiting for verification by the SITAM office. Lab-head tools unlock automatically if your e-mail is listed in a lab form.</p>
      ) : (
        <Tabs value={current} onValueChange={(v) => navigate({ search: { tab: v as ManageTab } })}>
          <TabsList className="manage-tabs">
            {visible.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="inbox"><InboxPanel /></TabsContent>
          <TabsContent value="labs">
            <div className="profile-grid">
              {caps.managedLabs.map((l) => (
                <section key={l.id} className="panel">
                  <h3 className="panel-title"><FlaskConical size={16} />{l.name}</h3>
                  <p className="small-note mb-3">Your position: {LAB_POSITION_LABEL[l.role as LabRole] ?? l.role}</p>
                  <div className="dialog-actions wrap">
                    <Button asChild size="sm"><Link to="/labs/$slug" params={{ slug: l.slug }} search={{ edit: true }}><Pencil />Edit lab page</Link></Button>
                    <Button asChild size="sm" variant="outline"><Link to="/labs/$slug" params={{ slug: l.slug }} search={{ team: true }}><UserCog />Manage members</Link></Button>
                    <Button asChild size="sm" variant="outline"><Link to="/labs/$slug" params={{ slug: l.slug }}>View</Link></Button>
                    <Button size="sm" variant="outline" onClick={() => navigate({ search: { tab: 'inbox' } })}>Applications</Button>
                  </div>
                </section>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="listings"><ListingsPanel /></TabsContent>
          <TabsContent value="events"><EventsPanel /><p className="small-note mt-3">Attendee lists: open any event on the <Link to="/events">Events</Link> page → “Attendees”.</p></TabsContent>
          <TabsContent value="moderation"><ModerationPanel /></TabsContent>
          <TabsContent value="b2b"><BriefsPanel staff={caps.isStaff} /></TabsContent>
          <TabsContent value="admin"><AdminPanel /></TabsContent>
        </Tabs>
      )}
    </main>
  );
}
