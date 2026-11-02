// Dark banner at the top of Labs, Industry and Research: title, one line of text and two live numbers.
// A number can be a link (opens the matching tab / page).
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

export type HeroStat = { label: string; value: number | undefined; to?: string; search?: Record<string, string> };

export function PageHero({ eyebrow, title, text, stats = [], action }: { eyebrow?: string; title: string; text: ReactNode; stats?: HeroStat[]; action?: ReactNode }) {
  return (
    <section className="page-hero">
      <div className="page-hero-text">
        {eyebrow && <span className="page-hero-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{text}</p>
        {action && <div className="page-hero-action">{action}</div>}
      </div>
      {stats.length > 0 && <div className="page-hero-stats">
        {stats.map((s) => {
          const body = <><strong>{s.value === undefined ? '—' : s.value.toLocaleString('en-US')}</strong><small>{s.label}</small></>;
          return s.to
            ? <Link key={s.label} to={s.to as never} search={(s.search ?? {}) as never} className="page-hero-stat is-link">{body}</Link>
            : <div key={s.label} className="page-hero-stat">{body}</div>;
        })}
      </div>}
    </section>
  );
}
