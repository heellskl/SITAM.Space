import { useEffect, useRef } from 'react';

// Night sky behind the whole site (mounted once in the root layout, so it never reloads between pages).
// Stars are drawn ONCE on a canvas tall enough for the parallax range; scrolling only moves it with
// transform (speed 0.3). ~10 % of stars twinkle as tiny CSS-animated dots (opacity only).
// prefers-reduced-motion: no parallax, no twinkle.

const DENSITY = 250; // stars per viewport
const BLUE = '#85B7EB';

type Star = { x: number; y: number; r: number; a: number; blue: boolean };

function makeStars(width: number, height: number, viewport: number): Star[] {
  const count = Math.round(DENSITY * (height / viewport));
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const blue = i % 15 === 14;
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: blue ? 1 : 0.25 + Math.random() * 0.5, // radius: 0.5–1.5 px diameter, blue 2 px
      a: blue ? 0.8 : 0.25 + Math.random() * 0.5,
      blue,
    });
  }
  return stars;
}

export function StarSky() {
  const layer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = layer.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let twinklers: HTMLSpanElement[] = [];

    const draw = () => {
      const w = window.innerWidth;
      const vh = window.innerHeight;
      // Parallax range: the layer moves 0.3 × the scroll, so it needs that much extra height.
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
      const h = Math.ceil(vh + (reduce ? 0 : maxScroll * 0.3)) + 2;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const stars = makeStars(w, h, vh);
      twinklers.forEach((t) => t.remove());
      twinklers = [];
      stars.forEach((s, i) => {
        if (!reduce && i % 10 === 0) {
          // twinkling star: a DOM dot with an opacity animation (3–6 s)
          const dot = document.createElement('span');
          dot.className = 'star-twinkle';
          const size = s.r * 2;
          dot.style.cssText = `left:${s.x}px;top:${s.y}px;width:${size}px;height:${size}px;opacity:${s.a};` +
            `background:${s.blue ? BLUE : '#fff'};animation-duration:${3 + Math.random() * 3}s;animation-delay:${-Math.random() * 6}s`;
          el.appendChild(dot);
          twinklers.push(dot);
          return;
        }
        ctx.globalAlpha = s.a;
        ctx.fillStyle = s.blue ? BLUE : '#fff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };

    const onScroll = () => {
      if (reduce || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        el.style.transform = `translate3d(0, ${-window.scrollY * 0.3}px, 0)`;
      });
    };

    draw();
    onScroll();
    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(draw, 200);
    };
    // Page height changes when routes change: redraw only when it grows past the drawn range.
    const ro = new ResizeObserver(() => {
      const need = window.innerHeight + (document.documentElement.scrollHeight - window.innerHeight) * 0.3;
      if (!reduce && need > (parseFloat(cv.style.height) || 0) + 40) onResize();
    });
    ro.observe(document.body);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      cancelAnimationFrame(raf);
      twinklers.forEach((t) => t.remove());
    };
  }, []);

  return (
    <div className="star-sky" aria-hidden>
      <div ref={layer} className="star-layer">
        <canvas ref={canvas} />
      </div>
    </div>
  );
}
