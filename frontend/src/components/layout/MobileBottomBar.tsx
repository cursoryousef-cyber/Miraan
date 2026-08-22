import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { roleIdentity, type NavItem } from '../ui/roles';
import { MobileBottomSheet } from '../ui/MobileBottomSheet';
import {
  LayoutDashboard, CalendarDays, BellRing, User, LogOut,
  Route, BookOpen, Building2, Users, GraduationCap,
  FolderGit2, UsersRound, AlertTriangle, Stethoscope, ClipboardList,
  Menu as MoreIcon,
} from 'lucide-react';

interface QuickTab {
  key: string;
  label: string;
  path: string;
  icon: any;
  /** Same capability gate roles.ts attaches to this item — checked the same way Sidebar does. */
  requires?: string[];
  isActive: (pathname: string, search: string) => boolean;
}

const byQuery = (tab: string) => (p: string, s: string) => p === '/hospital' && s.includes(`tab=${tab}`);
const exact = (path: string) => (p: string) => p === path;

/** Matches a roles.ts `item.path` (which may carry its own `?query`) against
 * the current location, for nav items pulled in generically rather than
 * hand-matched above. */
function matchesNavPath(itemPath: string, pathname: string, search: string): boolean {
  const [base, query] = itemPath.split('?');
  if (pathname !== base) return false;
  return !query || search.includes(query);
}

/**
 * Four quick-access candidates per role, before capability filtering.
 *
 * Every path here is one already granted to the role in roles.ts and reachable
 * per the RoleRoute list in App.tsx — copied rather than reinvented, and cross-
 * checked against both, because a hand-typed path that drifts from either is
 * exactly how a bottom-bar tab silently 404s while the sidebar entry for the
 * same destination still works. Kept short (Home always first) because a
 * cramped bottom bar defeats the point of one; anything not listed here is one
 * tap away in "المزيد".
 */
const QUICK_TABS: Record<string, QuickTab[]> = {
  platform: [
    { key: 'home', label: 'الرئيسية', path: '/', icon: LayoutDashboard, isActive: exact('/') },
    { key: 'orgs', label: 'الجهات', path: '/organizations', icon: Building2, isActive: exact('/organizations') },
    { key: 'users', label: 'المستخدمون', path: '/users', icon: Users, isActive: exact('/users') },
    { key: 'notifications', label: 'الإشعارات', path: '/notifications', icon: BellRing, isActive: exact('/notifications') },
  ],
  cluster: [
    { key: 'home', label: 'الرئيسية', path: '/', icon: LayoutDashboard, isActive: exact('/') },
    {
      key: 'trainees', label: 'المتدربون', path: '/cluster-trainees', icon: GraduationCap,
      requires: ['allocation.cluster.auto', 'allocation.cluster.manual'], isActive: exact('/cluster-trainees'),
    },
    {
      // The bar previously pointed this at /requests, a path App.tsx never
      // registers a route for — every tap silently landed back on Home via the
      // catch-all redirect. The cluster's incoming-requests screen is
      // /affiliations?tab=incoming, the same URL the desktop sidebar uses.
      key: 'requests', label: 'الطلبات', path: '/affiliations?tab=incoming', icon: FolderGit2,
      requires: ['training_request.review'],
      isActive: (p, s) => p === '/affiliations' && s.includes('tab=incoming'),
    },
    { key: 'notifications', label: 'الإشعارات', path: '/notifications', icon: BellRing, isActive: exact('/notifications') },
  ],
  hospitalTraining: [
    { key: 'home', label: 'الرئيسية', path: '/', icon: LayoutDashboard, isActive: exact('/') },
    {
      key: 'workspace', label: 'المستشفى', path: '/hospital', icon: Stethoscope,
      requires: ['training.operate'],
      isActive: (p, s) => p === '/hospital' && !s.includes('tab='),
    },
    {
      key: 'schedules', label: 'الجداول', path: '/hospital?tab=schedules', icon: CalendarDays,
      requires: ['schedule.view'], isActive: byQuery('schedules'),
    },
    { key: 'notifications', label: 'الإشعارات', path: '/notifications', icon: BellRing, isActive: exact('/notifications') },
  ],
  hospitalAdmin: [
    { key: 'home', label: 'الرئيسية', path: '/', icon: LayoutDashboard, isActive: exact('/') },
    { key: 'members', label: 'أعضاء الجهة', path: '/org-members', icon: UsersRound, isActive: exact('/org-members') },
    { key: 'incidents', label: 'البلاغات', path: '/incidents', icon: AlertTriangle, isActive: exact('/incidents') },
    { key: 'notifications', label: 'الإشعارات', path: '/notifications', icon: BellRing, isActive: exact('/notifications') },
  ],
  trainer: [
    { key: 'home', label: 'لوحتي', path: '/', icon: Route, isActive: exact('/') },
    {
      key: 'schedules', label: 'جدولي', path: '/schedules', icon: CalendarDays,
      requires: ['schedule.view'], isActive: exact('/schedules'),
    },
    { key: 'logbook', label: 'السجل', path: '/logbook', icon: BookOpen, isActive: exact('/logbook') },
    { key: 'notifications', label: 'الإشعارات', path: '/notifications', icon: BellRing, isActive: exact('/notifications') },
  ],
  trainee: [
    { key: 'home', label: 'رحلتي', path: '/', icon: Route, isActive: exact('/') },
    {
      key: 'schedules', label: 'جدولي', path: '/schedules', icon: CalendarDays,
      requires: ['schedule.view'], isActive: exact('/schedules'),
    },
    { key: 'logbook', label: 'السجل', path: '/logbook', icon: BookOpen, isActive: exact('/logbook') },
    { key: 'notifications', label: 'الإشعارات', path: '/notifications', icon: BellRing, isActive: exact('/notifications') },
  ],
  academic: [
    { key: 'home', label: 'الرئيسية', path: '/', icon: LayoutDashboard, isActive: exact('/') },
    { key: 'graduation', label: 'التخرج', path: '/graduation', icon: GraduationCap, isActive: exact('/graduation') },
    { key: 'logbook', label: 'السجل', path: '/logbook', icon: BookOpen, isActive: exact('/logbook') },
    { key: 'notifications', label: 'الإشعارات', path: '/notifications', icon: BellRing, isActive: exact('/notifications') },
  ],
  university: [
    { key: 'home', label: 'الرئيسية', path: '/', icon: LayoutDashboard, isActive: exact('/') },
    {
      key: 'requests', label: 'طلبات التدريب', path: '/affiliations', icon: FolderGit2,
      requires: ['training_request.create', 'training_request.view'], isActive: exact('/affiliations'),
    },
    { key: 'intakes', label: 'الدفعات', path: '/intakes', icon: ClipboardList, isActive: exact('/intakes') },
    { key: 'notifications', label: 'الإشعارات', path: '/notifications', icon: BellRing, isActive: exact('/notifications') },
  ],
};

