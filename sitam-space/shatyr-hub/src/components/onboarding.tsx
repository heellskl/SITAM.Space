// v17 onboarding & roles: alumni "Offer help", lab heads' inbox of offers, researcher profile requests / claims,
// the coordinator's review, and a teacher editing their own researcher card. The database checks every right.

import { useMemo, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { Check, HandHeart, Mail, Pencil, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { TagInput } from '@/components/tag-input';
import {
  HELP_KIND_LABEL, humanError, personName, useHelpOffers, useLabs, usePeople, useOfferHelp, useRequestResearcherProfile,
  useResearcherRequests, useRespondOffer, useReviewResearcherRequest, useUnlinkedResearchers, useUpdateMyResearcher,
  type HelpOffer, type Professor, type ResearcherExtra,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { gmailCompose } from '@/lib/utils';

/* ───────────── alumni: "Offer help" on a lab page ───────────── */
export function OfferHelpButton({ labId, labName }: { labId: string; labName: string }) {
  const { caps } = useAuth();
  const offer = useOfferHelp();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<HelpOffer['kind']>('mentor');
  const [error, setError] = useState('');
  if (!caps.isAlumni) return null;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const message = String(new FormData(e.currentTarget).get('message') ?? '').trim();
    if (message.length < 10) return setError('Write a few words about how you can help (10+ characters).');
    try {
      await offer.mutateAsync({ labId, kind, message });
      toast.success('Offer sent', { description: `The heads of ${labName} will see it in Manage.` });
      setOpen(false);
    } catch (err) { setError(humanError(err)); }
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><HandHeart />Offer help</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="hub-dialog">
          <span className="eyebrow">SDU Alumni</span>
          <DialogTitle>Offer help to {labName}</DialogTitle>
          <DialogDescription>The lab heads get your offer with your name and e-mail and answer you directly.</DialogDescription>
          <form className="partner-form auth-form" onSubmit={submit} noValidate>
            <fieldset><legend>I can help as</legend>
              <div className="seg" role="radiogroup" aria-label="I can help as">
                {(Object.keys(HELP_KIND_LABEL) as HelpOffer['kind'][]).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'is-on' : ''} onClick={() => setKind(k)}>
                    {k === 'mentor' ? 'Mentor' : k === 'speaker' ? 'Guest speaker' : 'Research advisor'}
                  </button>
                ))}
              </div>
            </fieldset>
            <label>Message<textarea name="message" rows={4} maxLength={2000} placeholder="What you do now, what you can offer, how much time you have." /></label>
            {error && <p className="form-alert" role="alert">{error}</p>}
            <Button type="submit" disabled={offer.isPending}>{offer.isPending ? 'Sending…' : 'Send offer'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────── lab heads: offers of help (Manage) ───────────── */
export function OffersPanel() {
  const { caps } = useAuth();
  const offers = useHelpOffers(true);
  const labs = useLabs();
  const respond = useRespondOffer();
  const list = (offers.data ?? []).filter((o) => caps.isAdmin || caps.managedLabs.some((m) => m.id === o.lab_id));
  const people = usePeople(list.map((o) => o.user_id));
  const personOf = new Map((people.data ?? []).map((p) => [p.id, p]));
  const labOf = new Map((labs.data ?? []).map((l) => [l.id, l]));
  if (offers.error) return <p className="small-note">Offers of help are not set up yet (run the v17 SQL).</p>;
  if (!offers.isLoading && !list.length) return <div className="dash-empty"><strong>No offers yet</strong>SDU alumni can offer to mentor students, speak at events or advise research. Their offers appear here.</div>;
  return (
    <ul className="offer-list">
      {list.map((o) => {
        const p = personOf.get(o.user_id);
        const lab = labOf.get(o.lab_id);
        return (
          <li key={o.id} className={`panel offer-item is-${o.status}`}>
            <div className="offer-head">
              <strong>{p ? personName(p) : 'SDU alumnus'}</strong>
              <span className={`pill ${o.status === 'accepted' ? 'pill-live' : o.status === 'declined' ? 'pill-done' : 'pill-gold'}`}>{o.status === 'new' ? 'New' : o.status === 'accepted' ? 'Accepted' : 'Declined'}</span>
            </div>
            <p className="small-note">
              {HELP_KIND_LABEL[o.kind]}{lab ? <> · <Link to="/labs/$slug" params={{ slug: lab.slug }}>{lab.name}</Link></> : null}
              {p?.position || p?.company ? ` · ${[p?.position, p?.company].filter(Boolean).join(', ')}` : ''}
              {p?.graduation_year ? ` · class of ${p.graduation_year}` : ''}
            </p>
            <p className="offer-msg">{o.message}</p>
            <div className="dialog-actions wrap">
              {p && <Button asChild size="sm" variant="outline"><a href={gmailCompose(p.email)} target="_blank" rel="noopener noreferrer"><Mail />Reply by e-mail</a></Button>}
              {o.status !== 'accepted' && <Button size="sm" disabled={respond.isPending} onClick={() => respond.mutate({ id: o.id, status: 'accepted' }, { onError: (e) => toast.error(humanError(e)) })}><Check />Accept</Button>}
              {o.status !== 'declined' && <Button size="sm" variant="ghost" disabled={respond.isPending} onClick={() => respond.mutate({ id: o.id, status: 'declined' }, { onError: (e) => toast.error(humanError(e)) })}><X />Decline</Button>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Alumni: their own offers and the answers (Profile). */
export function MyOffers() {
  const { caps } = useAuth();
  const offers = useHelpOffers(caps.isAlumni);
  const labs = useLabs();
  if (!caps.isAlumni) return null;
  const labOf = new Map((labs.data ?? []).map((l) => [l.id, l]));
  const list = offers.data ?? [];
  return (
    <section className="panel" aria-labelledby="my-offers">
      <h3 className="panel-title" id="my-offers"><HandHeart size={15} />My offers of help</h3>
      {list.length === 0 ? <p className="small-note">Open a lab page and press “Offer help” to mentor students, speak at an event or advise research.</p> : (
        <ul className="rows">
          {list.map((o) => (
            <li key={o.id}><div><strong>{labOf.get(o.lab_id)?.name ?? 'Lab'}</strong><small>{HELP_KIND_LABEL[o.kind]} · {o.status === 'new' ? 'waiting for an answer' : o.status}</small></div></li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ───────────── teachers: request a researcher profile / claim a card ───────────── */
export function RequestResearcherCta({ empty }: { empty?: boolean }) {
  const { caps, profile, user } = useAuth();
  const mine = useResearcherRequests(!!user && (caps.isTeacher || caps.isPhd));
  const [open, setOpen] = useState(false);
  if (!user || !(caps.isTeacher || caps.isPhd) || caps.professorUsername) return null;
  const pending = (mine.data ?? []).find((r) => r.status === 'pending');
  const rejected = (mine.data ?? []).find((r) => r.status === 'rejected');
  return (
    <div className={empty ? 'claim-cta is-empty' : 'claim-cta'}>
      <div>
        <strong>Can't find yourself in the list?</strong>
        <span>{pending ? 'Your request is waiting for the SITAM coordinator.' : rejected && !pending ? `Your last request was not approved${rejected.review_note ? `: ${rejected.review_note}` : '.'} You can send a new one.` : 'Request a researcher profile, or claim your card if it is already here.'}</span>
      </div>
      {!pending && <Button size="sm" onClick={() => setOpen(true)}><UserPlus />Request a Researcher Profile</Button>}
      {open && <RequestDialog name={profile ? `${profile.firstName} ${profile.lastName}`.trim() : ''} department={profile?.department ?? ''} onClose={() => setOpen(false)} />}
    </div>
  );
}

function RequestDialog({ name, department, onClose }: { name: string; department: string; onClose: () => void }) {
  const request = useRequestResearcherProfile();
  const unlinked = useUnlinkedResearchers(true);
  const [mode, setMode] = useState<'new' | 'claim'>('new');
  const [claimId, setClaimId] = useState('');
  const [error, setError] = useState('');
  const sorted = useMemo(() => [...(unlinked.data ?? [])].sort((a, b) => a.full_name.localeCompare(b.full_name)), [unlinked.data]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim() || null;
    if (mode === 'claim' && !claimId) return setError('Choose your card.');
    if ((s('full_name') ?? '').length < 3) return setError('Enter your full name.');
    for (const k of ['scopus_url', 'orcid_url', 'scholar_url']) if (s(k) && !/^https?:\/\//i.test(s(k)!)) return setError('Links must start with https://');
    try {
      await request.mutateAsync({
        professor_id: mode === 'claim' ? claimId : null, full_name: s('full_name')!, department: s('department'), title: s('title'), degree: s('degree'),
        scopus_url: s('scopus_url'), orcid_url: s('orcid_url'), scholar_url: s('scholar_url'), note: s('note'),
      });
      toast.success('Request sent', { description: 'The SITAM coordinator will review it.' });
      onClose();
    } catch (err) { setError(humanError(err)); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="hub-dialog wide">
        <span className="eyebrow">Researcher profile</span>
        <DialogTitle>Request a Researcher Profile</DialogTitle>
        <DialogDescription>After the coordinator approves, the card is linked to your account and you can edit it: bio, research interests, office hours and links.</DialogDescription>
        <form className="partner-form auth-form" onSubmit={submit} noValidate>
          <div className="seg" role="radiogroup" aria-label="Request type">
            <button type="button" role="radio" aria-checked={mode === 'new'} className={mode === 'new' ? 'is-on' : ''} onClick={() => setMode('new')}>Create a new card</button>
            <button type="button" role="radio" aria-checked={mode === 'claim'} className={mode === 'claim' ? 'is-on' : ''} onClick={() => setMode('claim')}>My card is already here</button>
          </div>
          {mode === 'claim' && (
            <label>Your card
              <select value={claimId} onChange={(e) => setClaimId(e.target.value)}>
                <option value="">Select your name</option>
                {sorted.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.job_title ? ` — ${p.job_title}` : ''}</option>)}
              </select>
            </label>
          )}
          <div className="auth-row">
            <label>Full name<input name="full_name" defaultValue={name} maxLength={160} /></label>
            <label>Department<input name="department" defaultValue={department} maxLength={160} placeholder="Computer Science" /></label>
          </div>
          <div className="auth-row">
            <label>Academic title<input name="title" maxLength={160} placeholder="Associate Professor" /></label>
            <label>Degree<input name="degree" maxLength={120} placeholder="PhD" /></label>
          </div>
          <label>Scopus profile<input name="scopus_url" placeholder="https://www.scopus.com/authid/detail.uri?authorId=…" /></label>
          <div className="auth-row">
            <label>ORCID<input name="orcid_url" placeholder="https://orcid.org/…" /></label>
            <label>Google Scholar<input name="scholar_url" placeholder="https://scholar.google.com/…" /></label>
          </div>
          <label>Note for the coordinator (optional)<textarea name="note" rows={2} maxLength={1000} /></label>
          {error && <p className="form-alert" role="alert">{error}</p>}
          <Button type="submit" disabled={request.isPending}>{request.isPending ? 'Sending…' : 'Send request'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── coordinator: pending researcher requests (Admin) ───────────── */
export function ResearcherRequestsAdmin() {
  const all = useResearcherRequests(true);
  const review = useReviewResearcherRequest();
  const pending = (all.data ?? []).filter((r) => r.status === 'pending');
  const people = usePeople(pending.map((r) => r.user_id));
  const emailOf = new Map((people.data ?? []).map((p) => [p.id, p.email]));
  const unlinked = useUnlinkedResearchers(pending.some((r) => r.professor_id));
  const cardName = new Map((unlinked.data ?? []).map((p) => [p.id, p.full_name]));
  const act = (id: string, approve: boolean) => {
    const note = approve ? undefined : window.prompt('Reason (optional, the teacher will see it):') ?? undefined;
    review.mutate({ id, approve, ...(note ? { note } : {}) }, {
      onSuccess: () => toast.success(approve ? 'Approved — the card is linked to the teacher' : 'Request declined'),
      onError: (e) => toast.error(humanError(e)),
    });
  };
  return (
    <section className="panel mt-6" id="pending-claims" aria-labelledby="pending-claims-title">
      <h3 className="panel-title" id="pending-claims-title"><UserPlus size={15} />Researcher profile requests{pending.length ? ` · ${pending.length}` : ''}</h3>
      {all.error ? <p className="small-note">Not set up yet (run the v17 SQL).</p> : pending.length === 0 ? <p className="small-note">No requests waiting.</p> : (
        <ul className="offer-list">
          {pending.map((r) => (
            <li key={r.id} className="offer-item">
              <div className="offer-head"><strong>{r.full_name}</strong><span className="pill pill-gold">{r.professor_id ? 'Claims a card' : 'New card'}</span></div>
              <p className="small-note">
                {[r.title, r.degree, r.department].filter(Boolean).join(' · ')}{emailOf.get(r.user_id) ? ` · ${emailOf.get(r.user_id)}` : ''}
                {r.professor_id ? ` · card: ${cardName.get(r.professor_id) ?? 'selected card'}` : ''}
              </p>
              <p className="small-note">
                {[['Scopus', r.scopus_url], ['ORCID', r.orcid_url], ['Scholar', r.scholar_url]].filter(([, u]) => u).map(([l, u]) => <a key={l} href={u!} target="_blank" rel="noopener noreferrer" className="claim-link">{l}</a>)}
              </p>
              {r.note && <p className="offer-msg">{r.note}</p>}
              <div className="dialog-actions wrap">
                <Button size="sm" disabled={review.isPending} onClick={() => act(r.id, true)}><Check />Approve</Button>
                <Button size="sm" variant="ghost" disabled={review.isPending} onClick={() => act(r.id, false)}><X />Reject</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ───────────── a teacher edits their own researcher card ───────────── */
export function EditMyResearcher({ prof, extra }: { prof: Professor; extra: ResearcherExtra }) {
  const update = useUpdateMyResearcher();
  const [open, setOpen] = useState(false);
  const [interests, setInterests] = useState<string[]>(extra.interests ?? []);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim();
    try {
      await update.mutateAsync({ bio: s('bio'), office_hours: s('office_hours'), interests, orcid_url: s('orcid_url'), scholar_url: s('scholar_url'), scopus_id: s('scopus_id') });
      toast.success('Profile saved');
      setOpen(false);
    } catch (err) { setError(humanError(err)); }
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Pencil />Edit my profile</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="hub-dialog wide">
          <span className="eyebrow">Your researcher profile</span>
          <DialogTitle>{prof.full_name}</DialogTitle>
          <DialogDescription>Publications and citations come from Scopus. Here you add what Scopus does not know.</DialogDescription>
          <form className="partner-form auth-form" onSubmit={submit} noValidate>
            <label>Bio<textarea name="bio" rows={4} maxLength={3000} defaultValue={extra.bio ?? ''} placeholder="Your research, teaching and the students you are looking for." /></label>
            <div className="form-field"><span className="form-label">Research interests</span>
              <TagInput label="Research interests" value={interests} onChange={setInterests} suggestions={prof.keywords} placeholder="Type and press Enter: NLP, Computer vision…" />
            </div>
            <label>Office hours<input name="office_hours" maxLength={300} defaultValue={extra.office_hours ?? ''} placeholder="Tue 14:00–16:00, room F305" /></label>
            <div className="auth-row">
              <label>ORCID<input name="orcid_url" defaultValue={prof.orcid_url ?? ''} placeholder="https://orcid.org/…" /></label>
              <label>Google Scholar<input name="scholar_url" defaultValue={prof.scholar_url ?? ''} placeholder="https://scholar.google.com/…" /></label>
            </div>
            <label>Scopus Author ID<input name="scopus_id" inputMode="numeric" defaultValue={prof.scopus_id ?? ''} placeholder="57190000000" /></label>
            {error && <p className="form-alert" role="alert">{error}</p>}
            <Button type="submit" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
