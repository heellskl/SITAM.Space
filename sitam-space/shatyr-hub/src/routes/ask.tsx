import { createFileRoute } from '@tanstack/react-router';
import { AskSitamPage } from '@/components/ask-sitam';
import { PageHero } from '@/components/page-hero';
import { pageHead } from '@/lib/hub-data';

// The big Ask SITAM: the same conversation as the floating chat ("Open as a page"), with the person's saved questions.
export const Route = createFileRoute('/ask')({
  head: () => pageHead('Ask SITAM', 'Ask about labs, supervisors, papers, events and internships at SITAM. Answers come from SITAM SPACE pages.'),
  component: Ask,
});

function Ask() {
  return (
    <main className="container content-page">
      <PageHero title="Ask SITAM" text="Ask about labs, supervisors, papers, events or internships. Every answer shows the SITAM SPACE pages it comes from, and your questions are saved on the right." />
      <AskSitamPage />
    </main>
  );
}
