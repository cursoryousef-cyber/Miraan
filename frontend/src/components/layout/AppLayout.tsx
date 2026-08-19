import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Drawer, Box, useMediaQuery, useTheme } from '@mui/material';
import { SidebarContent } from './Sidebar';
import { Header } from './Header';

export const AppLayout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      {/* Desktop Sidebar (>= 1024px) */}
      {isDesktop ? (
        <aside style={{ width: '280px', flexShrink: 0 }}>
          <SidebarContent />
        </aside>
      ) : (
        /* Mobile / Tablet Responsive Drawer (< 1024px) */
        <Drawer
          variant="temporary"
          anchor="right"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          PaperProps={{
            style: {
              width: '280px',
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
          padding: '24px',
          maxWidth: '1600px',
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
