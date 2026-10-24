import { useEffect, useState, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type Theme = 'light' | 'dark';
// v9.1: new key so an old saved "light" choice does not hide the night sky; night is the default.
const KEY = 'sitam-theme-v9';

// Runs in <head> before the first paint so the page never flashes the wrong theme.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${KEY}');if(t!=='light'&&t!=='dark'){t='dark'}var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t}catch(e){}})();`;

function current(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.add('theme-switching');
  root.classList.toggle('dark', t === 'dark');
  root.style.colorScheme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  window.setTimeout(() => root.classList.remove('theme-switching'), 950); // colours ease while the hero videos cross-fade
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => setTheme(current()), []);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      className="theme-toggle"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}

/** Current theme that follows the toggle (and other tabs) — re-renders when <html class="dark"> changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(
    (notify) => {
      const mo = new MutationObserver(notify);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => mo.disconnect();
    },
    current,
    () => 'dark', // server render: night is the default theme
  );
}
