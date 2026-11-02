import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { gmailCompose } from '@/lib/utils';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FaqList } from '@/components/faq-list';
import { pageHead } from '@/lib/hub-data';
import { BRAND } from '@/lib/sitam-data';
import { useAuth, personaOf } from '@/lib/auth';

export const Route = createFileRoute('/faq')({
  head: () => pageHead('FAQ', 'Answers about labs, research assistantships, events and industry collaboration at SITAM SDU.'),
  // the AI chat has its own page now (one chat, not two); old links /faq?tab=ask go there
  beforeLoad: ({ search }) => {
    if ((search as Record<string, unknown>)['tab'] === 'ask') throw redirect({ to: '/ask', replace: true });
  },
  component: Faq,
});

function Faq() {
  const { profile, caps, user } = useAuth();
  const persona = personaOf(profile, caps);
  const audience = persona === 'lab_leader' ? 'leader' : persona === 'teacher' ? 'teacher' : persona === 'student' ? 'student' : 'all';
  return (
    <main className="container content-page faq-page">
      <FaqList prefer={audience} />
      <div className="profile-actions">
        {user && <Button asChild><Link to="/ask"><Sparkles />Ask SITAM</Link></Button>}
        <Button asChild variant={user ? 'outline' : 'default'}><a href={gmailCompose(BRAND.contactEmail)} target="_blank" rel="noopener noreferrer">Ask the SITAM office<ArrowUpRight /></a></Button>
      </div>
    </main>
  );
}
