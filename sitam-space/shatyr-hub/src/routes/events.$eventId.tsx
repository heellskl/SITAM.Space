import { useMemo, useState, type FormEvent } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, Clock3, Download, MapPin, ScanLine, Search, Ticket as TicketIcon, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { HostPills, TicketBadge, canManageEvent } from '@/components/event-board';
import {
  eventDate, humanError, useAttendees, useCancelRegistration, useCheckIn, useEvents, useMyRegistrations, useRegister, type Attendee,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { EVENT_META } from '@/lib/sitam-data';

export const Route = createFileRoute('/events/$eventId')({
  head: () => ({ meta: [{ title: 'Event — SITAM SPACE · SDU' }] }),
  component: EventPage,
});

function toCsv(rows: Attendee[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Name', 'E-mail', 'Role', 'Course', 'Major', 'Ticket', 'Status', 'Registered at', 'Checked in at'];
  const body = rows.map((r) => [r.name, r.email, r.role, r.course, r.major, r.ticket_code, r.status, r.registered_at, r.checked_in_at ?? ''].map(esc).join(','));
  return [head.map(esc).join(','), ...body].join('\n');
}

function EventPage() {
  const { eventId } = Route.useParams();
  const { user, profile, caps } = useAuth();
  const { data, isLoading } = useEvents();
  const event = data?.find((e) => e.id === eventId);
  const canManage = !!event && canManageEvent(event, user?.id, caps);
  const attendees = useAttendees(eventId, canManage);
  const regs = useMyRegistrations(user?.id);
  const register = useRegister();
  const cancel = useCancelRegistration();
  const checkIn = useCheckIn();
  const [code, setCode] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'registered' | 'checked_in' | 'cancelled'>('all');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (attendees.data ?? []).filter((a) => (filter === 'all' || a.status === filter) && `${a.name} ${a.email} ${a.ticket_code} ${a.major ?? ''}`.toLowerCase().includes(q));
  }, [attendees.data, query, filter]);

  if (isLoading) return <main className="container content-page"><p className="small-note">Loading…</p></main>;
  if (!event) return <main className="container content-page"><p className="form-alert">Event not found.</p><Link to="/events" className="back-link"><ArrowLeft size={14} />All events</Link></main>;

  const d = eventDate(event.starts_at);
  const isPast = new Date(event.starts_at).getTime() < Date.now() - 3_600_000;
  const myReg = (regs.data ?? []).find((r) => r.event_id === event.id);
  const all = attendees.data ?? [];
  const checked = all.filter((a) => a.status === 'checked_in').length;
  const active = all.filter((a) => a.status !== 'cancelled').length;

  function scan(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    checkIn.mutate(code, {
      onSuccess: (r) => {
        if (r.event_id !== eventId) toast.warning(`Ticket is for another event: ${r.event}`, { description: r.name });
        else if (r.already) toast.info(`${r.name} was already checked in`);
        else toast.success(`Checked in: ${r.name}`);
        setCode('');
      },
      onError: (err) => toast.error(humanError(err)),
    });
  }

  function download() {
    const blob = new Blob([`﻿${toCsv(all)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendees-${event?.starts_at.slice(0, 10)}-${eventId.slice(0, 6)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="container content-page">
      <Link to="/events" className="back-link"><ArrowLeft size={14} />All events</Link>
      <span className="eyebrow">{EVENT_META[event.kind].label} · {d.long.toUpperCase()}</span>
      <h1 className="event-title">{event.title}</h1>
      <div className="event-meta big">
        <span><Clock3 size={15} />{d.time}</span>
        <span><MapPin size={15} />Room {event.room}</span>
        <span><Users size={15} />{event.registered} registered · {event.capacity} seats</span>
      </div>
      {event.speaker && <p className="speaker mt-3"><strong>{event.speaker}</strong>{event.speaker_role && <span> · {event.speaker_role}</span>}</p>}
      {event.description && <p className="page-intro">{event.description}</p>}
      {event.event_hosts.length > 0 && <div className="mb-6"><span className="sub-title">Hosted by</span><HostPills hosts={event.event_hosts} /></div>}

      {!isPast && (
        <section className="panel mb-6">
          <h3 className="panel-title"><TicketIcon size={16} />Your ticket</h3>
          {!user ? (
            <p className="small-note">Sign in with your SDU e-mail to register. <Link to="/login">Sign in</Link></p>
          ) : myReg ? (
            <div className="ticket-wrap">
              <TicketBadge event={event} reg={myReg} holder={profile ? `${profile.firstName} ${profile.lastName}` : undefined} />
              {myReg.status === 'registered' && <Button variant="ghost" size="sm" onClick={() => cancel.mutate(event.id, { onSuccess: () => toast('Registration cancelled') })}>Cancel registration</Button>}
            </div>
          ) : (
            <Button disabled={register.isPending} onClick={() => register.mutate(event.id, { onSuccess: () => toast.success('Registered — your QR ticket is below'), onError: (e) => toast.error(humanError(e)) })}>Register in 1-click</Button>
          )}
        </section>
      )}

      {canManage && (
        <section className="panel attendee-panel">
          <div className="attendee-head">
            <div>
              <span className="eyebrow">ORGANIZER</span>
              <h2>Registered attendees</h2>
              <p className="small-note">Everyone who registered via QR, in one list. Updates every 15 seconds.</p>
            </div>
            <div className="kpi-row">
              <div className="kpi mini"><strong>{active}</strong><span>registered</span></div>
              <div className="kpi mini"><strong>{checked}</strong><span>checked in</span></div>
              <div className="kpi mini"><strong>{active ? Math.round((checked / active) * 100) : 0}%</strong><span>show-up</span></div>
            </div>
          </div>

          <form className="checkin-form" onSubmit={scan}>
            <ScanLine size={18} />
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan QR or type ticket code" aria-label="Ticket code" autoComplete="off" />
            <Button type="submit" disabled={checkIn.isPending}>Check in</Button>
          </form>
          <p className="small-note mb-4">Tip: scanning the QR with a phone camera opens the check-in page directly for signed-in organizers.</p>

          <div className="lab-controls">
            <div className="filter-list">
              {(['all', 'registered', 'checked_in', 'cancelled'] as const).map((f) => (
                <Button key={f} variant="ghost" className={filter === f ? 'filter active' : 'filter'} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : f === 'checked_in' ? 'Checked in' : f[0]?.toUpperCase() + f.slice(1)}
                </Button>
              ))}
              <Button variant="outline" size="sm" onClick={download} disabled={!all.length}><Download />CSV</Button>
            </div>
            <label className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, e-mail, ticket" aria-label="Search attendees" /></label>
          </div>

          {attendees.error ? <p className="form-alert">{humanError(attendees.error)}</p> : (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>#</th><th>Name</th><th>E-mail</th><th>Course / role</th><th>Ticket</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {list.map((a, i) => (
                    <tr key={a.registration_id}>
                      <td>{i + 1}</td>
                      <td><strong>{a.name || '—'}</strong></td>
                      <td>{a.email}</td>
                      <td>{a.role === 'student' ? `${a.course ?? '?'} course · ${a.major ?? ''}` : a.role}</td>
                      <td><code>{a.ticket_code}</code></td>
                      <td><span className={`pill ${a.status === 'checked_in' ? 'pill-live' : a.status === 'cancelled' ? 'pill-done' : 'pill-wip'}`}>{a.status === 'checked_in' ? `✓ ${a.checked_in_at ? new Date(a.checked_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}` : a.status}</span></td>
                      <td>{a.status === 'registered' && <Button size="sm" variant="outline" onClick={() => checkIn.mutate(a.ticket_code, { onSuccess: (r) => toast.success(`Checked in: ${r.name}`), onError: (e) => toast.error(humanError(e)) })}><CheckCircle2 />Mark attended</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!attendees.isLoading && list.length === 0 && <div className="mini-empty"><Users size={20} /><p>No attendees match.</p></div>}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
