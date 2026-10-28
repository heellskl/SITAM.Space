import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { RegisterForm, RoleSwitch, type SignupKind } from '@/components/auth-forms';
import { pageHead } from '@/lib/hub-data';

export const Route = createFileRoute('/register')({
  validateSearch: (s: Record<string, unknown>): { role?: SignupKind } =>
    s['role'] === 'teacher' || s['role'] === 'partner' || s['role'] === 'student' ? { role: s['role'] } : {},
  head: () => pageHead('Sign up', 'Create a SITAM SPACE account.'),
  component: Register,
});

function Register() {
  const { role = 'student' } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <main className="container content-page auth-page">
      <h1>Create your account</h1>
      <RoleSwitch role={role} onChange={(r) => navigate({ to: '/register', search: { role: r }, replace: true })} />
      <RegisterForm role={role} />
    </main>
  );
}
