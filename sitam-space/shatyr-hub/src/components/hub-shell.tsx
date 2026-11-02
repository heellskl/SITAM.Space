import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { gmailCompose } from '@/lib/utils';
import { useEffect, useState } from 'react';
import {
  BookOpen, Briefcase, CalendarDays, ChevronsLeft, ChevronsRight, CircleHelp, FlaskConical, House, LayoutDashboard,
  ChevronsUpDown, LogIn, LogOut, Mail, Menu, Settings, ShieldCheck, UserPlus, UserRound,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { BRAND } from '@/lib/sitam-data';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme-toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

// Sidebar order requested for the leader-first platform.
export const navigation = [
  { to: '/home', label: 'Home', icon: House, hint: 'Your research, labs, events and industry experience' },
  { to: '/labs', label: 'Labs', icon: FlaskConical, hint: 'Laboratories, student communities and projects' },
  { to: '/events', label: 'Events', icon: CalendarDays, hint: 'Industry and research events, competitions and hackathons' },
  { to: '/opportunities', label: 'Industry', icon: Briefcase, hint: 'Vacancies, internships, lab cases and partner companies' },
  { to: '/research', label: 'Research', icon: BookOpen, hint: 'Publications and researchers of SITAM (Scopus)' },
  { to: '/faq', label: 'FAQ', icon: CircleHelp, hint: 'Answers to common questions' },
] as const;

const COLLAPSE_KEY = 'sitam-sidebar-collapsed';

/** SITAM emblem: navy wings for the day theme, light wings for the night theme (the orange mark stays). */
function BrandMark() {
  return (
    <span className="brand-mark2" aria-hidden>
      <img className="brand-emblem logo-day" src="/sitam-logo.png" alt="" width={28} height={34} />
      <img className="brand-emblem logo-night" src="/sitam-logo-dark.png" alt="" width={28} height={34} />
    </span>
  );
}

function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="brand side-brand" aria-label={`${BRAND.name} home`}>
      <BrandMark />
      {!compact && (
        <span className="brand-name">
          <span className="brand-word">SITAM SPACE</span>
          <small className="brand-tag">{BRAND.tagline}</small>
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

/** Account button at the bottom of the menu: avatar + "Profile". Opens Profile · Settings · Log out. */
function ProfileMenu({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: (() => void) | undefined }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!profile) return null;
  const go = (to: '/profile', search?: { settings: true }) => {
    setOpen(false);
    onNavigate?.();
    void navigate(search ? { to, search } : { to });
  };
  async function logOut() {
    setOpen(false);
    onNavigate?.();
    await signOut();
    // leave every protected page at once — the sign-in page replaces it in the history
    await navigate({ to: '/login', replace: true });
  }
  const initials = (profile.firstName[0] ?? '') + (profile.lastName[0] ?? '');
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="side-user side-user-btn" aria-label="Profile menu">
          <span className="avatar avatar-sm" aria-hidden>{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" className="avatar-img" /> : initials || <UserRound size={14} />}</span>
          {!collapsed && <strong className="side-label">Profile</strong>}
          {!collapsed && <ChevronsUpDown size={14} className="side-user-caret" aria-hidden />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="profile-menu">
        <DropdownMenuItem onSelect={() => go('/profile')}><UserRound size={15} />Profile</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go('/profile', { settings: true })}><Settings size={15} />Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logOut()} className="profile-menu-out"><LogOut size={15} />Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Navigation + personal account menu. Used for the desktop sidebar and inside the mobile sheet. */
function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: (() => void) | undefined }) {
  const { user, profile, caps, loading } = useAuth();
  const canManage = caps.canReview || caps.isPartner || caps.isTeacher || caps.isAdmin;
  const waiting = caps.pendingModeration + caps.pendingLabHeads;

  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={100}>
      <nav className="side-nav" aria-label="Main navigation">
        {navigation.map((n) => (
          <SideLink key={n.to} to={n.to} label={n.label} icon={n.icon} hint={n.hint} exact={n.to === '/home'} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="side-account" aria-label="Account">
        {loading ? null : user && profile ? (
          <>
            {caps.isCoordinator && <SideLink to="/admin" label="Admin" icon={ShieldCheck} hint="Labs and their heads (coordinator only)" onNavigate={onNavigate} />}
            {canManage && <SideLink to="/manage" label="Manage" icon={LayoutDashboard} badge={waiting} hint="Applications, submissions and your listings" onNavigate={onNavigate} />}
            <ProfileMenu collapsed={collapsed} onNavigate={onNavigate} />
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
        <Link to="/" className="footer-brand brand" aria-label={`${BRAND.name} home`}><BrandMark /><span className="brand-name"><span className="brand-word">SITAM SPACE</span></span></Link>
        <p>{BRAND.contactLabel}: <a href={gmailCompose(BRAND.contactEmail)} target="_blank" rel="noopener noreferrer"><Mail size={12} className="inline" /> {BRAND.contactEmail}</a></p>
        <span>© 2026 SITAM SPACE · SDU University</span>
      </div>
    </footer>
  );
}