export const MobileBottomBar: React.FC = () => {
  const { primaryRole, hasAnyCapability, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const identity = roleIdentity(primaryRole);
  const canShow = (item: { requires?: string[] }) =>
    !item.requires || item.requires.length === 0 || hasAnyCapability(item.requires);

  // Same rule Sidebar.tsx applies to the desktop rail, so a tab that would 403
  // on click never renders here either.
  const candidates = QUICK_TABS[identity.key] ?? QUICK_TABS.trainee;
  let quickTabs = candidates.filter(canShow);

  // A session missing one of the curated capabilities (e.g. a cluster account
  // without allocation rights yet) would otherwise show a bar with 2-3 icons
  // and empty space either side. Backfill from the role's own full nav rather
  // than leave gaps or invent a capability-blind fallback.
  if (quickTabs.length < 3) {
    const already = new Set(quickTabs.map((t) => t.path));
    const flat = identity.nav.flatMap((s) => s.items).filter(canShow);
    for (const item of flat) {
      if (quickTabs.length >= 4) break;
      if (already.has(item.path)) continue;
      already.add(item.path);
      quickTabs.push({
        key: item.path, label: item.name, path: item.path, icon: item.icon,
        isActive: (p, s) => matchesNavPath(item.path, p, s),
      });
    }
  }
  quickTabs = quickTabs.slice(0, 4);

  const quickPaths = new Set(quickTabs.map((t) => t.path));
  const moreSections = identity.nav
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canShow(item) && !quickPaths.has(item.path)),
    }))
    .filter((section) => section.items.length > 0);

  const handleNavigate = (path: string) => {
    setMoreOpen(false);
    navigate(path);
  };

  return (
    <>
      <nav
        aria-label="شريط التنقل السفلي"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'space-around',
          zIndex: 1100,
          boxShadow: '0 -2px 10px rgba(0,0,0,0.04)',
        }}
      >
        {quickTabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.isActive(location.pathname, location.search);
          return (
            <button
              key={tab.key}
              onClick={() => handleNavigate(tab.path)}
              aria-current={active ? 'page' : undefined}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                minHeight: 48,
                padding: '6px 2px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: active ? identity.accent : '#64748B',
                fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 22, borderRadius: 11,
                backgroundColor: active ? identity.accentSoft : 'transparent',
              }}>
                <Icon size={18} strokeWidth={active ? 2.5 : 2} color={active ? identity.accent : '#64748B'} />
              </div>
              <span style={{ fontSize: 10.5, fontWeight: active ? 800 : 500, lineHeight: 1.1, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tab.label}
              </span>
            </button>
          );
        })}

        <button
          onClick={() => setMoreOpen(true)}
          aria-label="المزيد"
          aria-current={moreOpen ? 'page' : undefined}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            minHeight: 48,
            padding: '6px 2px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#64748B',
            fontFamily: 'inherit',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 22 }}>
            <MoreIcon size={18} strokeWidth={2} color="#64748B" />
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.1 }}>المزيد</span>
        </button>
      </nav>

      <MobileBottomSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={identity.label}
        subtitle={identity.tagline}
      >
        {/* Profile and sign-out live only in the Header's avatar menu on
            desktop; the avatar is still tappable on mobile, but this sheet is
            where a thumb actually is, so both are pinned here too rather than
            sent through a second menu. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          <NavLink
            to="/profile"
            onClick={() => setMoreOpen(false)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, textDecoration: 'none', color: '#0F172A', fontSize: 13, fontWeight: 700, border: '1px solid #E2E8F0' }}
          >
            <User size={16} color="#0F766E" />
            <span>الملف الشخصي</span>
          </NavLink>
          <button
            onClick={logout}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'none', border: '1px solid #FEE2E2', color: '#DC2626', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right' }}
          >
            <LogOut size={16} />
            <span>تسجيل الخروج</span>
          </button>
        </div>

        {moreSections.map((section) => (
          <div key={section.title} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.4px', padding: '0 4px 6px' }}>
              {section.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {section.items.map((item: NavItem) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.path + item.name}
                    onClick={() => handleNavigate(item.path)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 10px', borderRadius: 8, minHeight: 44,
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#334155', fontSize: 13, fontWeight: 600,
                      fontFamily: 'inherit', textAlign: 'right', width: '100%',
                    }}
                  >
                    <Icon size={16} color="#94A3B8" />
                    <span>{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </MobileBottomSheet>
    </>
  );
};
