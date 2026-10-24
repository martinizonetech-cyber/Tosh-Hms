import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Bone, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, CreditCard, FileBarChart2, History, LayoutDashboard, LogOut, Menu, MessageCircle, Search, Settings, Stethoscope, UserRound, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PortalRole } from '../../types/domain';
import { useHospitalData } from '../../services/mock/DemoProvider';
import { useAuth } from '../../services/auth/AuthContext';
import { matchesPatient } from '../../utils/patientSearch';

interface NavItem { label: string; to: string; icon: LucideIcon; }
const navByRole: Record<PortalRole, NavItem[]> = {
  reception: [
    { label: 'Dashboard', to: '/reception/dashboard', icon: LayoutDashboard },
    { label: 'Queue', to: '/reception/queue', icon: ClipboardList },
    { label: 'Appointments', to: '/reception/appointments', icon: CalendarDays },
    { label: 'All Patients', to: '/reception/patients', icon: Users },
    { label: 'Payments & Invoices', to: '/reception/billing', icon: CreditCard },
    { label: 'Follow-ups', to: '/reception/follow-ups', icon: MessageCircle },
    { label: 'Reports', to: '/reception/reports', icon: FileBarChart2 },
    { label: 'Settings', to: '/reception/settings', icon: Settings },
  ],
  skin: [
    { label: 'Dashboard', to: '/skin/dashboard', icon: LayoutDashboard },
    { label: 'Appointments', to: '/skin/appointments', icon: CalendarDays },
    { label: 'Patients', to: '/skin/patients', icon: Users },
    { label: 'Consultation', to: '/skin/consultation', icon: Stethoscope },
    { label: 'Charges', to: '/skin/charges', icon: CreditCard },
    { label: 'Follow-ups', to: '/skin/follow-ups', icon: MessageCircle },
    { label: 'Reports', to: '/skin/reports', icon: FileBarChart2 },
    { label: 'Visit History', to: '/skin/history', icon: History },
  ],
  orthopaedics: [
    { label: 'Dashboard', to: '/ortho/dashboard', icon: LayoutDashboard },
    { label: 'Appointments', to: '/ortho/appointments', icon: CalendarDays },
    { label: 'Patients', to: '/ortho/patients', icon: Users },
    { label: 'Consultation', to: '/ortho/consultation', icon: Stethoscope },
    { label: 'Body Region Templates', to: '/ortho/templates', icon: Bone },
    { label: 'Charges', to: '/ortho/charges', icon: CreditCard },
    { label: 'Follow-ups', to: '/ortho/follow-ups', icon: MessageCircle },
    { label: 'Reports', to: '/ortho/reports', icon: FileBarChart2 },
    { label: 'Visit History', to: '/ortho/history', icon: History },
  ],
};
const roleInfo: Record<PortalRole, { label: string; identity: string; name: string }> = {
  reception: { label: 'Reception', identity: 'Front desk · Patient services', name: 'Priya Sharma' },
  skin: { label: 'Skin & Dermatology', identity: 'Skin department', name: 'Dr. Sangamitra' },
  orthopaedics: { label: 'Orthopaedics', identity: 'Orthopaedic department', name: 'Dr. Sundarprakash' },
};
const routeBase: Record<PortalRole, string> = { reception: '/reception', skin: '/skin', orthopaedics: '/ortho' };

