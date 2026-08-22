import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Drawer, useMediaQuery, useTheme } from '@mui/material';
import { SidebarContent } from './Sidebar';
import { Header } from './Header';
import { MobileBottomBar } from './MobileBottomBar';

export const AppLayout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F8FAFC', direction: 'rtl' }}>
      {/* Desktop Sidebar (>= 1024px) */}
      {isDesktop ? (
        <aside style={{ width: '260px', flexShrink: 0, position: 'sticky', top: 0, height: '100vh' }}>
          <SidebarContent />
        </aside>
      ) : (
        /* Mobile / Tablet Responsive Drawer (< 1024px) */
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          PaperProps={{
            style: {
              width: 'min(280px, 85vw)',
              backgroundColor: '#FFFFFF',
              borderLeft: '1px solid #E2E8F0',
            },
          }}
        >
          <SidebarContent onItemClick={() => setMobileOpen(false)} />
        </Drawer>
      )}

      {/* Main App Container */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowX: 'hidden' }}>
        <Header onMobileMenuToggle={handleDrawerToggle} />
        <main style={{
          flex: 1,
          maxWidth: '1600px',
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
          // The bottom bar is fixed and only renders below `lg`, so only that
          // range needs room reserved beneath the content for it — this must
          // stay in lockstep with the bar's own height + safe-area calc below,
          // or the last row of every page sits half hidden behind the bar.
          paddingBottom: isDesktop ? 0 : 'calc(56px + env(safe-area-inset-bottom, 0px) + 12px)',
        }}>
          <Outlet />
        </main>
      </div>

      {/* Below `lg` (mobile + tablet, same breakpoint the sidebar already
          switches on): primary navigation. The full sidebar stays reachable
          through the header's menu button as a fallback, but it is not shown
          at the same time as this bar — this is the one always-visible nav on
          those widths, not a second copy of the drawer's content. */}
      {!isDesktop && <MobileBottomBar />}
    </div>
  );
};
