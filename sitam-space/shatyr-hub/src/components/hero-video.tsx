import { useEffect, useRef, useState } from 'react';

// Background video for the hero. Order of sources:
//   1. /hero.mp4 in public/ (put your own SDU / lab footage there to replace the stock clip)
//   2. Mixkit "Blue Waves in Soft Light" (Mixkit Stock Video Free License)
// If neither plays (offline, blocked, reduced motion), a calm animated gradient is shown instead.
const SOURCES = ['/hero.mp4', 'https://assets.mixkit.co/i003bfhegobboubawhwt80lpmwpd'];

export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Render the <video> only on the client: an error that fires before hydration would be missed.
    setMounted(true);
    try {
      setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!v || reduced || failed) return;
    v.muted = true;
    v.play().catch(() => {
      /* autoplay can be refused; the poster gradient stays visible */
    });
  }, [index, reduced, failed]);

  return (
    <div className="hero-media" aria-hidden>
      <div className="hero-gradient" />
      {mounted && !reduced && !failed && (
        <video
          ref={ref}
          key={SOURCES[index]}
          className="hero-video"
          src={SOURCES[index]}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => (index + 1 < SOURCES.length ? setIndex(index + 1) : setFailed(true))}
        />
      )}
      <div className="hero-veil" />
    </div>
  );
}
