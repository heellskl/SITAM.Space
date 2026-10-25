import { Link, useRouterState } from '@tanstack/react-router';
import { gmailCompose } from '@/lib/utils';
import { useEffect, useState } from 'react';
import {
  BookOpen, Briefcase, CalendarDays, ChevronsLeft, ChevronsRight, CircleHelp, FlaskConical, House, LayoutDashboard,
  LogIn, LogOut, Mail, Menu, Rocket, ShieldCheck, UserPlus, UserRound,
} from 'lucide-react';
import { ROLE_LABEL, useAuth } from '@/lib/auth';
import { BRAND } from '@/lib/sitam-data';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme-toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Sidebar order requested for the leader-first platform.
export const navigation = [
  { to: '/', label: 'Home', icon: House, hint: 'About SITAM SPACE and the school in numbers' },
  { to: '/labs', label: 'Labs', icon: FlaskConical, hint: 'All SITAM laboratories, their teams and projects' },
  { to: '/events', label: 'Events', icon: CalendarDays, hint: 'Industry and research events, competitions and hackathons' },
  { to: '/projects', label: 'Projects', icon: Rocket, hint: 'What the labs build and research' },
  { to: '/opportunities', label: 'Opportunities', icon: Briefcase, hint: 'Vacancies, internships and lab cases to apply for' },
  { to: '/research', label: 'Research', icon: BookOpen, hint: 'Publications and researchers of SITAM (Scopus)' },
  { to: '/faq', label: 'FAQ', icon: CircleHelp, hint: 'Answers to common questions' },
] as const;

const COLLAPSE_KEY = 'sitam-sidebar-collapsed';

function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="brand side-brand" aria-label={`${BRAND.name} home`}>
      <img className="brand-emblem" src="/sitam-emblem.png" alt="" width={28} height={34} />
      {!compact && (
        <span className="brand-name">
          SITAM SPACE
          <small>{BRAND.tagline}</small>
        </span>
      )}
    </Link>
  );
}

function SideLink({ to, label, icon: Icon, onNavigate, badge, exact, hint }: {
  to: string; label: string; icon: typeof House; onNavigate?: (() => void) | undefined; badge?: number | undefined; exact?: boolean | undefined; hint?: string | undefined;
}) {
  const link = (
    <Link to={to} onClick={onNavigate} activeOptions={{ exact: !!exact }} activeProps={{ className: 'side-active' }} className="side-link" aria-label={hint ? `${label} — ${hint}` : label}>
      <Icon size={18} aria-hidden />
      <span className="side-label">{label}</span>
      {!!badge && <span className="side-count" aria-label={`${badge} waiting`}>{badge}</span>}
    </Link>
  );
  if (!hint) return link;
  // hover / keyboard focus: a short description of the section, to the right of the menu
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="side-tip"><strong>{label}</strong>{hint}</TooltipContent>
    </Tooltip>
  );
}

/** Navigation + personal account menu. Used for the desktop sidebar and inside the mobile sheet. */
function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: (() => void) | undefined }) {
  const { user, profile, caps, loading, signOut } = useAuth();
  const canManage = caps.canReview || caps.isPartner || caps.isTeacher || caps.isAdmin;
  const isLeader = caps.managedLabs.length > 0;
  // The primary university role always stays visible; lab headship is shown next to it.
  const roleLine = profile ? [ROLE_LABEL[profile.role], isLeader && 'Lab head', caps.isCoordinator && 'Coordinator'].filter(Boolean).join(' · ') : '';
  const waiting = caps.pendingModeration + caps.pendingLabHeads;

  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={100}>
      <nav className="side-nav" aria-label="Main navigation">
        {navigation.map((n) => (
          <SideLink key={n.to} to={n.to} label={n.label} icon={n.icon} hint={n.hint} exact={n.to === '/'} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="side-account" aria-label="Account">
        {loading ? null : user && profile ? (
          <>
            {caps.isCoordinator && <SideLink to="/admin" label="Admin" icon={ShieldCheck} hint="Labs and their heads (coordinator only)" onNavigate={onNavigate} />}
            {canManage && <SideLink to="/manage" label="Manage" icon={LayoutDashboard} badge={waiting} hint="Applications, submissions and your listings" onNavigate={onNavigate} />}
            <SideLink to="/profile" label="Profile & settings" icon={UserRound} hint="Your details, CV, tickets and applications" onNavigate={onNavigate} />
            <button type="button" className="side-link" onClick={() => { onNavigate?.(); void signOut(); }} title="Log out">
              <LogOut size={18} aria-hidden /><span className="side-label">Log out</span>
            </button>
            {!collapsed && (
              <div className="side-user">
                <span className="avatar avatar-sm" aria-hidden>{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" className="avatar-img" /> : (profile.firstName[0] ?? "") + (profile.lastName[0] ?? "")}</span>
                <div><strong>{`${profile.firstName} ${profile.lastName}`.trim() || profile.email}</strong><small>{roleLine}</small></div>
              </div>
            )}
          </>
        ) : (
          <>
            <SideLink to="/login" label="Sign in" icon={LogIn} onNavigate={onNavigate} />
            <SideLink to="/register" label="Register" icon={UserPlus} onNavigate={onNavigate} />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1'); } catch { /* storage blocked */ }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* storage blocked */ }
      return !c;
    });
  };

  return (
    <aside className={collapsed ? 'app-sidebar collapsed' : 'app-sidebar'} aria-label="Sidebar">
      <div className="side-top">
        <Logo compact={collapsed} />
      </div>
      <SidebarBody collapsed={collapsed} />
      <div className="side-bottom">
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
        </Button>
      </div>
    </aside>
  );
}

/** Header: menu button and logo on small screens, day/night toggle in the top-right corner. No search here. */
export function TopBar() {
  const [menu, setMenu] = useState(false);
  const { contextError, user, loading } = useAuth();
  const guest = !user;
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setMenu(false), [path]);

  return (
    <header className="top-bar">
      <div className="top-bar-inner">
        {!guest && <Button variant="ghost" size="icon" className="mobile-menu-button" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}><Menu /></Button>}
        <span className="top-bar-logo"><Logo /></span>
        {guest && !loading && (
          // Guests: no sidebar — only the way in.
          <nav className="guest-actions" aria-label="Account">
            <Button asChild size="sm" variant="ghost"><Link to="/login"><LogIn />Sign in</Link></Button>
            <Button asChild size="sm"><Link to="/register"><UserPlus />Register</Link></Button>
          </nav>
        )}
        <span className="top-bar-theme"><ThemeToggle /></span>
      </div>
      {contextError && <p className="db-warning" role="alert">{contextError}</p>}
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="mobile-sheet side-sheet">
          <SheetTitle className="sr-only">{BRAND.name}</SheetTitle>
          <SheetDescription className="sr-only">Main navigation and account</SheetDescription>
          <div className="side-top"><Logo /></div>
          <SidebarBody collapsed={false} onNavigate={() => setMenu(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}

export function HubFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <Link to="/" className="footer-brand"><img className="brand-emblem" src="/sitam-emblem.png" alt="" width={24} height={30} /><span className="footer-word">SITAM SPACE</span></Link>
        <p>{BRAND.contactLabel}: <a href={gmailCompose(BRAND.contactEmail)} target="_blank" rel="noopener noreferrer"><Mail size={12} className="inline" /> {BRAND.contactEmail}</a></p>
        <span>© 2026 SITAM SPACE · SDU University</span>
      </div>
    </footer>
  );
}
