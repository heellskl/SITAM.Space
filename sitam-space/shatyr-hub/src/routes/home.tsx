import { createFileRoute, Link } from '@tanstack/react-router';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MyHome, type HomeTab } from '@/components/my-home';
import { useAuth } from '@/lib/auth';

// v19.1: the person's own Home (sidebar "Home"). The logo opens the public landing page at "/".
export const Route = createFileRoute('/home')({
  // v33: ?tab=awards opens the Awards tab (certificates); Personal info is the default
  validateSearch: (s: Record<string, unknown>): { tab?: HomeTab } => (s['tab'] === 'awards' ? { tab: 'awards' } : {}),
  head: () => ({ meta: [{ title: 'Home — SITAM SPACE · SDU' }] }),
  component: HomePage,
});

function HomePage() {
  const { user, loading } = useAuth();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  if (loading) return <main className="container content-page"><p className="small-note">Loading…</p></main>;
  if (!user) {
    return (
      <main className="container content-page auth-page">
        <span className="eyebrow">HOME</span>
        <h1>Sign in to see your SITAM SPACE.</h1>
        <p className="page-intro">Your research, labs, events and industry experience in one place.</p>
        <div className="profile-actions">
          <Button asChild><Link to="/login"><LogIn />Sign in</Link></Button>
          <Button asChild variant="outline"><Link to="/register">Create account</Link></Button>
        </div>
      </main>
    );
  }
  return <MyHome tab={tab ?? 'info'} onTab={(t) => navigate({ search: t === 'awards' ? { tab: 'awards' } : {}, replace: true })} />;
}
