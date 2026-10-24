import { createFileRoute, Navigate } from '@tanstack/react-router';
import { LoginForm } from '@/components/auth-forms';
import { useAuth } from '@/lib/auth';
import { pageHead } from '@/lib/hub-data';

export const Route = createFileRoute('/login')({
  head: () => pageHead('Sign in', 'Sign in to SITAM SPACE.'),
  component: Login,
});

/** E-mail + password for students, teachers and industry partners (code by e-mail if the password is forgotten). */
function Login() {
  const { user } = useAuth();
  if (user) return <Navigate to="/" />;
  return (
    <main className="container content-page auth-page">
      <h1>Sign in</h1>
      <div className="mt-6" />
      <LoginForm />
    </main>
  );
}
