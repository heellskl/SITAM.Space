import { useEffect, useRef } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { CheckCircle2, LogIn, TicketCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { humanError, useCheckIn } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// The QR on every ticket points here. Organizers (signed in) get an instant check-in;
// anyone else sees what to do with the ticket.
export const Route = createFileRoute('/checkin/$code')({
  head: () => ({ meta: [{ title: 'Ticket check-in — SITAM SPACE' }] }),
  component: CheckIn,
});

function CheckIn() {
  const { code } = Route.useParams();
  const { user, caps, loading } = useAuth();
  const checkIn = useCheckIn();
  const fired = useRef(false);
  const mayCheckIn = !!user && (caps.isStaff || caps.managedLabs.length > 0 || caps.companies.length > 0);

  useEffect(() => {
    if (loading || !mayCheckIn || fired.current) return;
    fired.current = true;
    checkIn.mutate(code);
  }, [loading, mayCheckIn, code, checkIn]);

  return (
    <main className="container content-page auth-page">
      <span className="eyebrow">TICKET {code.toUpperCase()}</span>
      {loading ? (
        <p className="small-note">Checking…</p>
      ) : !user ? (
        <div className="partner-success">
          <TicketCheck size={40} />
          <h2>This is a SITAM event ticket.</h2>
          <p>Show it at the door. Organizers: sign in to check people in by scanning.</p>
          <Button asChild><Link to="/login"><LogIn />Organizer sign in</Link></Button>
        </div>
      ) : !mayCheckIn ? (
        <div className="partner-success">
          <TicketCheck size={40} />
          <h2>Show this ticket to the organizer.</h2>
          <p>Only event organizers can check tickets in.</p>
          <Button asChild variant="outline"><Link to="/profile">My tickets</Link></Button>
        </div>
      ) : checkIn.isPending || checkIn.isIdle ? (
        <p className="small-note">Checking in…</p>
      ) : checkIn.isError ? (
        <div className="partner-success checkin-fail">
          <XCircle size={44} />
          <h2>Not checked in</h2>
          <p>{humanError(checkIn.error)}</p>
        </div>
      ) : (
        <div className="partner-success">
          <CheckCircle2 size={44} />
          <h2>{checkIn.data?.already ? 'Already checked in' : 'Checked in ✓'}</h2>
          <p><strong>{checkIn.data?.name}</strong> · {checkIn.data?.event}</p>
          {checkIn.data && <Button asChild><Link to="/events/$eventId" params={{ eventId: checkIn.data.event_id }}>Open attendee list</Link></Button>}
        </div>
      )}
    </main>
  );
}
