// Dark banner at the top of Labs, Industry and Research: title, one line of text and two live numbers.
// A number can be a link (opens the matching tab / page).
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

export type HeroStat = { label: string; value: number | undefined; to?: string; search?: Record<string, string> };

export function PageHero({ title, text, stats }: { title: string; text: ReactNode; stats: HeroStat[] }) {
  return (
    <section className="page-hero">
      <span className="page-hero-mark" aria-hidden />
      <div className="page-hero-text">
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      <div className="page-hero-stats">
        {stats.map((s) => {
          const body = <><small>{s.label}</small><strong>{s.value ?? '—'}</strong></>;
          return s.to
            ? <Link key={s.label} to={s.to as never} search={(s.search ?? {}) as never} className="page-hero-stat is-link">{body}</Link>
            : <div key={s.label} className="page-hero-stat">{body}</div>;
        })}
      </div>
    </section>
  );
}
