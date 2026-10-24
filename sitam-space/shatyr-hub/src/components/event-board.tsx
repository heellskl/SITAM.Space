import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowUpRight, BriefcaseBusiness, CalendarDays, CheckCircle2, Clock3, FlaskConical, History, ListChecks, MapPin, Ticket as TicketIcon, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { eventDate, hostNames, humanError, ticketUrl, useEvents, useMyRegistrations, useRegister, type EventKind, type Host, type Registration, type SitamEvent } from '@/lib/api';
import { mineFirst, useMyLabs } from '@/lib/my-labs';
import { useAuth, type Capabilities } from '@/lib/auth';
import { LoginRequiredDialog } from '@/components/login-required';
import { EVENT_META } from '@/lib/sitam-data';
import { ExternalEventsBoard } from '@/components/external-events';

/** Mirrors can_manage_event() in the database (for showing buttons only; the DB decides). */
export function canManageEvent(e: Pick<SitamEvent, 'organizer_id' | 'event_hosts'>, userId: string | undefined, caps: Capabilities) {
  // Events are managed by heads of a hosting lab and by the coordinator (database: can_manage_event).
  void userId;
  if (caps.isAdmin) return true;
  return e.event_hosts.some((h) => !!h.lab_id && caps.managedLabs.some((m) => m.id === h.lab_id));
}

export function HostPills({ hosts }: { hosts: Host[] }) {
  if (!hosts.length) return null;
  return (
    <p className="event-links">
      {hosts.map((h) =>
        h.labs ? <Link key={h.id} to="/labs/$slug" params={{ slug: h.labs.slug }} className="pill pill-live">{h.labs.name}</Link>
        : h.companies ? <span key={h.id} className="pill pill-gold">{h.companies.name}</span>
        : h.projects ? <Link key={h.id} to="/projects" className="pill pill-done">{h.projects.title}</Link> : null,
      )}
    </p>
  );
}

