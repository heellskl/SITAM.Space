import { PersonEmails } from '@/components/lab-page';
import { createFileRoute, Link } from '@tanstack/react-router';
import { gmailCompose } from '@/lib/utils';
import { ArrowLeft, Briefcase, FlaskConical, LogIn, Mail, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LAB_POSITION_LABEL, humanError, personName, useExperience, usePerson } from '@/lib/api';
import { ROLE_LABEL, useAuth, type Role } from '@/lib/auth';

export const Route = createFileRoute('/people/$id')({
  head: () => ({ meta: [{ title: 'Profile — SITAM SPACE · SDU' }] }),
  component: PersonPage,
});

/** Public profile of a registered person: name, primary role, labs and a clickable e-mail. */
function PersonPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const q = usePerson(id, !!user);
  const exp = useExperience(user ? id : undefined);

  if (!loading && !user) {
    return (
      <main className="container content-page auth-page">
        <h1>Sign in to see contacts.</h1>
        <p className="page-intro">Names, roles and e-mails of SITAM SPACE members are visible to signed-in users.</p>
        <Button asChild><Link to="/login"><LogIn />Sign in</Link></Button>
      </main>
    );
  }
  if (q.isLoading || loading) return <main className="container content-page"><p className="small-note">Loading…</p></main>;
  if (q.error) return <main className="container content-page"><p className="form-alert">{humanError(q.error)}</p></main>;
  if (!q.data) {
    return (
      <main className="container content-page">
        <div className="empty-state"><UserRound /><h3>Person not found</h3><Button asChild variant="outline"><Link to="/labs"><ArrowLeft />Labs</Link></Button></div>
      </main>
    );
  }
  const { person, labs } = q.data;
  const name = personName(person);
  const details = [
    person.course ? `${person.course} course` : null, person.major, person.department, person.position,
  ].filter(Boolean).join(' · ');

  return (
    <main className="container content-page">
      <div className="profile-head">
        <span className="avatar" aria-hidden>{name.split(/\s+/).map((p) => p[0]?.toUpperCase()).slice(0, 2).join('')}</span>
        <div>
          <span className="eyebrow">{ROLE_LABEL[person.role as Role] ?? person.role}{labs.some((l) => l.role === 'lead' || l.role === 'co_lead') ? ' · LAB HEAD' : ''}</span>
          <h1>{name}</h1>
          {details && <p className="small-note">{details}</p>}
          <p className="mt-2"><PersonEmails person={person} size={15} /></p>
        </div>
        <div className="profile-head-actions">
          <Button asChild><a href={gmailCompose(person.email)} target="_blank" rel="noopener noreferrer"><Mail />Write an e-mail</a></Button>
        </div>
      </div>
      {person.bio && <section className="panel mb-4"><p className="lab-text">{person.bio}</p></section>}
      <section className="panel">
        <h3 className="panel-title"><FlaskConical size={15} />Labs</h3>
        {labs.filter((l) => l.labs).length ? (
          <ul className="rows">
            {labs.filter((l) => l.labs).map((l) => (
              <li key={l.labs?.slug}>
                <div><strong><Link to="/labs/$slug" params={{ slug: l.labs?.slug ?? '' }}>{l.labs?.name}</Link></strong><small>{LAB_POSITION_LABEL[l.role] ?? l.role}{l.title ? ` · ${l.title}` : ''}</small></div>
              </li>
            ))}
          </ul>
        ) : <p className="small-note">Not a member of a lab yet.</p>}
      </section>
      {exp.data && exp.data.length > 0 && (
        <section className="panel mt-4">
          <h3 className="panel-title"><Briefcase size={15} />Work & internships</h3>
          <ul className="rows">
            {exp.data.map((x, i) => (
              <li key={i}><div><strong>{x.role ? `${x.role} · ${x.company}` : x.company}</strong><small>{x.kind === 'internship' ? 'Internship' : 'Work'}{x.start ? ` · ${x.start.replace('-', '/')} – ${x.end ? x.end.replace('-', '/') : 'present'}` : ''}</small></div></li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
