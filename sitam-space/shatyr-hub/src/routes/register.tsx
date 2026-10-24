import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { RegisterForm, RoleSwitch, type SignupKind } from '@/components/auth-forms';
import { pageHead } from '@/lib/hub-data';

export const Route = createFileRoute('/register')({
  validateSearch: (s: Record<string, unknown>): { role?: SignupKind } =>
    s['role'] === 'teacher' || s['role'] === 'partner' || s['role'] === 'student' ? { role: s['role'] } : {},
  head: () => pageHead('Sign up', 'Create a SITAM SPACE account.'),
  component: Register,
});

const INTRO: Record<SignupKind, string> = {
  student: 'Use your SDU e-mail. You can add your CV later on your profile — every application reuses it.',
  teacher: 'Use your @sdu.edu.kz e-mail and choose your department.',
  partner: 'For companies: publish vacancies, internships and projects for SDU students after a quick verification.',
};

function Register() {
  const { role = 'student' } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <main className="container content-page auth-page">
      <h1>Create your account</h1>
      <p className="page-intro">{INTRO[role]}</p>
      <RoleSwitch role={role} onChange={(r) => navigate({ to: '/register', search: { role: r }, replace: true })} />
      <RegisterForm role={role} />
    </main>
  );
}
