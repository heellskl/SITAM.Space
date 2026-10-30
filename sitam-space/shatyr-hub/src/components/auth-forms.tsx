import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { ArrowUpRight, Building2, GraduationCap, Presentation, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { db, humanError } from '@/lib/api';
import { MAJORS, isSduEmail, useAuth } from '@/lib/auth';
import { DEPARTMENTS } from '@/lib/sitam-data';

export type SignupKind = 'student' | 'teacher' | 'partner';

type Errors = Record<string, string>;
const collect = (error: z.ZodError): Errors => Object.fromEntries(error.issues.map((i) => [String(i.path[0]), i.message]));

const anyEmail = z.string().trim().toLowerCase().email('Enter a valid e-mail.').max(255);
const sduEmail = anyEmail.refine(isSduEmail, 'Use your SDU e-mail (…@sdu.edu.kz or …@stu.sdu.edu.kz).');
const passwordField = z.string().min(8, 'Password must be at least 8 characters.').max(72);
const nameField = (label: string) => z.string().trim().min(2, `Enter your ${label}.`).max(60);

export function RoleSwitch({ role, onChange }: { role: SignupKind; onChange: (r: SignupKind) => void }) {
  const items = [
    { value: 'student' as const, label: 'Student', Icon: GraduationCap },
    { value: 'teacher' as const, label: 'Teacher', Icon: Presentation },
    { value: 'partner' as const, label: 'Industry partner', Icon: Building2 },
  ];
  return (
    <div className="role-switch role-switch-3" role="group" aria-label="Primary role">
      {items.map(({ value, label, Icon }) => (
        <button key={value} type="button" className={role === value ? 'role-option role-active' : 'role-option'} aria-pressed={role === value} onClick={() => onChange(value)}>
          <Icon size={18} />
          {label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string | undefined; hint?: string | undefined; children: ReactNode }) {
  return (
    <label>
      {label}
      {children}
      {hint && !error && <small className="field-hint">{hint}</small>}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

/* ───────────────────────────── LOGIN ───────────────────────────── */

export function LoginForm() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  // Code step: for accounts whose e-mail was never confirmed, or a forgotten password.
  const [codeFor, setCodeFor] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [sentAt, setSentAt] = useState<number | null>(null);
  const secondsLeft = useCountdown(sentAt);

  async function sendCode(address: string) {
    setFormError('');
    setInfo('');
    setBusy(true);
    // A one-time code to the account's e-mail; works for unconfirmed accounts and forgotten passwords.
    // The e-mail template decides what arrives: a sign-in link, a 6-digit code, or both.
    // The link must come back to the site the person is on (localhost while developing).
    const emailRedirectTo = `${window.location.origin}/profile`;
    let { error } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: false, emailRedirectTo } });
    if (error && /confirm|not.*confirmed/i.test(error.message)) {
      ({ error } = await supabase.auth.resend({ type: 'signup', email: address, options: { emailRedirectTo } }));
    }
    setBusy(false);
    if (error) {
      const wait = /after (\d+) seconds?/i.exec(error.message)?.[1];
      setFormError(wait ? `Please wait ${wait} s before asking for another code.` : /not found|signups not allowed/i.test(error.message) ? 'No account with this e-mail. Create one on the Register page.' : humanError(error));
      return;
    }
    setCodeFor(address);
    setSentAt(Date.now());
    setCode('');
    setInfo(`We e-mailed ${address}. Open the sign-in link in this browser — you will be signed in here. If the e-mail shows a code instead, enter it below. Check Spam if it is not in your inbox.`);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const parsed = z.object({ email: anyEmail, password: z.string().min(1, 'Enter your password.') }).safeParse({
      email: data.get('email'),
      password: data.get('password'),
    });
    if (!parsed.success) {
      setErrors(collect(parsed.error));
      setFormError('');
      return;
    }
    setErrors({});
    setFormError('');
    setBusy(true);
    let { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error && !/confirm/i.test(error.message)) {
      // Maybe the personal e-mail from Profile → Settings: the database returns the account's sign-in (SDU) e-mail,
      // but only for the right password; then sign in with that e-mail and the same password.
      const { data: signInEmail, error: lookupError } = await db.rpc('sign_in_email', { p_email: parsed.data.email, p_password: parsed.data.password });
      if (lookupError && /TOO_MANY/.test(lookupError.message)) {
        setBusy(false);
        setFormError(humanError(lookupError));
        return;
      }
      if (typeof signInEmail === 'string' && signInEmail && signInEmail !== parsed.data.email) {
        ({ error } = await supabase.auth.signInWithPassword({ email: signInEmail, password: parsed.data.password }));
      }
    }
    setBusy(false);
    if (error) {
      if (/confirm/i.test(error.message)) {
        // Registered earlier but never confirmed: finish it with a code instead of leaving the user stuck.
        await sendCode(parsed.data.email);
        return;
      }
      setFormError('Wrong e-mail or password. Forgot it? Use “E-mail me a sign-in link” below, then set a new password on your profile.');
      return;
    }
    await refresh();
    await navigate({ to: '/' });
  }

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!codeFor) return;
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return setFormError('Enter the code from the e-mail.');
    setBusy(true);
    setFormError('');
    let res = await supabase.auth.verifyOtp({ email: codeFor, token, type: 'email' });
    if (res.error || !res.data.user) res = await supabase.auth.verifyOtp({ email: codeFor, token, type: 'signup' });
    setBusy(false);
    if (res.error || !res.data.user) {
      setFormError(/expired/i.test(res.error?.message ?? '') ? 'This code has expired. Request a new one.' : 'The code is not correct. Use the newest e-mail.');
      return;
    }
    await refresh();
    await navigate({ to: '/' });
  }

  if (codeFor) {
    return (
      <form className="partner-form auth-form" onSubmit={verify} noValidate>
        {info && <p className="small-note" role="status">{info}</p>}
        <Field label="Code from the e-mail (only if the e-mail has one)">
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={10} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} className="otp-input" autoFocus />
        </Field>
        {formError && <p className="form-alert" role="alert">{formError}</p>}
        <Button type="submit" size="lg" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}<ArrowUpRight /></Button>
        <div className="otp-resend">
          <button type="button" className="link-button" onClick={() => void sendCode(codeFor)} disabled={secondsLeft > 0 || busy}>
            <RotateCw size={13} /> Send the e-mail again
          </button>
          {secondsLeft > 0 && <span className="otp-timer" aria-live="polite">0:{String(secondsLeft).padStart(2, '0')}</span>}
        </div>
        <p className="auth-switch"><button type="button" className="link-button" onClick={() => { setCodeFor(null); setInfo(''); setFormError(''); }}>Back</button></p>
      </form>
    );
  }

  return (
    <form className="partner-form auth-form" onSubmit={submit} noValidate>
      <Field label="E-mail" error={errors['email']}>
        <input name="email" type="email" autoComplete="email" placeholder="name@sdu.edu.kz" maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors['email']} />
        {!errors['email'] && <small className="field-hint">Your SDU e-mail, or the personal e-mail you added in Profile → Settings.</small>}
      </Field>
      <Field label="Password" error={errors['password']}>
        <input name="password" type="password" autoComplete="current-password" placeholder="Your password" maxLength={72} aria-invalid={!!errors['password']} />
      </Field>
      {formError && <p className="form-alert" role="alert">{formError}</p>}
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
        <ArrowUpRight />
      </Button>
      <p className="auth-switch">
        <button
          type="button"
          className="link-button"
          disabled={busy}
          onClick={() => {
            const parsed = anyEmail.safeParse(email);
            if (!parsed.success) return setErrors({ email: 'Enter your e-mail first.' });
            setErrors({});
            void sendCode(parsed.data);
          }}
        >
          Forgot password? E-mail me a sign-in link
        </button>
      </p>
    </form>
  );
}