/** E-ticket, boarding-pass style: details on the left, QR stub on the right (stacks on phones). */
export function TicketBadge({ event, reg, holder }: { event: Pick<SitamEvent, 'kind' | 'title' | 'starts_at' | 'room'>; reg: Registration; holder?: string | undefined }) {
  const d = eventDate(event.starts_at);
  const checked = reg.status === 'checked_in';
  return (
    <div className={`eticket eticket-${event.kind}${checked ? ' is-used' : ''}`}>
      <div className="eticket-main">
        <div className="eticket-brand">
          <img src="/sitam-emblem.png" alt="" width={18} height={22} />
          <span>SITAM<b>.</b>SPACE</span>
          <span className="eticket-kind">{EVENT_META[event.kind].label}</span>
        </div>
        <strong className="eticket-title">{event.title}</strong>
        <dl className="eticket-grid">
          <div><dt>Date</dt><dd>{d.day} {d.month}</dd></div>
          <div><dt>Time</dt><dd>{d.time}</dd></div>
          <div><dt>Room</dt><dd>{event.room}</dd></div>
          {holder && <div className="span-3"><dt>Guest</dt><dd>{holder}</dd></div>}
        </dl>
        <p className="eticket-status">
          {checked
            ? `✓ Checked in${reg.checked_in_at ? ` at ${new Date(reg.checked_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}`
            : 'Show the QR at the door — the organizer scans it.'}
        </p>
      </div>
      <div className="eticket-stub">
        <div className="eticket-qr">
          <QRCodeSVG value={ticketUrl(reg.ticket_code)} size={132} bgColor="#ffffff" fgColor="#0A1930" level="M" title={`QR ticket ${reg.ticket_code}`} />
        </div>
        <code>{reg.ticket_code.toUpperCase().replace(/(.{4})(?=.)/g, '$1 ')}</code>
        <span className="eticket-admit">{checked ? 'Admitted' : 'Admit one'}</span>
      </div>
    </div>
  );
}

function EventCard({ event, reg, canManage, onRegister, onShow, busy }: { event: SitamEvent; reg?: Registration | undefined; canManage: boolean; onRegister: () => void; onShow: () => void; busy: boolean }) {
  const d = eventDate(event.starts_at);
  const Icon = event.kind === 'industrial' ? BriefcaseBusiness : FlaskConical;
  const seatsLeft = Math.max(0, event.capacity - event.registered);
  return (
    <article className="event-tile">
      <div className="date-tile" aria-hidden>
        <span>{d.month}</span>
        <strong>{d.day}</strong>
        <span>{d.weekday}</span>
      </div>
      <div className="event-tile-body">
        <span className="eyebrow"><Icon size={12} /> {EVENT_META[event.kind].label}</span>
        <h3><Link to="/events/$eventId" params={{ eventId: event.id }}>{event.title}</Link></h3>
        {event.speaker && <p className="speaker"><strong>{event.speaker}</strong>{event.speaker_role && <span>{event.speaker_role}</span>}</p>}
        <HostPills hosts={event.event_hosts} />
        <div className="event-meta">
          <span><Clock3 size={14} />{d.time}</span>
          <span><MapPin size={14} />Room {event.room}</span>
          <span><Users size={14} />{seatsLeft} of {event.capacity} seats left</span>
        </div>
        <div className="stack-list">{event.tags.map((t) => <span key={t}>{t}</span>)}</div>
      </div>
      <div className="event-tile-cta">
        {reg ? (
          <Button variant="secondary" onClick={onShow}><TicketIcon />View QR ticket</Button>
        ) : (
          <Button onClick={onRegister} disabled={busy || seatsLeft === 0}>{seatsLeft === 0 ? 'Fully booked' : <>Register<ArrowUpRight /></>}</Button>
        )}
        {canManage && (
          <Button asChild variant="outline" size="sm"><Link to="/events/$eventId" params={{ eventId: event.id }}><ListChecks />Attendees · {event.registered}</Link></Button>
        )}
      </div>
    </article>
  );
}

export function EventBoard({ compact = false, query = '' }: { compact?: boolean; query?: string }) {
  const { user, profile, caps } = useAuth();
  const { data, isLoading, error } = useEvents();
  const regs = useMyRegistrations(user?.id);
  const register = useRegister();
  const [tab, setTab] = useState<EventKind | 'history' | 'external'>('industrial');
  const [active, setActive] = useState<{ event: SitamEvent; reg: Registration } | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | EventKind>('all');
  const [needLogin, setNeedLogin] = useState(false);

  const my = useMyLabs();
  const ofMyLab = (e: SitamEvent) => e.event_hosts.some((h) => my.isMineLab(h.lab_id));
  const now = Date.now();
  const term = query.trim().toLowerCase();
  const events = (data ?? []).filter((e) => !term || `${e.title} ${e.speaker ?? ''} ${hostNames(e.event_hosts)} ${e.tags.join(' ')}`.toLowerCase().includes(term));
  // events hosted by the head's own labs first (date order kept inside each group)
  const upcoming = useMemo(() => mineFirst(events.filter((e) => new Date(e.starts_at).getTime() > now - 3_600_000), ofMyLab), [events, now, my]);
  const past = useMemo(
    () => mineFirst(events.filter((e) => new Date(e.starts_at).getTime() <= now - 3_600_000).sort((a, b) => b.starts_at.localeCompare(a.starts_at)), ofMyLab),
    [events, now, my],
  );
  const holder = profile ? `${profile.firstName} ${profile.lastName}`.trim() : undefined;
  const regFor = (id: string) => (regs.data ?? []).find((r) => r.event_id === id);
  const canManage = (e: SitamEvent) => canManageEvent(e, user?.id, caps);

  function doRegister(e: SitamEvent) {
    if (!user) {
      setNeedLogin(true);
      return;
    }
    register.mutate(e.id, {
      onSuccess: (reg) => {
        setActive({ event: e, reg });
        toast.success('You are registered', { description: e.title });
      },
      onError: (err) => toast.error('Could not register', { description: humanError(err) }),
    });
  }

  const shownPast = past.filter((p) => historyFilter === 'all' || p.kind === historyFilter);
  const totalAttended = shownPast.reduce((s, e) => s + e.attended, 0);

  return (
    <>
      {error && <p className="form-alert">{humanError(error)}</p>}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <div className="events-toolbar">
          <TabsList>
            <TabsTrigger value="industrial"><BriefcaseBusiness size={15} />Industrial Days</TabsTrigger>
            <TabsTrigger value="research"><FlaskConical size={15} />Research Days</TabsTrigger>
            <TabsTrigger value="external"><Trophy size={15} />Competitions & Hackathons</TabsTrigger>
            <TabsTrigger value="history"><History size={15} />Events History</TabsTrigger>
          </TabsList>
          <span className="recurring">
            <CalendarDays size={14} />
            {tab === 'history' ? `${shownPast.length} past events · ${totalAttended} attendees`
              : tab === 'external' ? 'Outside SITAM · labs that take part, their teams and results'
              : `${EVENT_META[tab].weekdayName}s · ${EVENT_META[tab].time} · Room C1.2`}
          </span>
        </div>

        {(['industrial', 'research'] as const).map((kind) => {
          const list = upcoming.filter((e) => e.kind === kind).slice(0, compact ? 2 : undefined);
          return (
            <TabsContent key={kind} value={kind}>
              <div className="event-list">
                {isLoading && <div className="event-tile skeleton-card" aria-hidden />}
                {list.map((e) => (
                  <EventCard
                    key={e.id}
                    event={e}
                    reg={regFor(e.id)}
                    canManage={canManage(e)}
                    busy={register.isPending}
                    onRegister={() => doRegister(e)}
                    onShow={() => { const r = regFor(e.id); if (r) setActive({ event: e, reg: r }); }}
                  />
                ))}
                {!isLoading && list.length === 0 && <div className="mini-empty"><CalendarDays size={20} /><p>No upcoming {EVENT_META[kind].label} yet.</p></div>}
              </div>
            </TabsContent>
          );
        })}

        <TabsContent value="external">
          <ExternalEventsBoard query={query} />
        </TabsContent>

        <TabsContent value="history">
          <div className="filter-list mb-4">
            {(['all', 'industrial', 'research'] as const).map((f) => (
              <Button key={f} variant="ghost" className={historyFilter === f ? 'filter active' : 'filter'} aria-pressed={historyFilter === f} onClick={() => setHistoryFilter(f)}>
                {f === 'all' ? 'All events' : EVENT_META[f].label}
              </Button>
            ))}
          </div>
          <div className="history-table" role="table" aria-label="Past events">
            <div className="history-row history-head" role="row">
              <span role="columnheader">Date</span><span role="columnheader">Event</span><span role="columnheader">Speaker / host</span><span role="columnheader">Attended</span>
            </div>
            {shownPast.slice(0, compact ? 5 : undefined).map((p) => (
              <div key={p.id} className="history-row" role="row">
                <span role="cell" className="history-date">{eventDate(p.starts_at).short}</span>
                <span role="cell">
                  <span className="eyebrow">{EVENT_META[p.kind].label}</span>
                  <strong>{p.title}</strong>
                </span>
                <span role="cell" className="small-note">
                  {p.speaker ?? '—'}
                  {hostNames(p.event_hosts) !== 'SITAM' && <> · {hostNames(p.event_hosts)}</>}
                </span>
                <span role="cell" className="history-count">
                  <Users size={13} />{p.attended || '—'}
                  {canManage(p) && <Link to="/events/$eventId" params={{ eventId: p.id }} className="history-list-link">list</Link>}
                </span>
              </div>
            ))}
            {shownPast.length === 0 && <div className="mini-empty"><History size={20} /><p>No past events yet.</p></div>}
          </div>
        </TabsContent>
      </Tabs>

      <LoginRequiredDialog open={needLogin} onClose={() => setNeedLogin(false)} next="/events" />
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="hub-dialog">
          <CheckCircle2 className="text-primary" />
          <DialogTitle>You’re registered</DialogTitle>
          <DialogDescription>Show this QR badge at the door of Room {active?.event.room ?? 'C1.2'}. It is also saved in your profile.</DialogDescription>
          {active && <TicketBadge event={active.event} reg={active.reg} holder={holder} />}
          <Button onClick={() => setActive(null)}>Done</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
