// Lab Passport (Зертхана паспорты, v29): the official dean's-office document of a lab for a year.
// Opened from the lab page (/labs/$slug?passport=1) by the heads of the lab and the coordinator.
// The form starts from what the lab profile already has; "Download Passport as PDF" prints the official layout.
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/back-button';
import {
  HEAD_ROLES, PASSPORT_YEAR, humanError, useApproveLabPassport, useLabPassport, useSaveLabPassport,
  type Lab, type LabPassportDraft,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Field = { key: keyof LabPassportDraft; kz: string; en: string; hint: string; rows: number };
const FIELDS: Field[] = [
  { key: 'official_name', kz: 'Бөлім/зертхана атауы', en: 'Official lab name', hint: 'Full official name of the department / laboratory', rows: 1 },
  { key: 'room', kz: 'Бөлме нөмірі', en: 'Room number & location', hint: 'Room, block, floor', rows: 1 },
  { key: 'head', kz: 'Жетекшісі', en: 'Responsible head', hint: 'Name, position and e-mail of the head(s)', rows: 2 },
  { key: 'equipment', kz: 'Техникалық жабдықтар тізімі', en: 'Technical equipment & specifications', hint: 'One item per line: name, model, quantity, specifications', rows: 6 },
  { key: 'software', kz: 'Бағдарламалық қамтамасыз ету', en: 'Software & licenses', hint: 'One item per line: software, version, licence type, number of seats', rows: 5 },
  { key: 'projects_grants', kz: 'Ғылыми жобалар мен гранттар', en: 'Research projects & grants', hint: 'One per line: project or grant, funder, years, status', rows: 6 },
  { key: 'kpi_outcomes', kz: 'Студенттерді тарту мен нәтижелер', en: 'KPI / student involvement & outcomes', hint: 'Students involved, theses, publications, awards, competitions', rows: 6 },
];

const lines = (xs: (string | null | undefined)[]) => xs.map((x) => (x ?? '').trim()).filter(Boolean).join('\n');
const splitItems = (s: string | null) => (s ?? '').split(/\n|;|•/).map((x) => x.trim()).filter(Boolean);

/** What the lab profile already knows, as a first version of the passport. */
function fromLab(lab: Lab): LabPassportDraft {
  const people = lab.lab_members.filter((m) => !m.is_past);
  const heads = people.filter((m) => HEAD_ROLES.includes(m.role));
  const students = people.filter((m) => !HEAD_ROLES.includes(m.role));
  return {
    official_name: lab.name,
    room: lab.location || '',
    head: heads.map((h) => h.full_name).join(', '),
    equipment: lines(splitItems(lab.equipment)),
    software: lines(lab.skills ?? []),
    projects_grants: lines([...lab.grants.map((g) => `Grant: ${g}`), ...lab.ongoing_projects.map((p) => `Project (ongoing): ${p}`), ...lab.completed_projects.map((p) => `Project (completed): ${p}`)]),
    kpi_outcomes: lines([
      `Team members (not heads): ${students.length}`,
      lab.completed_projects.length ? `Completed projects: ${lab.completed_projects.length}` : '',
      ...lab.awards.map((a) => `Award: ${a}`),
      ...lab.courses.map((c) => `Course: ${c}`),
    ]),
  };
}

const STATUS_LABEL = { draft: 'Draft', submitted: "Submitted to the dean's office", approved: 'Approved' } as const;

export function LabPassportForm({ lab }: { lab: Lab }) {
  const { caps } = useAuth();
  const year = PASSPORT_YEAR;
  const saved = useLabPassport(lab.id, year);
  const save = useSaveLabPassport();
  const approve = useApproveLabPassport();
  const prefill = useMemo(() => fromLab(lab), [lab]);
  const [draft, setDraft] = useState<LabPassportDraft>(prefill);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);

  // a saved passport replaces the first version from the profile
  useEffect(() => {
    if (saved.data) setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, saved.data?.[f.key] ?? ''])) as LabPassportDraft);
  }, [saved.data]);

  const status = saved.data?.status;
  const run = (submit: boolean) => {
    setNote(''); setError(null);
    save.mutate({ labId: lab.id, year, draft, submit }, { onSuccess: () => setNote(submit ? "Submitted to the dean's office." : 'Saved.'), onError: setError });
  };
  const download = () => {
    const title = document.title;
    document.title = `Lab Passport ${year} - ${lab.name}`;
    document.body.classList.add('printing-passport');
    const done = () => { document.body.classList.remove('printing-passport'); document.title = title; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };

  return (
    <main className="container content-page passport-page">
      <BackButton fallback={`/labs/${lab.slug}`} />
      <div className="page-head-row">
        <div>
          <h1>Lab Passport · {year}</h1>
          <p className="small-note">Зертхана паспорты — {lab.name}{status ? ` · ${STATUS_LABEL[status]}` : ''}</p>
        </div>
      </div>
      {!saved.data && !saved.isLoading && <p className="small-note">Filled in from the lab profile. Check every field, then save or submit it.</p>}

      <form className="partner-form passport-form" onSubmit={(e) => { e.preventDefault(); run(false); }}>
        {FIELDS.map((f) => (
          <label key={f.key}>
            <span><strong>{f.en}</strong> / {f.kz}</span>
            {f.rows === 1
              ? <input value={draft[f.key] ?? ''} maxLength={300} placeholder={f.hint} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
              : <textarea value={draft[f.key] ?? ''} rows={f.rows} maxLength={8000} placeholder={f.hint} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />}
          </label>
        ))}
        {error != null && <p className="form-alert">{humanError(error)}</p>}
        {note && <p className="small-note" role="status">{note}</p>}
        <div className="editor-actions">
          <Button type="button" variant="outline" onClick={download}><Download />Download Passport as PDF</Button>
          <Button type="submit" variant="outline" disabled={save.isPending}><Save />Save draft</Button>
          <Button type="button" className="editor-save" disabled={save.isPending} onClick={() => run(true)}><Send />Submit to the dean's office</Button>
          {caps.isAdmin && status === 'submitted' && (
            <Button type="button" disabled={approve.isPending} onClick={() => { setError(null); approve.mutate({ labId: lab.id, year }, { onSuccess: () => setNote('Approved.'), onError: setError }); }}><CheckCircle2 />Approve</Button>
          )}
        </div>
      </form>

      {/* the official layout: shown only when printing ("Download Passport as PDF" → Save as PDF) */}
      <article className="passport-doc" aria-hidden>
        <header>
          <p>SDU University · School of Information Technologies and Applied Mathematics</p>
          <h1>ЗЕРТХАНА ПАСПОРТЫ</h1>
          <h2>LAB PASSPORT · {year}</h2>
        </header>
        <table>
          <tbody>
            {FIELDS.map((f, i) => (
              <tr key={f.key}>
                <th><span>{i + 1}.</span> {f.kz}<small>{f.en}</small></th>
                <td>{(draft[f.key] ?? '').split('\n').map((l, j) => <div key={j}>{l || ' '}</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <footer>
          <div><span>Жетекшісі / Head</span><i /></div>
          <div><span>Деканат / Dean&apos;s office</span><i /></div>
          <div><span>Күні / Date</span><i /></div>
        </footer>
      </article>
    </main>
  );
}
