import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/search-bar';
import { FAQ_AUDIENCE_LABEL, faqs, roleFaqs, type FaqAudience } from '@/lib/sitam-data';

type Item = { q: string; a: string; audience: FaqAudience };
const ALL: Item[] = [...roleFaqs, ...faqs.map((f) => ({ q: f.q, a: f.a, audience: 'all' as const }))];
const AUDIENCES: FaqAudience[] = ['all', 'leader', 'teacher', 'student'];

/** `prefer`: the reader's own audience is listed first (everything stays visible). */
export function FaqList({ prefer = 'all' }: { prefer?: FaqAudience }) {
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState<FaqAudience>('all');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = (f: Item) => (f.audience === prefer ? 0 : f.audience === 'all' ? 2 : 1);
    return ALL.filter((f) => (audience === 'all' || f.audience === audience) && `${f.q} ${f.a}`.toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b));
  }, [query, audience, prefer]);

  return (
    <div className="faq">
      <div className="faq-roles" role="group" aria-label="Questions for">
        {AUDIENCES.map((a) => (
          <Button key={a} variant="ghost" className={audience === a ? 'filter active' : 'filter'} aria-pressed={audience === a} onClick={() => setAudience(a)}>
            {a === 'all' ? 'All questions' : FAQ_AUDIENCE_LABEL[a]}
          </Button>
        ))}
      </div>
      <SearchBar value={query} onChange={setQuery} placeholder="Search questions" />
      {shown.length ? (
        <Accordion type="single" collapsible className="faq-items">
          {shown.map((f, i) => (
            <AccordionItem key={f.q} value={`q${i}`} className="faq-item">
              <AccordionTrigger>{f.audience !== 'all' && <span className="pill pill-gold mr-2">{FAQ_AUDIENCE_LABEL[f.audience]}</span>}{f.q}</AccordionTrigger>
              <AccordionContent>{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <div className="empty-state"><Search /><h3>No answers found</h3><p>Try different words, or write to the SITAM office.</p></div>
      )}
    </div>
  );
}
