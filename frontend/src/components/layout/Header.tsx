import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Building, LogOut, User, ChevronDown, Menu as MenuIcon } from 'lucide-react';
import { Menu, MenuItem, IconButton, Avatar, Chip, useMediaQuery, useTheme } from '@mui/material';
import { NotificationCenter } from '../NotificationCenter';

interface HeaderProps {
  onMobileMenuToggle?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMobileMenuToggle }) => {
  const { user, switchOrganization, logout } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const isPlatformRole = ['platform_owner', 'system_admin', 'holding_administrator'].some(
    (r) => user?.roles?.includes(r),
  );
  const [orgAnchorEl, setOrgAnchorEl] = useState<null | HTMLElement>(null);
  const [userAnchorEl, setUserAnchorEl] = useState<null | HTMLElement>(null);

  const handleOrgClick = (event: React.MouseEvent<HTMLElement>) => {
    setOrgAnchorEl(event.currentTarget);
  };

  const handleUserClick = (event: React.MouseEvent<HTMLElement>) => {
    setUserAnchorEl(event.currentTarget);
  };

  const handleSelectOrg = async (orgId: string) => {
    setOrgAnchorEl(null);
    if (orgId !== user?.activeOrganization.id) {
      await switchOrganization(orgId);
    }
  };

  return (
    <header style={{
      height: isMobile ? '56px' : '60px',
      backgroundColor: '#FFFFFF',
      borderBottom: '1px solid #E2E8F0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: isMobile ? '0 10px' : '0 18px',
      gap: '8px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
        {/* Mobile Drawer Trigger Button */}
        {onMobileMenuToggle && (
          <IconButton
            onClick={onMobileMenuToggle}
            size="small"
            sx={{ display: { xs: 'flex', lg: 'none' }, color: '#0F766E', p: '6px' }}
            aria-label="فتح القائمة"
          >
            <MenuIcon size={20} />
          </IconButton>
        )}

        {/* Active Organization Context Switcher */}
        <button
          onClick={handleOrgClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: isMobile ? '5px 8px' : '6px 10px',
            backgroundColor: '#CCFBF1',
            border: '1px solid #99F6E4',
            borderRadius: '8px',
            color: '#0F766E',
            cursor: 'pointer',
            fontSize: isMobile ? '11.5px' : '12.5px',
            fontWeight: 700,
            transition: 'all 0.15s ease',
            minWidth: 0,
            maxWidth: isMobile ? '190px' : '360px',
            fontFamily: 'inherit',
          }}
        >
          <Building size={14} color="#0F766E" style={{ flexShrink: 0 }} />
          {!isTablet && (
            <span style={{ flexShrink: 0, color: '#0F766E' }}>
              {isPlatformRole ? 'النطاق (وطني):' : 'الجهة الحالية:'}
            </span>
          )}
          <span style={{
            color: '#0D9488', fontWeight: 800, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user?.activeOrganization?.nameAr || 'اختر الجهة'}
          </span>
          <ChevronDown size={13} color="#0F766E" style={{ flexShrink: 0 }} />
        </button>

        <Menu
          anchorEl={orgAnchorEl}
          open={Boolean(orgAnchorEl)}
          onClose={() => setOrgAnchorEl(null)}
          disableRestoreFocus
          PaperProps={{
            style: {
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              marginTop: '6px',
              minWidth: '220px',
              maxWidth: '90vw',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.08)',
            },
          }}
        >
          <div style={{ padding: '8px 14px', fontSize: '11px', color: '#64748B', fontWeight: 700 }}>
            الجهات التابعة لحسابك (Multi-Org Context)
          </div>
          {user?.availableOrganizations?.map((org) => (
            <MenuItem
              key={org.id}
              onClick={() => handleSelectOrg(org.id)}
              selected={org.id === user.activeOrganization.id}
              style={{
                fontSize: '12.5px',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{org.nameAr}</span>
              {org.id === user.activeOrganization.id && (
                <Chip label="نشط" size="small" style={{ height: '18px', fontSize: '9.5px', backgroundColor: '#CCFBF1', color: '#0F766E', fontWeight: 700 }} />
              )}
            </MenuItem>
          ))}
        </Menu>
      </div>

      {/* User Actions Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '8px', flexShrink: 0 }}>
        <NotificationCenter />

        {!isMobile && <div style={{ height: '20px', width: '1px', backgroundColor: '#E2E8F0', margin: '0 2px' }} />}

        <div
          onClick={handleUserClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            padding: '3px 6px',
            borderRadius: '8px',
          }}
        >
          <Avatar sx={{ width: isMobile ? 30 : 34, height: isMobile ? 30 : 34, bgcolor: '#0F766E', fontSize: 13, fontWeight: 700 }}>
            {user?.nameAr?.charAt(0) || 'U'}
          </Avatar>
          {!isTablet && (
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, maxWidth: 160 }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.nameAr || 'المستخدم'}
              </span>
              <span style={{ fontSize: '10.5px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </span>
            </div>
          )}
          {!isMobile && <ChevronDown size={13} color="#64748B" />}
        </div>

        <Menu
          anchorEl={userAnchorEl}
          open={Boolean(userAnchorEl)}
          onClose={() => setUserAnchorEl(null)}
          disableRestoreFocus
          PaperProps={{
            style: {
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              marginTop: '6px',
              minWidth: '180px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.08)',
            },
          }}
        >
          <MenuItem
            onClick={() => {
              setUserAnchorEl(null);
              navigate('/profile');
            }}
            style={{ fontSize: '12.5px', color: '#0F172A', display: 'flex', gap: '8px', fontWeight: 700, padding: '8px 14px' }}
          >
            <User size={15} color="#0F766E" />
            <span>الملف الشخصي</span>
          </MenuItem>
          <MenuItem onClick={logout} style={{ fontSize: '12.5px', color: '#DC2626', display: 'flex', gap: '8px', fontWeight: 700, padding: '8px 14px' }}>
            <LogOut size={15} />
            <span>تسجيل الخروج</span>
          </MenuItem>
        </Menu>
      </div>
    </header>
  );
};
