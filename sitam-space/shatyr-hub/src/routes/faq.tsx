import { createFileRoute } from '@tanstack/react-router';
import { gmailCompose } from '@/lib/utils';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FaqList } from '@/components/faq-list';
import { pageHead } from '@/lib/hub-data';
import { BRAND } from '@/lib/sitam-data';
import { useAuth, personaOf } from '@/lib/auth';

export const Route = createFileRoute('/faq')({
  head: () => pageHead('FAQ', 'Answers about labs, research assistantships, events and industry collaboration at SITAM SDU.'),
  component: Faq,
});

function Faq() {
  const { profile, caps } = useAuth();
  const persona = personaOf(profile, caps);
  const audience = persona === 'lab_leader' ? 'leader' : persona === 'teacher' ? 'teacher' : persona === 'student' ? 'student' : 'all';
  return (
    <main className="container content-page auth-page">
      <h1>FAQ</h1>
      <div className="mt-6" />
      <FaqList prefer={audience} />
      <div className="profile-actions">
        <Button asChild><a href={gmailCompose(BRAND.contactEmail)} target="_blank" rel="noopener noreferrer">Ask the SITAM office<ArrowUpRight /></a></Button>
      </div>
    </main>
  );
}
