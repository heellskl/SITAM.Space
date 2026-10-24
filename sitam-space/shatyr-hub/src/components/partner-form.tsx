import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { humanError, useSubmitBrief, type PartnerRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const TYPES: { value: PartnerRequest['request_type']; label: string }[] = [
  { value: 'rnd', label: 'R&D research' },
  { value: 'mvp', label: 'MVP outsourcing' },
  { value: 'hiring', label: 'Hiring' },
  { value: 'sponsorship', label: 'Sponsorship' },
];
const BUDGETS = ['< ₸ 1M', '₸ 1–5M', '₸ 5–20M', '> ₸ 20M', 'In-kind / equipment'] as const;

const schema = z.object({
  company_name: z.string().trim().min(2, 'Enter a company name (at least 2 characters).').max(120),
  contact_name: z.string().trim().min(2, 'Enter a contact person.').max(120),
  contact_email: z.string().trim().email('Enter a valid e-mail so we can reply.').max(255),
  tech_stack: z.string().trim().min(2, 'Tell us about your technology stack.').max(200),
  description: z.string().trim().min(20, 'Please describe your project in at least 20 characters.').max(2000),
});

export function PartnerForm() {
  const { user, profile, caps } = useAuth();
  const submit = useSubmitBrief();
  const [type, setType] = useState<PartnerRequest['request_type']>('rnd');
  const [budget, setBudget] = useState<'yes' | 'no'>('yes');
  const [range, setRange] = useState<string>(BUDGETS[1]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = schema.safeParse(Object.fromEntries(d.entries()));
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    try {
      await submit.mutateAsync({ ...r.data, request_type: type, has_budget: budget === 'yes', budget_range: budget === 'yes' ? range : null });
      setDone(r.data.company_name);
      toast.success('Brief sent to the SITAM office', { description: r.data.company_name });
    } catch (err) {
      toast.error('Could not send', { description: humanError(err) });
    }
  }

  if (done) {
    return (
      <div className="partner-success" role="status">
        <CheckCircle2 size={40} />
        <h2>Thank you — your brief is in.</h2>
        <p>The SITAM office received the request from <strong>{done}</strong> and will reply by e-mail with a suggested lab or supervisor. {user ? 'You can follow its status in Manage → My briefs.' : ''}</p>
        <Button variant="outline" onClick={() => setDone(null)}>Send another brief</Button>
      </div>
    );
  }

  const err = (k: string) => (errors[k] ? <small className="field-error">{errors[k]}</small> : null);
  return (
    <form className="partner-form" onSubmit={onSubmit} noValidate>
      <label>Company name<input name="company_name" maxLength={120} defaultValue={caps.companies[0]?.name ?? ''} placeholder="Your company" aria-invalid={!!errors['company_name']} />{err('company_name')}</label>
      <div className="auth-row">
        <label>Contact person<input name="contact_name" maxLength={120} defaultValue={profile ? `${profile.firstName} ${profile.lastName}`.trim() : ''} aria-invalid={!!errors['contact_name']} />{err('contact_name')}</label>
        <label>Contact e-mail<input name="contact_email" type="email" maxLength={255} defaultValue={user?.email ?? ''} aria-invalid={!!errors['contact_email']} />{err('contact_email')}</label>
      </div>
      <fieldset>
        <legend>Request type</legend>
        <div className="request-options">
          {TYPES.map((t) => <Button key={t.value} type="button" variant="outline" className={type === t.value ? 'request-selected' : ''} onClick={() => setType(t.value)} aria-pressed={type === t.value}>{t.label}</Button>)}
        </div>
      </fieldset>
      <fieldset>
        <legend>Budget availability</legend>
        <div className="budget-options">
          {(['yes', 'no'] as const).map((b) => <label key={b}><input type="radio" name="budget" checked={budget === b} onChange={() => setBudget(b)} />{b === 'yes' ? 'Budget available' : 'Not yet'}</label>)}
        </div>
        {budget === 'yes' && (
          <div className="filter-list mt-3 wrap">
            {BUDGETS.map((b) => <Button key={b} type="button" variant="ghost" className={range === b ? 'filter active' : 'filter'} onClick={() => setRange(b)}>{b}</Button>)}
          </div>
        )}
      </fieldset>
      <label>Tech stack<input name="tech_stack" maxLength={200} placeholder="e.g. Python, React, computer vision" aria-invalid={!!errors['tech_stack']} />{err('tech_stack')}</label>
      <label>Project description<textarea name="description" maxLength={2000} rows={5} placeholder="Your challenge, goals and expected timeline…" aria-invalid={!!errors['description']} />{err('description')}</label>
      <div className="form-bottom">
        <small>Goes to the SITAM office. Only you and SITAM staff can read it.</small>
        <Button type="submit" disabled={submit.isPending}>{submit.isPending ? 'Sending…' : 'Send project brief'}<ArrowUpRight /></Button>
      </div>
    </form>
  );
}
