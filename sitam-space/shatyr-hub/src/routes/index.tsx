import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Building2, GraduationCap, Presentation } from 'lucide-react';
import { useLabs, useProjects, usePublications } from '@/lib/api';
import { pageHead } from '@/lib/hub-data';
import { BRAND } from '@/lib/sitam-data';
import { useTheme, type Theme } from '@/components/theme-toggle';

export const Route = createFileRoute('/')({
  head: () => pageHead('Science, Industry & Innovation at SDU', 'SITAM SPACE — laboratories, projects, events and research of the School of Information Technologies and Applied Mathematics, SDU University.'),
  component: Index,
});

// Hero background follows the theme: a starry night in dark mode, a sunny morning in light mode (files in public/).
// Both videos sit on top of each other; switching the theme cross-fades from one to the other.
const HERO_VIDEO = { dark: '/hero-night.mp4', light: '/hero-day.mp4' } as const;
const HERO_POSTER = { dark: '/hero-night.jpg', light: '/hero-day.jpg' } as const;
const THEMES: Theme[] = ['dark', 'light'];

/** Letters rise one after another (staggered), so the title is animated, not only the video behind it. */
function split(word: string, offset: number) {
  return word.split('').map((ch, i) => (
    <span key={i} className="hero8-letter" style={{ animationDelay: `${0.15 + (offset + i) * 0.06}s` }}>{ch}</span>
  ));
}

/** Fullscreen looping videos (night + day) that cross-fade when the theme changes. */
function HeroBackdrop() {
  const theme = useTheme();
  const refs = useRef<Record<Theme, HTMLVideoElement | null>>({ dark: null, light: null });
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState<Record<Theme, boolean>>({ dark: false, light: false });
  // the other theme's video is loaded only after the first switch (saves traffic on the first visit)
  const [used, setUsed] = useState<Record<Theme, boolean>>({ dark: false, light: false });
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    setUsed((u) => (u[theme] ? u : { ...u, [theme]: true }));
  }, [mounted, theme]);
  useEffect(() => {
    if (!mounted) return;
    const on = refs.current[theme];
    if (on) {
      on.muted = true;
      on.play().catch(() => { /* autoplay refused: the poster stays */ });
    }
    const other = refs.current[theme === 'dark' ? 'light' : 'dark'];
    const t = window.setTimeout(() => other?.pause(), 1000); // after the fade
    return () => window.clearTimeout(t);
  }, [mounted, theme, used]);
  return (
    <div className={`hero8-media hero8-media-${theme}`} aria-hidden>
      {mounted && THEMES.filter((x) => used[x]).map((x) => (
        <video
          key={x}
          ref={(el) => { refs.current[x] = el; }}
          className={`hero8-video${ready[x] ? ' is-ready' : ''}${x === theme || !ready[theme] ? ' is-active' : ''}`} // the old video stays until the new one can play
          src={HERO_VIDEO[x]}
          poster={HERO_POSTER[x]}
          autoPlay={x === theme}
          loop
          muted
          playsInline
          preload="auto"
          onCanPlay={() => setReady((r) => (r[x] ? r : { ...r, [x]: true }))}
        />
      ))}
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

/** Landing page for everyone (the logo opens it): a cinematic, centred hero and an "About us" section. The personal Home is /home. */
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
            {/* the numbers open their pages (the whole cell is clickable) */}
            <div className="is-link"><dt><CountUp value={labs.data?.filter((l) => (l.kind ?? 'lab') === 'lab').length} /></dt><dd><Link to="/labs" className="stat-link">Laboratories</Link></dd></div>
            <div className="is-link"><dt><CountUp value={projects.data?.length} /></dt><dd><Link to="/labs" search={{ tab: 'projects' }} className="stat-link">Projects</Link></dd></div>
            <div><dt><CountUp value={involved} /></dt><dd>Students involved</dd></div>
            <div className="is-link"><dt><CountUp value={pubs.data?.length} /></dt><dd><Link to="/research" search={{ tab: 'search' }} className="stat-link">Scopus publications</Link></dd></div>
          </dl>
        </div>
      </section>
    </main>
  );
}
