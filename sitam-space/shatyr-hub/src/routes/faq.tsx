import { createFileRoute } from '@tanstack/react-router';
import { gmailCompose } from '@/lib/utils';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FaqList } from '@/components/faq-list';
import { AskSitamPage } from '@/components/ask-sitam';
import { pageHead } from '@/lib/hub-data';
import { BRAND } from '@/lib/sitam-data';
import { useAuth, personaOf } from '@/lib/auth';

type FaqTab = 'faq' | 'ask';

export const Route = createFileRoute('/faq')({
  head: () => pageHead('FAQ', 'Answers about labs, research assistantships, events and industry collaboration at SITAM SDU.'),
  validateSearch: (s: Record<string, unknown>): { tab?: FaqTab } => (s['tab'] === 'ask' ? { tab: 'ask' } : {}),
  component: Faq,
});

function Faq() {
  const { profile, caps } = useAuth();
  const { tab = 'faq' } = Route.useSearch();
  const navigate = Route.useNavigate();
  const persona = personaOf(profile, caps);
  const audience = persona === 'lab_leader' ? 'leader' : persona === 'teacher' ? 'teacher' : persona === 'student' ? 'student' : 'all';
  return (
    <main className="container content-page faq-page">
      {/* the tabs come first; the big "FAQ" heading shows only on the FAQ tab */}
      <Tabs value={tab} onValueChange={(v) => void navigate({ search: v === 'ask' ? { tab: 'ask' } : {}, replace: true })}>
        <TabsList className="manage-tabs faq-menu">
          <TabsTrigger value="faq">FAQ</TabsTrigger>
          <TabsTrigger value="ask">Ask SITAM AI</TabsTrigger>
        </TabsList>
        <TabsContent value="faq" className="faq-tab">
          <h1>FAQ</h1>
          <div className="mt-6" />
          <FaqList prefer={audience} />
          <div className="profile-actions">
            <Button asChild><a href={gmailCompose(BRAND.contactEmail)} target="_blank" rel="noopener noreferrer">Ask the SITAM office<ArrowUpRight /></a></Button>
          </div>
        </TabsContent>
        <TabsContent value="ask">
          <AskSitamPage />
        </TabsContent>
      </Tabs>
    </main>
  );
}