function roleFromPath(path: string): PortalRole {
  if (path.startsWith('/skin')) return 'skin';
  if (path.startsWith('/ortho')) return 'orthopaedics';
  return 'reception';
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, state } = useHospitalData();
  const { user, logout } = useAuth();
  const role = roleFromPath(location.pathname);
  const baseInfo = roleInfo[role];
  const info = {
    label: baseInfo.label,
    identity: baseInfo.identity,
    name: user?.displayName || baseInfo.name,
  };
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const links = navByRole[role];
  const title = useMemo(() => links.find((item) => location.pathname === item.to || (item.to.endsWith('/consultation') && location.pathname.startsWith(`${item.to}/`)))?.label ?? info.label, [info.label, links, location.pathname]);

  // Keep query in sync if URL contains q on patients page
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const q = searchParams.get('q');
    if (q !== null && location.pathname.includes('/patients')) {
      setQuery(q);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    setMobileOpen(false);
    setShowAlerts(false);
    setSearchFocused(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.scrollTo({ top: 0, behavior: 'smooth' });
    const mainCol = document.querySelector('.main-column');
    if (mainCol) mainCol.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  // Handle outside click to close search popup
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prior = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMobileOpen(false); mobileMenuButtonRef.current?.focus(); return; }
      if (event.key === 'Tab' && sidebarRef.current) {
        const items = sidebarRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),select:not([disabled]),[tabindex="0"]');
        if (!items.length) return;
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => sidebarRef.current?.querySelector<HTMLElement>('a[href],button:not([disabled]),select:not([disabled])')?.focus(), 0);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; if (prior && document.contains(prior)) prior.focus(); };
  }, [mobileOpen]);

  const departmentMatches = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const dept = role === 'reception' ? null : (role === 'skin' ? 'skin' : 'orthopaedics');
    return state.patients
      .filter((p) => {
        const matchesDept = !dept || p.departments.includes(dept);
        return matchesDept && matchesPatient(p, q);
      })
      .slice(0, 5);
  }, [query, role, state.patients]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSearchFocused(false);
    if (!query.trim()) {
      navigate(`${routeBase[role]}/patients`);
      return;
    }
    navigate(`${routeBase[role]}/patients?q=${encodeURIComponent(query.trim())}`);
  };

  const handleSelectPatient = (patientId: string) => {
    setSearchFocused(false);
    if (role === 'reception') {
      navigate(`/reception/patients?q=${encodeURIComponent(patientId)}`);
    } else {
      navigate(`/${role}/consultation/${patientId}`);
    }
  };

  const signOut = () => { logout(); };

  return <div className={`app-shell${collapsed ? ' is-sidebar-collapsed' : ''}`}>
    <div className={`mobile-scrim${mobileOpen ? ' visible' : ''}`} onClick={() => setMobileOpen(false)} aria-hidden="true" />
    <aside ref={sidebarRef} id="primary-navigation" className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`} role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen || undefined} aria-label={`${info.label} navigation`}>
      <div className="sidebar-brand"><span className="brand-mark"><img className="brand-logo" src="/tosh-icon-circle.png" alt="TOSH Foundation" /></span><div className="brand-copy"><div className="brand-text">TOSH Foundation</div><div className="brand-subtext">Care operations</div></div></div>
      <div className="sidebar-photo" aria-hidden="true">
        {!photoFailed && <img src="/images/clinic-sidebar.jpeg" alt="" onError={() => setPhotoFailed(true)} />}
        <div className="sidebar-photo-copy"><span>{role === 'reception' ? 'Today at TOSH Foundation' : 'Department workspace'}</span><strong>{role === 'reception' ? 'Care, connected.' : info.label}</strong></div>
      </div>
      <nav className="sidebar-nav" aria-label="Main menu"><div className="nav-section-label">Workspace</div>{links.map((item) => {
        const Icon = item.icon;
        return <NavLink key={item.to} to={item.to} end={item.to === `${routeBase[role]}/dashboard`} className={({ isActive }) => `nav-item${isActive || (item.to.endsWith('/consultation') && location.pathname.startsWith(`${item.to}/`)) ? ' active' : ''}`} title={collapsed ? item.label : undefined}>
          <Icon size={17} strokeWidth={1.9} /><span className="nav-label">{item.label}</span>
        </NavLink>;
      })}</nav>
      <div className="sidebar-footer"><div className="sidebar-profile"><span className="sidebar-avatar"><UserRound size={16} /></span><div className="sidebar-footer-text"><strong>{info.name}</strong><span>{info.identity}</span></div><button type="button" className="icon-button sidebar-logout-btn" aria-label="Log out" title="Log out" onClick={signOut}><LogOut size={15} /></button></div></div>
    </aside>
    <div className="main-column">
      <header className="topbar">
        <div className="topbar-left">
          <button ref={mobileMenuButtonRef} className="icon-button mobile-menu-button" type="button" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-controls="primary-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen((value) => !value)}>{mobileOpen ? <X size={19} /> : <Menu size={19} />}</button>
          <button className="icon-button desktop-collapse" type="button" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</button>
          <div><div className="topbar-title">{title}</div><div className="topbar-date">{new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())} · {info.label}</div></div>

          <div className="topbar-search-container" ref={searchContainerRef}>
            <form className="topbar-search" role="search" onSubmit={submitSearch}>
              <Search size={15} />
              <input
                aria-label="Search patients"
                placeholder="Find a patient"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setSearchFocused(true)}
              />
              {query && (
                <button
                  type="button"
                  style={{ background: 'transparent', border: 0, padding: 2, cursor: 'pointer', color: '#94A3B8' }}
                  onClick={() => { setQuery(''); navigate(`${routeBase[role]}/patients`); }}
                  aria-label="Clear patient search"
                >
                  <X size={13} />
                </button>
              )}
            </form>

            {searchFocused && query.trim().length > 0 && (
              <div className="topbar-search-dropdown" role="listbox">
                <div className="topbar-search-dropdown-header">
                  <span>Matching {role === 'skin' ? 'Skin' : role === 'orthopaedics' ? 'Ortho' : ''} Patients ({departmentMatches.length})</span>
                </div>
                {departmentMatches.length > 0 ? (
                  departmentMatches.map((pat) => (
                    <button
                      key={pat.id}
                      type="button"
                      className="topbar-search-result-item"
                      onClick={() => handleSelectPatient(pat.id)}
                    >
                      <div className="topbar-search-result-avatar">
                        {pat.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="topbar-search-result-info">
                        <strong>{pat.fullName}</strong>
                        <span>{pat.id} · {pat.gender} · {pat.phone}</span>
                      </div>
                      <span className="topbar-search-result-action">
                        {role === 'reception' ? 'View' : 'Consult'}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="topbar-search-empty">
                    No patients found matching "{query}"
                  </div>
                )}
                <div className="topbar-search-dropdown-footer">
                  <button type="button" onClick={submitSearch} className="topbar-search-all-link">
                    Press Enter to view all results in Patients directory &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="topbar-actions">
          {(mode === 'mock' || user?.role === 'reception') && (
            <div className="portal-select-wrap"><label className="sr-only" htmlFor="portal-switch">Switch portal</label><select id="portal-switch" className="select-field portal-switcher" value={role} onChange={(event) => navigate(`${routeBase[event.target.value as PortalRole]}/dashboard`)}><option value="reception">Reception</option><option value="skin">Skin Doctor</option><option value="orthopaedics">Orthopaedic Doctor</option></select></div>
          )}
          <div className="notification-wrap"><button className="icon-button" type="button" aria-label="Notifications" aria-expanded={showAlerts} onClick={() => setShowAlerts((value) => !value)}><Bell size={17} /></button>{showAlerts && <div className="notification-popover" role="status"><strong>Nothing urgent</strong><span>Notifications in this workspace are demo-only.</span></div>}</div>
          <div className="topbar-user"><span className="avatar small teal">{info.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('')}</span><div className="topbar-user-copy"><strong>{info.name}</strong><span>{mode === 'mock' ? 'Demo workspace' : 'API mode'}</span></div><ChevronDown size={13} color="#64748B" /></div>
          <button className="icon-button mobile-logout" type="button" aria-label="Log out" onClick={signOut}><LogOut size={16} /></button>
        </div>
      </header>
      <main className="page-content">
        <div key={location.pathname} className="page-transition-wrap">
          <Outlet />
        </div>
      </main>
    </div>
  </div>;
}
