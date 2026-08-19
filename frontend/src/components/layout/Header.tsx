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
  // Below `sm` the header only has room for the essentials: menu, org switcher
  // (name only) and the avatar. Labels and the email are dropped rather than
  // allowed to wrap or clip.
  const isCompact = useMediaQuery(theme.breakpoints.down('sm'));
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
      height: '72px',
      backgroundColor: '#FFFFFF',
      borderBottom: '1px solid #E2E8F0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      gap: '8px',
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
        {/* Mobile Drawer Trigger Button */}
        {onMobileMenuToggle && (
          <IconButton
            onClick={onMobileMenuToggle}
            sx={{ display: { xs: 'flex', lg: 'none' }, color: '#0F766E' }}
            aria-label="فتح القائمة"
          >
            <MenuIcon size={22} />
          </IconButton>
        )}

        {/* Active Organization Context Switcher */}
        <button
          onClick={handleOrgClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#CCFBF1',
            border: '1px solid #99F6E4',
            borderRadius: '12px',
            color: '#0F766E',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 700,
            transition: 'all 0.15s ease',
            minWidth: 0,
            maxWidth: '100%',
            fontFamily: 'inherit',
          }}
        >
          <Building size={16} color="#0F766E" style={{ flexShrink: 0 }} />
          {!isCompact && (
            <span style={{ flexShrink: 0 }}>
              {/* Platform-level roles are national by default — their "home"
                  organisation is only a display/switch anchor, never a scope
                  filter, so the label must not read as "your organisation".
                  Showing it unqualified was what made a platform_owner whose
                  home org happens to be a cluster look cluster-scoped, even
                  though every list/KPI on the page was actually national. */}
              {isPlatformRole ? 'النطاق (وطني) — الجهة النشطة:' : 'الجهة الحالية:'}
            </span>
          )}
          <span style={{
            color: '#0D9488', fontWeight: 800, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user?.activeOrganization?.nameAr || 'اختر الجهة'}
          </span>
          <ChevronDown size={14} color="#0F766E" style={{ flexShrink: 0 }} />
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
              borderRadius: '12px',
              marginTop: '8px',
              minWidth: '240px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            },
          }}
        >
          <div style={{ padding: '8px 16px', fontSize: '11px', color: '#64748B', fontWeight: 700 }}>
            الجهات التابعة لحسابك (Multi-Org Context)
          </div>
          {user?.availableOrganizations?.map((org) => (
            <MenuItem
              key={org.id}
              onClick={() => handleSelectOrg(org.id)}
              selected={org.id === user.activeOrganization.id}
              style={{
                fontSize: '13px',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{org.nameAr}</span>
              {org.id === user.activeOrganization.id && (
                <Chip label="نشط" size="small" style={{ height: '20px', fontSize: '10px', backgroundColor: '#CCFBF1', color: '#0F766E', fontWeight: 700 }} />
              )}
            </MenuItem>
          ))}
        </Menu>
      </div>

      {/* User Actions Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <NotificationCenter />

        {!isCompact && <div style={{ height: '24px', width: '1px', backgroundColor: '#E2E8F0', margin: '0 4px' }} />}

        <div
          onClick={handleUserClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '10px',
          }}
        >
          <Avatar sx={{ width: 36, height: 36, bgcolor: '#0F766E', fontSize: 14, fontWeight: 700 }}>
            {user?.nameAr?.charAt(0) || 'U'}
          </Avatar>
          {!isCompact && (
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, maxWidth: 180 }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.nameAr || 'المستخدم'}
              </span>
              <span style={{ fontSize: '11px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </span>
            </div>
          )}
          {!isCompact && <ChevronDown size={14} color="#64748B" />}
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
              borderRadius: '12px',
              marginTop: '8px',
              minWidth: '200px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            },
          }}
        >
          <MenuItem
            onClick={() => {
              setUserAnchorEl(null);
              navigate('/profile');
            }}
            style={{ fontSize: '13px', color: '#0F172A', display: 'flex', gap: '8px', fontWeight: 700 }}
          >
            <User size={16} color="#0F766E" />
            <span>الملف الشخصي</span>
          </MenuItem>
          <MenuItem onClick={logout} style={{ fontSize: '13px', color: '#DC2626', display: 'flex', gap: '8px', fontWeight: 700 }}>
            <LogOut size={16} />
            <span>تسجيل الخروج</span>
          </MenuItem>
        </Menu>
      </div>
    </header>
  );
};