/* ─────────────────────────── REGISTRATION ─────────────────────────── */

const OTHER_MAJOR = 'Other (type your own)';
const RESEND_SECONDS = 60;
const OLD_PENDING_KEY = 'sitam-pending-signup'; // the old code step; cleared so nobody gets stuck on it

/** Seconds left before "Send the code again" unlocks — always 60 → 0 after each sent code. */
function useCountdown(sentAt: number | null) {
  const [, setTick] = useState(0);
  const left = sentAt ? Math.min(RESEND_SECONDS, Math.max(0, Math.ceil((sentAt + RESEND_SECONDS * 1000 - Date.now()) / 1000))) : 0;
  useEffect(() => {
    if (!sentAt || left <= 0) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, [sentAt, left <= 0]);
  return left;
}

export function RegisterForm({ role }: { role: SignupKind }) {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [major, setMajor] = useState('');
  const [department, setDepartment] = useState('');

  useEffect(() => {
    try { localStorage.removeItem(OLD_PENDING_KEY); } catch { /* storage blocked */ }
  }, []);

  /** After a session exists: go to the profile (the CV is added there later, not at registration). */
  async function finish() {
    await refresh();
    await navigate({ to: '/profile' });
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const base = { firstName: nameField('first name'), lastName: nameField('last name'), password: passwordField };
    const majorField = z.string().trim().min(2, 'Choose or type your major.').max(100);
    const deptField = z.string().trim().min(2, 'Choose or type your department.').max(100);
    const schema =
      role === 'student'
        ? z.object({ ...base, email: sduEmail, course: z.enum(['1', '2', '3', '4', '5', '6'], { errorMap: () => ({ message: 'Choose your course.' }) }), major: majorField })
        : role === 'teacher'
          ? z.object({ ...base, email: sduEmail, department: deptField })
          : z.object({
              ...base,
              email: anyEmail,
              company: z.string().trim().min(2, 'Enter your company name.').max(120),
              position: z.string().trim().max(100).optional(),
              website: z.string().trim().max(200).refine((v) => !v || /^https?:\/\//i.test(v), 'Website must start with https://').optional(),
            });

    // "Other" lets people type their own major / department.
    const input = {
      ...data,
      major: major === OTHER_MAJOR ? data['majorCustom'] ?? '' : major,
      department: department === 'Other' ? data['departmentCustom'] ?? '' : department,
    };
    const parsed = schema.safeParse(input);
    const next: Errors = parsed.success ? {} : collect(parsed.error);
    if (!parsed.success || Object.keys(next).length) {
      setErrors(next);
      setFormError('');
      return;
    }
    setErrors({});
    setFormError('');
    setBusy(true);

    const v = parsed.data as Record<string, string>;
    const email = v['email'] ?? '';
    const { data: result, error } = await supabase.auth.signUp({
      email,
      password: v['password'] ?? '',
      options: {
        emailRedirectTo: `${window.location.origin}/profile`,
        data: {
          role,
          first_name: v['firstName'],
          last_name: v['lastName'],
          ...(role === 'student'
            ? { course: v['course'], major: v['major'] }
            : role === 'teacher'
              ? { department: v['department'] ?? '' }
              : { company: v['company'] ?? '', position: v['position'] ?? '', website: v['website'] ?? '' }),
        },
      },
    });

    if (error) {
      setBusy(false);
      setFormError(
        // Only a real "already registered" answer — not any message containing "exists" (e.g. "relation … does not exist").
        ['user_already_exists', 'email_exists'].includes((error as { code?: string }).code ?? '') || /already (been )?registered|user already exists/i.test(error.message)
          ? 'This e-mail is already registered. Please sign in instead.'
          : /rate limit|sending.*e-?mail/i.test(error.message)
            ? 'Too many sign-ups in a short time. Please wait a few minutes and try again.'
            : humanError(error),
      );
      return;
    }
    if (result.user && result.user.identities?.length === 0) {
      setBusy(false);
      setFormError('This e-mail is already registered. Please sign in instead.');
      return;
    }
    if (result.session && result.user) {
      await finish();
      setBusy(false);
      return;
    }
    // No e-mail code: the database confirms new accounts at once, so sign in with the chosen password.
    const signIn = await supabase.auth.signInWithPassword({ email, password: v['password'] ?? '' });
    if (signIn.error || !signIn.data.session) {
      setBusy(false);
      setFormError('Your account was created, but signing in failed. Please sign in on the Sign in page.');
      return;
    }
    await finish();
    setBusy(false);
  }

  const majorSelect = (
    <Field label="Major" error={errors['major']}>
      <select value={major} onChange={(e) => setMajor(e.target.value)} aria-invalid={!!errors['major']}>
        <option value="" disabled>Select major</option>
        {MAJORS.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </Field>
  );
  const customMajor = major === OTHER_MAJOR && (
    <Field label="Your major" error={errors['major']}>
      <input name="majorCustom" maxLength={100} placeholder="e.g. Bioinformatics" autoFocus />
    </Field>
  );
  const departmentSelect = (
    <Field label="Department / school" error={errors['department']} hint={role === 'teacher' ? 'Teacher accounts are verified by the SITAM office.' : undefined}>
      <select value={department} onChange={(e) => setDepartment(e.target.value)} aria-invalid={!!errors['department']}>
        <option value="" disabled>Select department</option>
        {DEPARTMENTS.map((d) => <option key={d} value={d}>{d === 'Other' ? 'Other (type your own)' : d}</option>)}
      </select>
    </Field>
  );
  const customDepartment = department === 'Other' && (
    <Field label="Your department" error={errors['department']}>
      <input name="departmentCustom" maxLength={100} placeholder="Department name" />
    </Field>
  );

  return (
    <form className="partner-form auth-form" onSubmit={submit} noValidate>
      {role === 'partner' && (
        <div className="modal-info">
          <strong><Building2 size={14} /> Industry partner account</strong>
          <span>Register with your company e-mail. The SITAM office verifies your company, after which you can publish vacancies, internships and projects and review applicants.</span>
        </div>
      )}
      <div className="auth-row">
        <Field label="First name" error={errors['firstName']}>
          <input name="firstName" autoComplete="given-name" maxLength={60} placeholder="Aigerim" aria-invalid={!!errors['firstName']} />
        </Field>
        <Field label="Last name" error={errors['lastName']}>
          <input name="lastName" autoComplete="family-name" maxLength={60} placeholder="Sarsembayeva" aria-invalid={!!errors['lastName']} />
        </Field>
      </div>
      <Field label={role === 'partner' ? 'Company e-mail' : 'SDU e-mail'} error={errors['email']} hint={role === 'partner' ? undefined : 'Only …@sdu.edu.kz and …@stu.sdu.edu.kz addresses can register.'}>
        <input name="email" type="email" autoComplete="email" maxLength={255} placeholder={role === 'partner' ? 'name@company.kz' : role === 'student' ? '220103001@stu.sdu.edu.kz' : 'name.surname@sdu.edu.kz'} aria-invalid={!!errors['email']} />
      </Field>
      <Field label="Password" error={errors['password']}>
        <input name="password" type="password" autoComplete="new-password" maxLength={72} placeholder="At least 8 characters" aria-invalid={!!errors['password']} />
      </Field>

      {role === 'student' && (
        <>
          <div className="auth-row">
            <Field label="Course" error={errors['course']}>
              <select name="course" defaultValue="" aria-invalid={!!errors['course']}>
                <option value="" disabled>Select course</option>
                {[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>{c <= 4 ? `${c} course (bachelor)` : `${c - 4} year (master)`}</option>)}
              </select>
            </Field>
            {majorSelect}
          </div>
          {customMajor}
        </>
      )}
      {role === 'teacher' && (
        <>
          {departmentSelect}
          {customDepartment}
        </>
      )}
      {role === 'partner' && (
        <>
          <Field label="Company" error={errors['company']} hint="If your company is already registered, use the exact same name to join it.">
            <input name="company" maxLength={120} placeholder="Company name" aria-invalid={!!errors['company']} />
          </Field>
          <div className="auth-row">
            <Field label="Your position" error={errors['position']}>
              <input name="position" maxLength={100} placeholder="HR lead, CTO…" />
            </Field>
            <Field label="Company website" error={errors['website']}>
              <input name="website" maxLength={200} placeholder="https://" aria-invalid={!!errors['website']} />
            </Field>
          </div>
        </>
      )}

      {formError && <p className="form-alert" role="alert">{formError}</p>}
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
        <ArrowUpRight />
      </Button>
      <p className="auth-switch">
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </form>
  );
}
