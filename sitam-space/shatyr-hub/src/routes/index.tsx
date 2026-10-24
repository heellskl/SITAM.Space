import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Building2, GraduationCap, Presentation } from 'lucide-react';
import { useLabs, useProjects, usePublications } from '@/lib/api';
import { pageHead } from '@/lib/hub-data';
import { BRAND } from '@/lib/sitam-data';
import { gmailCompose } from '@/lib/utils';
import { useTheme } from '@/components/theme-toggle';

export const Route = createFileRoute('/')({
  head: () => pageHead('Science, Industry & Innovation at SDU', 'SITAM SPACE — laboratories, projects, events and research of the School of Information Technologies and Applied Mathematics, SDU University.'),
  component: Index,
});

// Hero background follows the theme: night sky in dark mode, a sunrise over a field in light mode.
const HERO_VIDEO = {
  dark: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4',
  light: '/hero-day.mp4', // public/hero-day.mp4 — replace the file to change the day video
} as const;
const HERO_POSTER = { dark: undefined, light: '/hero-day.jpg' } as const;

/** Letters rise one after another (staggered), so the title is animated, not only the video behind it. */
function split(word: string, offset: number) {
  return word.split('').map((ch, i) => (
    <span key={i} className="hero8-letter" style={{ animationDelay: `${0.15 + (offset + i) * 0.06}s` }}>{ch}</span>
  ));
}

/** Fullscreen looping video that fades in once it can play; switches source when the theme changes. */
function HeroBackdrop() {
  const ref = useRef<HTMLVideoElement>(null);
  const theme = useTheme();
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    setReady(false);
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.load();
    v.play().catch(() => { /* autoplay refused: the poster / plain background stays */ });
  }, [mounted, theme]);
  return (
    <div className={`hero8-media hero8-media-${theme}`} aria-hidden>
      {mounted && (
        <video
          key={theme}
          ref={ref}
          className={ready ? 'hero8-video is-ready' : 'hero8-video'}
          src={HERO_VIDEO[theme]}
          poster={HERO_POSTER[theme]}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onCanPlay={() => setReady(true)}
        />
      )}
      <span className="hero8-veil" />
    </div>
  );
}

/** Counts from 0 to the value once the number scrolls into view (no animation with reduced motion). */
function CountUp({ value }: { value: number | undefined }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!seen || value === undefined) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    const start = performance.now();
    const dur = 1400;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value]);
  return <span ref={ref}>{value === undefined ? '—' : shown}</span>;
}

/** Same page for everyone: a cinematic, centred hero and an "About us" section. */
function Index() {
  const labs = useLabs();
  const projects = useProjects();
  const pubs = usePublications();
  // people taking part in labs (heads and members, not former heads)
  const involved = labs.data ? labs.data.reduce((sum, l) => sum + l.lab_members.filter((m) => m.role !== 'former_lead').length, 0) : undefined;
  const toAbout = () => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <main>
      <section className="hero8">
        <HeroBackdrop />
        <span className="hero8-fade" aria-hidden />
        <div className="hero8-inner">
          <h1 className="hero8-title animate-fade-rise" aria-label="SITAMSPACE">
            <span className="hero8-sitam" aria-hidden>{split('SITAM', 0)}</span>
            <span aria-hidden>{split('SPACE', 5)}</span>
          </h1>
          <p className="hero8-sub animate-fade-rise-delay">Laboratories, research and people of the School of Information Technologies and Applied Mathematics at SDU University.</p>
          <div className="hero8-actions animate-fade-rise-delay-2">
            <button type="button" className="liquid-glass hero8-cta" onClick={toAbout}>About us</button>
          </div>
        </div>
      </section>

      <section id="about" className="container about2">
        <div className="about2-col">
          <span className="eyebrow">About us</span>
          <h2>SITAM SPACE</h2>
          <p className="about2-sub">Where SITAM research, people and ideas meet</p>
          <p className="about2-lead">
            SITAM SPACE is the research and innovation platform of the {BRAND.school} (SITAM) at SDU University.
            It brings the school’s laboratories, their teams, projects, events and publications into one place.
          </p>
          <ul className="about2-roles">
            <li><span className="about2-ic tone-blue"><GraduationCap size={16} /></span><div><strong>Students</strong><span>Find a lab and join real research</span></div></li>
            <li><span className="about2-ic tone-violet"><Presentation size={16} /></span><div><strong>Teachers</strong><span>Present research and run events</span></div></li>
            <li><span className="about2-ic tone-amber"><Building2 size={16} /></span><div><strong>Partners</strong><span>See what we build and collaborate</span></div></li>
          </ul>
          <dl className="about2-stats">
            <div><dt><CountUp value={labs.data?.length} /></dt><dd>Laboratories</dd></div>
            <div><dt><CountUp value={projects.data?.length} /></dt><dd>Projects</dd></div>
            <div><dt><CountUp value={involved} /></dt><dd>Students involved</dd></div>
            <div><dt><CountUp value={pubs.data?.length} /></dt><dd>Scopus publications</dd></div>
          </dl>
          <p className="about2-contact">{BRAND.contactLabel}: <a href={gmailCompose(BRAND.contactEmail)} target="_blank" rel="noopener noreferrer">{BRAND.contactEmail}</a></p>
        </div>
      </section>
    </main>
  );
}
