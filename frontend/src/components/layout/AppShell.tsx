import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Bone, CalendarClock, CalendarDays, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Clock3, CreditCard, FileBarChart2, History, LayoutDashboard, LogOut, Menu, MessageCircle, Search, Settings, Stethoscope, UserRound, Users, X } from 'lucide-react';
import { format } from 'date-fns';
import { timeLabel, dateLabel } from '../../utils/format';
import { WhatsAppIcon } from '../ui/Icons';
import type { LucideIcon } from 'lucide-react';
import type { Patient, PortalRole } from '../../types/domain';
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
    { label: 'Meditation', to: '/ortho/templates', icon: Bone },
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
  const { mode, state, repository, wsStatus } = useHospitalData() as any;
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
  const [activeNotifTab, setActiveNotifTab] = useState<'all' | 'reminder' | 'queue'>('all');
  const notificationWrapRef = useRef<HTMLDivElement>(null);

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('tosh_dismissed_notifs');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Handle clicking outside the notification popover
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notificationWrapRef.current && !notificationWrapRef.current.contains(e.target as Node)) {
        setShowAlerts(false);
      }
    }
    if (showAlerts) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAlerts]);

  // Compute live clinic notifications & follow-up reminders
  const liveNotifications = useMemo(() => {
    const list: Array<{
      id: string;
      type: 'reminder' | 'queue' | 'appointment';
      title: string;
      subtitle: string;
      path: string;
      patientName?: string;
      doctorName?: string;
      dateStr?: string;
      phone?: string;
      followUpId?: string;
    }> = [];

    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    // 1. Follow-up reminders
    const followUps = state?.followUps || [];
    const relevantFollowUps = followUps.filter((item: any) => {
      if (role !== 'reception' && item.department !== role) return false;
      return item.status !== 'Completed' && item.status !== 'Cancelled';
    });

    for (const fu of relevantFollowUps) {
      const patient = (state?.patients || []).find((p: any) => p.id === fu.patientId);
      const isPast = fu.date < todayStr;
      const isToday = fu.date === todayStr;
      const needsReminder = fu.reminderStatus !== 'Sent';

      if (isPast || isToday || needsReminder) {
        const timingBadge = isPast ? 'Overdue' : isToday ? 'Due Today' : `Due ${fu.date}`;
        list.push({
          id: `fu-${fu.id}`,
          type: 'reminder',
          title: `Follow-up: ${patient?.fullName || 'Patient'}`,
          subtitle: `${timingBadge} · ${fu.doctor} · Reminder: ${fu.reminderStatus}`,
          path: role === 'reception' ? '/reception/follow-ups' : `/${role === 'skin' ? 'skin' : 'ortho'}/follow-ups`,
          patientName: patient?.fullName,
          doctorName: fu.doctor,
          dateStr: fu.date,
          phone: patient?.phone,
          followUpId: fu.id,
        });
      }
    }

    // 2. Queue waiting patients
    const queue = state?.queue || [];
    const waitingQueue = queue.filter((item: any) => {
      if (role !== 'reception' && item.department !== role) return false;
      return item.status === 'Waiting';
    });

    for (const q of waitingQueue) {
      const patient = (state?.patients || []).find((p: any) => p.id === q.patientId);
      list.push({
        id: `q-${q.id}`,
        type: 'queue',
        title: `Waiting: ${patient?.fullName || 'Patient'} (${q.token})`,
        subtitle: `${q.department === 'skin' ? 'Skin' : 'Orthopaedics'} · ${q.visitType} · ${q.arrivalAt ? timeLabel(q.arrivalAt) : 'Arrived'}`,
        path: role === 'reception' ? '/reception/queue' : `/${role === 'skin' ? 'skin' : 'ortho'}/consultation/${q.patientId}`,
      });
    }

    // 3. Today's scheduled appointments
    const appointments = state?.appointments || [];
    const todayAppointments = appointments.filter((item: any) => {
      if (role !== 'reception' && item.department !== role) return false;
      if (item.status !== 'Scheduled') return false;
      return (item.startsAt || '').startsWith(todayStr);
    });

    for (const appt of todayAppointments) {
      const patient = (state?.patients || []).find((p: any) => p.id === appt.patientId);
      list.push({
        id: `appt-${appt.id}`,
        type: 'appointment',
        title: `Appointment: ${patient?.fullName || 'Patient'}`,
        subtitle: `${appt.doctor} · ${appt.startsAt ? timeLabel(appt.startsAt) : ''} · ${appt.department === 'skin' ? 'Skin' : 'Ortho'}`,
        path: role === 'reception' ? '/reception/appointments' : `/${role === 'skin' ? 'skin' : 'ortho'}/appointments`,
      });
    }

    return list;
  }, [state?.followUps, state?.queue, state?.appointments, state?.patients, role]);

  const unreadCount = useMemo(() => {
    return liveNotifications.filter((n) => !dismissedIds.has(n.id)).length;
  }, [liveNotifications, dismissedIds]);

  const dismissNotification = (id: string) => {
    setDismissedIds((prev) => {
      const updated = new Set(prev).add(id);
      try {
        localStorage.setItem('tosh_dismissed_notifs', JSON.stringify([...updated]));
      } catch {}
      return updated;
    });
  };

  const markAllAsRead = () => {
    const allIds = new Set([...dismissedIds, ...liveNotifications.map((n) => n.id)]);
    setDismissedIds(allIds);
    try {
      localStorage.setItem('tosh_dismissed_notifs', JSON.stringify([...allIds]));
    } catch {}
  };

  const handleQuickWhatsApp = async (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    if (!item.followUpId) return;

    const patientName = item.patientName || 'Patient';
    const doctorName = item.doctorName || 'our specialist';
    const dateFormatted = item.dateStr ? dateLabel(`${item.dateStr}T00:00:00`) : 'the scheduled date';
    const clinicName = 'TOSH Foundation Hospital';
    const message = `Hello ${patientName},\n\nThis is a friendly reminder from ${clinicName} for your upcoming follow-up appointment with ${doctorName} on ${dateFormatted}.\n\nPlease let us know if you need to reschedule. Thank you!`;

    const rawDigits = (item.phone || '').replace(/\D/g, '');
    let cleanPhone = rawDigits;
    if (rawDigits.length === 10) cleanPhone = `91${rawDigits}`;

    if (cleanPhone) {
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    }

    try {
      if (repository?.updateFollowUp) {
        await repository.updateFollowUp(item.followUpId, { reminderAction: 'send', reminderStatus: 'Sent' });
      }
    } catch {}

    dismissNotification(item.id);
  };

  const filteredNotifs = useMemo(() => {
    if (activeNotifTab === 'reminder') return liveNotifications.filter((n) => n.type === 'reminder');
    if (activeNotifTab === 'queue') return liveNotifications.filter((n) => n.type === 'queue');
    return liveNotifications;
  }, [liveNotifications, activeNotifTab]);
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
      .filter((p: Patient) => {
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
    <aside ref={sidebarRef} id="primary-navigation" className={`sidebar portal-${role}${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`} role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen || undefined} aria-label={`${info.label} navigation`}>
      <div className="sidebar-brand"><span className="brand-mark"><img className="brand-logo" src="/tosh-icon-circle.png" alt="TOSH Foundation" /></span><div className="brand-copy"><div className="brand-text">TOSH Foundation</div><div className="brand-subtext">Care operations</div></div></div>
      <div className="sidebar-bg-art" aria-hidden="true">
        <img
          src={role === 'skin' ? '/images/sidebar-skin.jpg' : role === 'reception' ? '/images/sidebar-reception.png' : '/images/sidebar-spine.png'}
          alt=""
          className={`sidebar-bg-img${role === 'skin' ? ' is-skin' : role === 'reception' ? ' is-reception' : ''}`}
        />
        <div className="sidebar-bg-overlay" />
      </div>
      <div className="sidebar-photo" aria-hidden="true">
        <img src="/images/clinic-sidebar.jpeg" alt="" />
        <div className="sidebar-photo-copy">
          <span>{role === 'reception' ? 'Today at TOSH Foundation' : 'Department workspace'}</span>
          <strong className={role === 'skin' ? 'is-skin' : undefined}>
            {role === 'reception' ? 'Care, connected.' : info.label}
          </strong>
        </div>
      </div>
      <nav className="sidebar-nav" aria-label="Main menu"><div className="nav-section-label">Workspace</div>{links.map((item) => {
        const Icon = item.icon;
        return <NavLink key={item.to} to={item.to} end={item.to === `${routeBase[role]}/dashboard`} className={({ isActive }) => `nav-item${isActive || (item.to.endsWith('/consultation') && location.pathname.startsWith(`${item.to}/`)) ? ' active' : ''}`} title={collapsed ? item.label : undefined}>
          <Icon size={17} strokeWidth={1.9} /><span className="nav-label">{item.label}</span>
        </NavLink>;
      })}</nav>
      <div className="sidebar-footer"><div className="sidebar-profile"><span className="sidebar-avatar"><UserRound size={16} /></span><div className="sidebar-footer-text"><strong>{info.name}</strong><span>{role === 'orthopaedics' ? 'Orthopaedic department' : role === 'skin' ? 'Dermatology department' : info.identity}</span></div><button type="button" className="icon-button sidebar-logout-btn" aria-label="Log out" title="Log out" onClick={signOut}><LogOut size={15} /></button></div></div>
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
                  departmentMatches.map((pat: Patient) => (
                    <button
                      key={pat.id}
                      type="button"
                      className="topbar-search-result-item"
                      onClick={() => handleSelectPatient(pat.id)}
                    >
                      <div className="topbar-search-result-avatar">
                        {pat.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
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
          <div
            className={`topbar-live-status status-${wsStatus}`}
            title={
              wsStatus === 'connected'
                ? 'WebSocket connected: Real-time updates active'
                : wsStatus === 'connecting'
                ? 'Connecting to real-time sync...'
                : 'Real-time updates disconnected'
            }
          >
            <span className="live-dot" />
            <span>{wsStatus === 'connected' ? 'Live' : wsStatus === 'connecting' ? 'Syncing' : 'Offline'}</span>
          </div>
          <div className="notification-wrap" ref={notificationWrapRef}>
            <button
              className="icon-button"
              type="button"
              aria-label={`Notifications (${unreadCount} unread)`}
              aria-expanded={showAlerts}
              onClick={() => setShowAlerts((value) => !value)}
              style={{ position: 'relative' }}
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="notification-bell-badge">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showAlerts && (
              <div className="notification-popover" role="dialog" aria-label="Notifications and Reminders">
                <div className="notification-popover-header">
                  <div className="notification-header-title">
                    <Bell size={14} color="#0284C7" />
                    <span>Notifications & Reminders</span>
                    {unreadCount > 0 && <span className="notification-count-pill">{unreadCount}</span>}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className="notification-mark-all-btn"
                      onClick={markAllAsRead}
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="notification-tabs">
                  <button
                    type="button"
                    className={`notification-tab-btn ${activeNotifTab === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveNotifTab('all')}
                  >
                    All ({liveNotifications.length})
                  </button>
                  <button
                    type="button"
                    className={`notification-tab-btn ${activeNotifTab === 'reminder' ? 'active' : ''}`}
                    onClick={() => setActiveNotifTab('reminder')}
                  >
                    Reminders ({liveNotifications.filter((n) => n.type === 'reminder').length})
                  </button>
                  <button
                    type="button"
                    className={`notification-tab-btn ${activeNotifTab === 'queue' ? 'active' : ''}`}
                    onClick={() => setActiveNotifTab('queue')}
                  >
                    Queue ({liveNotifications.filter((n) => n.type === 'queue').length})
                  </button>
                </div>

                <div className="notification-list">
                  {filteredNotifs.length > 0 ? (
                    filteredNotifs.map((item) => {
                      const isUnread = !dismissedIds.has(item.id);
                      return (
                        <div
                          key={item.id}
                          className={`notification-item ${isUnread ? 'unread' : ''}`}
                          onClick={() => {
                            dismissNotification(item.id);
                            setShowAlerts(false);
                            navigate(item.path);
                          }}
                        >
                          <div className={`notification-icon-wrap ${item.type}`}>
                            {item.type === 'reminder' ? (
                              <CalendarClock size={15} />
                            ) : item.type === 'queue' ? (
                              <Clock3 size={15} />
                            ) : (
                              <CalendarDays size={15} />
                            )}
                          </div>
                          <div className="notification-body">
                            <p className="notification-item-title">{item.title}</p>
                            <p className="notification-item-sub">{item.subtitle}</p>
                          </div>
                          <div className="notification-side-actions">
                            {item.type === 'reminder' && item.phone && (
                              <button
                                type="button"
                                className="notification-wa-btn"
                                title="Send WhatsApp reminder"
                                onClick={(e) => handleQuickWhatsApp(e, item)}
                              >
                                <WhatsAppIcon size={11} /> WA
                              </button>
                            )}
                            <button
                              type="button"
                              className="notification-dismiss-btn"
                              title="Dismiss"
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissNotification(item.id);
                              }}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="notification-empty">
                      <CheckCheck size={28} color="#10B981" />
                      <strong>All caught up!</strong>
                      <span>No pending reminders or active queue alerts.</span>
                    </div>
                  )}
                </div>

                <div className="notification-popover-footer">
                  <span
                    className="notification-footer-link"
                    onClick={() => {
                      setShowAlerts(false);
                      navigate(role === 'reception' ? '/reception/follow-ups' : `/${role === 'skin' ? 'skin' : 'ortho'}/follow-ups`);
                    }}
                  >
                    View all follow-up reminders &rarr;
                  </span>
                  <span
                    className="notification-footer-link"
                    onClick={() => {
                      setShowAlerts(false);
                      navigate(role === 'reception' ? '/reception/queue' : `/${role === 'skin' ? 'skin' : 'ortho'}/consultation`);
                    }}
                  >
                    Live queue &rarr;
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="topbar-user" title={`Signed in as ${info.name}`}>
            <span className="avatar small teal">{info.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('')}</span>
            <div className="topbar-user-copy">
              <strong>{info.name}</strong>
              <span>{mode === 'mock' ? 'Demo workspace' : 'API mode'}</span>
            </div>
            <ChevronDown size={13} color="#64748B" />
          </div>
          <button className="icon-button topbar-logout-btn mobile-logout" type="button" aria-label="Log out" title="Log out" onClick={signOut}>
            <LogOut size={16} />
          </button>
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
